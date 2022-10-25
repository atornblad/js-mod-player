/**
 * Author: Anders Marzi Tornblad
 * Date: 2022-10-23
 * License: Creative Commons Attribution-NonCommercial 4.0 International License
 * 
 * This is a JavaScript implementation of the ProTracker MOD file format.
 * 
 * The implementation is based on modern JavaScript, the Web Audio API, and
 * the AudioWorklet API.
 * 
 * Source materials:
 * - https://www.ocf.berkeley.edu/~eek/index.html/tiny_examples/ptmod/ap12.html
 * - https://qooiii.blogspot.com/2016/07/simple-amiga-mod-file-player-effects.html
 * - http://lclevy.free.fr/mo3/mod.txt
 * - https://www.eblong.com/zarf/blorb/mod-spec.txt
 */

/// Gets a string from an array buffer
const getString = (data, offset, maxLength) => {
    const view = new Uint8Array(data, offset, maxLength);
    const str = [];
    for (let i = 0; i < maxLength && view[i] > 0; ++i) {
        str.push(String.fromCharCode(view[i]));
    }
    return str.join('');
}

/// Gets an unsigned 16-bit integer from an array buffer
const getUint16 = (data, offset) => {
    const view = new Uint8Array(data, offset, 2);
    // Big-endian
    return view[0] * 256 + view[1];
}

/// Gets an unsigned 8-bit integer from an array buffer
const getUint8 = (data, offset) => {
    const view = new Uint8Array(data, offset, 1);
    return view[0];
}

/// Gets a Uint8Array from an array buffer
const getUint8Array = (data, offset, length) => {
    const view = new Uint8Array(data, offset, length);
    return Array.from(view);
}

/// Gets an Int8Array from an array buffer
const getInt8Array = (data, offset, length) => {
    const view = new Int8Array(data, offset, length);
    return Array.from(view);
}

/// Gets a signed 4-bit integer from an array buffer
const getInt4 = (data, offset) => {
    const view = new Uint8Array(data, offset, 1);
    const byteValue = view[0];
    if (byteValue & 0x08) {
        return (byteValue & 0x0f) - 0x10;
    }
    else {
        return byteValue & 0x0f;
    }
}

/// Creates a pattern from a Uint8Array
const makePattern = (rawData) => {
    const ticks = [];
    let i = 0;
    for (let row = 0; row < 64; ++row) {
        const notes = [];
        for (let note = 0; note < 4; ++note) {
            const instrNumber = (rawData[i] & 0xf0) | ((rawData[i + 2] & 0xf0) >> 4);
            const notePeriod = ((rawData[i] & 0x0f) << 8) | rawData[i + 1];
            const effectCommand = ((rawData[i + 2] & 0x0f) << 8) | rawData[i + 3];
            i += 4;
            notes.push({instr: instrNumber, period: notePeriod, effect: effectCommand});
        }
        ticks.push(notes);
    }
    return ticks;
};

/// Fetches a MOD file from a URL, and creates a player
export const jsModPlayer = async (url) => {
    // Fetch the MOD file
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`ModTracker Could not fetch ${url}: ${response.status}`)
    }
    const data = await response.arrayBuffer();

    // Magic string 'M.K.' at offset 0x438
    if (data.byteLength < 0x43c) {
        throw new Error(`${url} is not a real MOD file`);
    }
    const magicCheck = new Uint32Array(data, 0x438, 1)[0];
    if (magicCheck != 0x2e4b2e4d) {
        throw new Error(`${url} is not a real MOD file`);
    }

    // The name of the song
    const songName = getString(data, 0, 20);

    // Up to 32 instruments
    let instrumentCount = 0;
    const instruments = [];
    for (let i = 0; i < 31; ++i) {
        const instrStart = 20 + 30 * i;
        const instrName = getString(data, instrStart, 22);
        const sampleLength = getUint16(data, instrStart + 22) * 2;
        const fineTune = getInt4(data, instrStart + 24);
        const volume = getUint8(data, instrStart + 25);
        const repeatPoint = getUint16(data, instrStart + 26) * 2;
        const repeatLength = getUint16(data, instrStart + 28) * 2;
        instruments.push({
            name: instrName,
            length: sampleLength,
            fineTune: fineTune,
            volume: Math.min(64, Math.max(0, volume)),
            repeat: (repeatLength && (repeatPoint != 0 || repeatLength != 2)) ? { start: repeatPoint, length: repeatLength } : null
        });
        if (sampleLength) ++instrumentCount;
    }

    // Some metadata
    const songLength = getUint8(data, 950);
    const repeat = getUint8(data, 951);
    const songPositions = getUint8Array(data, 952, 128);
    const maxPatternId = Math.max(...songPositions);
    const patterns = [];

    // The pattern data
    for (let i = 0; i <= maxPatternId; ++i) {
        const patternRawData = getUint8Array(data, 1084 + 1024 * i, 1024);
        const pattern = makePattern(patternRawData);
        patterns.push(pattern);
    }

    // Samples are single-channel signed 8-bit data
    let instrStart = 1084 + 1024 * patterns.length;
    for (let instr of instruments) {
        if (instr.length) {
            instr.samples = getInt8Array(data, instrStart, instr.length);
            instrStart += instr.length;
        }
    }
    
    // State variables, audio context, worklet, and callbacks
    let playing = false;
    let loaded = false;
    let audio = null;
    let processor = null;
    let processorConnected = false;
    const callbacks = {};
    const watchRowsCallbacks = [];

    const workletData = {
        instruments : instruments,
        instrumentCount : instrumentCount,
        length : songLength,
        repeat : repeat,
        patternIndices : songPositions,
        maxPatternId : maxPatternId,
        patterns: patterns
    };

    // Tell the worklet to load the song
    const load = async () => {
        if (!audio) {
            audio = new AudioContext();
            await audio.audioWorklet.addModule('./player-worklet.js');
            processor = new AudioWorkletNode(audio, 'player-worklet');
            processor.port.onmessage = (e) => {
                switch (e.data.event) {
                    case 'watch':
                        const { name, songPos, row, tick } = e.data;
                        if (name === '$row') {
                            for (let callback of watchRowsCallbacks) {
                                callback(songPos, row, tick);
                            }
                        }
                        else if (callbacks[name]) {
                            callbacks[name](songPos, row, tick);
                        }
                        break;
                }
            }
            const gain = audio.createGain();
            gain.gain.setValueAtTime(0.5, 0);
            processor.connect(gain).connect(audio.destination);
            processorConnected = true;
        }
        processor.port.postMessage({
            command: 'load',
            sampleRate: audio.sampleRate,
            data: workletData
        });
        loaded = true;
        playing = false;
    };

    // Allows the caller to register a callback for a specific row
    const watch = (name, songPos, row, callback) => {
        if (!processor) {
            throw new Error('ModTracker not loaded');
        }
        if (!callbacks[name]) {
            callbacks[name] = callback;
        }
        processor.port.postMessage({
            command: 'watch',
            name: name,
            songPos: songPos,
            row: row
        });
    };

    // Allows the caller to register a callback for every row
    const watchRows = (callback) => {
        if (!processor) {
            throw new Error('ModTracker not loaded');
        }
        if (watchRowsCallbacks.length === 0) {
            processor.port.postMessage({
                command: 'watchRows'
            })
        }
        watchRowsCallbacks.push(callback);
    }

    // Tell the worklet to start playing
    const play = async () => {
        if (playing) return;
        if (!loaded) await this.load();

        if (audio.state !== 'running') {
            audio.resume();
        }

        processor.port.postMessage({
            command: 'play'
        });
        playing = true;
    };

    // Tell the worklet to stop/pause playing
    const stop = () => {
        if (!playing) return;
        processor.port.postMessage({
            command: 'stop'
        });
        playing = false;
    };

    // Tell the worklet to resume playing
    const resume = () => {
        if (playing) return;
        processor.port.postMessage({
            command: 'resume'
        });
        playing = true;
    };

    // Tell the worklet to move to a specific pattern
    const setSongPosition = async (songPos) => {
        if (!playing) return;
        processor.port.postMessage({
            command: 'setpos',
            songPos: songPos
        });
    };

    return {
        ...workletData,
        name : songName,
        songLength : songLength,
        load : load,
        watch : watch,
        watchRows : watchRows,
        play : play,
        stop : stop,
        resume : resume,
        setSongPosition : setSongPosition
    }
};
