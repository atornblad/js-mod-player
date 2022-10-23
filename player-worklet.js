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

// Keeps track of effects that are not handled by the player
const debuggedEffects = {};

const HALF_NOTE_STEP = Math.pow(2, 1 / 12);
const halfNoteSteps = (halfNotes) => Math.pow(2, halfNotes / 12);
const watchComparer = (a, b) => {
    if (a.songPos < b.songPos) return -1;
    if (a.songPos > b.songPos) return 1;
    if (a.row < b.row) return -1;
    if (a.row > b.row) return 1;
    return 0;
};

/// The PlayerWorklet class
class PlayerWorklet extends AudioWorkletProcessor {
    constructor(options) {
        super(options);

        this.time = 0;
        this.playPosted = false;
        this.watches = [];
        this.watchRows = false;
        this.nextWatchIndex = 0;
        this.nextWatch = null;

        this.channels = [ {
            instr: null,
            at: 0,
            period: 0,
            effect: 0,
            volume: 0,
            vibrato: { notes : 0, speed : 0, active : true },
            volSlide: { speed: 0, effect: 0 },
            noteSlide: { speed: 0, target: null, active : false },
            retrigger: null,
            delay: null,
            arpeggio: null
        }, {
            instr: null,
            at: 0,
            period: 0,
            effect: 0,
            volume: 0,
            vibrato: { notes : 0, speed : 0, active : true },
            volSlide: { speed: 0, effect: 0 },
            noteSlide: { speed: 0, target: null, active : false },
            retrigger: null,
            delay: null,
            arpeggio: null
        }, {
            instr: null,
            at: 0,
            period: 0,
            effect: 0,
            volume: 0,
            vibrato: { notes : 0, speed : 0, active : true },
            volSlide: { speed: 0, effect: 0 },
            noteSlide: { speed: 0, target: null, active : false },
            retrigger: null,
            delay: null,
            arpeggio: null
        }, {
            instr: null,
            at: 0,
            period: 0,
            effect: 0,
            volume: 0,
            vibrato: { notes : 0, speed : 0, active : true },
            volSlide: { speed: 0, effect: 0 },
            noteSlide: { speed: 0, target: null, active : false },
            retrigger: null,
            delay: null,
            arpeggio: null
        } ];
        this.port.onmessage = this.onmessage.bind(this);
    }

    onmessage(e) {
        const { sampleRate, data, command } = e.data;
        if (sampleRate) {
            this.sampleRate = sampleRate;
            this.rate = 7093789.2 / (this.sampleRate * 2);
        }
        if (data) {
            this.data = data;
            this.nextSongPos = 0;
            this.songLength = data.length;
            this.nextRowIndex = 0;
            this.bpm = 125;
            this.samplesPerTick = (this.sampleRate * 60) / (this.bpm * 4) / 6;
            this.nextTickAfter = 0;
            this.tick = -1;
            this.ticksPerRow = 6;
        }
        switch (command) {
            case 'load':
                // Null command. Just check the sampleRate and data properties.
                this.playing = false;
                this.port.postMessage({event: 'loaded'});
                break;
            case 'play':
                this.watches.sort(watchComparer);
                this.nextSongPos = 0;
                this.nextRowIndex = 0;
                this.bpm = 125;
                this.samplesPerTick = (this.sampleRate * 60) / (this.bpm * 4) / 6;
                this.nextTickAfter = 0;
                this.tick = -1;
                this.ticksPerRow = 6;
                this.nextWatchIndex = 0;
                this.nextWatch = this.watches[this.nextWatchIndex];
                this.playing = true;
                this.port.postMessage({event: 'playing'});
                break;
            case 'stop':
                this.playing = false;
                this.port.postMessage({event: 'stopped'});
                break;
            case 'resume':
                this.playing = true;
                this.port.postMessage({event: 'resumed'});
                break;
            case 'watch':
                let { songPos, row, name } = e.data;
                songPos = songPos || 0;
                row = row || 0;
                name = name || 'default';
                this.watches.push({ songPos, row, name });
                break;
            case 'watchRows':
                this.watchRows = true;
                break;
            case 'setpos':
                this.nextSongPos = e.data.songPos;
                this.nextRowIndex = 0;
                this.tick = -1;
        }
    }

    nextTick() {
        ++this.tick;
        if (this.tick >= this.ticksPerRow) {
            this.tick = 0;
        }

        if (this.tick == 0) {
            if (!this.nextRow()) return false;
        }
        this.nextTickAfter += this.samplesPerTick;

        for (let ch of this.channels) {
            ch.volSlide.effect += ch.volSlide.speed;
            if (ch.noteSlide.active) {
                if (ch.noteSlide.target) {
                    if (ch.noteSlide.target > ch.period) {
                        let newPeriod = ch.period * halfNoteSteps(ch.noteSlide.speed / 12);
                        if (newPeriod > ch.noteSlide.target) {
                            newPeriod = ch.noteSlide.target;
                            ch.noteSlide.active = false;
                            ch.noteSlide.speed = 0;
                        }
                        ch.period = newPeriod;
                    }
                    else {
                        let newPeriod = ch.period * halfNoteSteps(-ch.noteSlide.speed / 12);
                        if (newPeriod < ch.noteSlide.target) {
                            newPeriod = ch.noteSlide.target;
                            ch.noteSlide.active = false;
                            ch.noteSlide.speed = 0;
                        }
                        ch.period = newPeriod;
                    }
                }
                else {
                    const newPeriod = ch.period * halfNoteSteps(ch.noteSlide.speed / 12);
                    ch.period = newPeriod;
                }
            }
            if (ch.retrigger && ((this.tick % ch.retrigger) == 0)) {
                ch.at = 0;
            }
            else if (ch.delay && this.tick == ch.delay) {
                ch.at = 0;
            }
            if (ch.arpeggio) {
                const halfNotes = ch.arpeggio.offsets[this.tick % 3];
                ch.arpeggio.period = ch.period / halfNoteSteps(halfNotes);
            }
        }
        return true;
    }

    nextRow() {
        if (this.nextSongPos == this.songLength) {
            return false;
        }

        const patternIndex = this.data.patternIndices[this.nextSongPos];
        const pattern = this.data.patterns[patternIndex];
        const row = pattern[this.nextRowIndex];

        const now = { songPos: this.nextSongPos, row: this.nextRowIndex };

        if (this.watchRows) {
            this.port.postMessage({
                event: 'watch',
                name: '$row',
                songPos : this.nextSongPos,
                row : this.nextRowIndex
            });
        }

        while (this.nextWatch && watchComparer(this.nextWatch, now) < 0) {
            ++this.nextWatchIndex;
            this.nextWatch = this.watches[this.nextWatchIndex];
        }

        while (this.nextWatch && watchComparer(this.nextWatch, now) === 0) {
            this.port.postMessage({
                event: 'watch',
                name: this.nextWatch.name,
                songPos : this.nextSongPos,
                row : this.nextRowIndex
            });
            ++this.nextWatchIndex;
            this.nextWatch = this.watches[this.nextWatchIndex];
        }

        this.nextRowIndex++;
        if (this.nextRowIndex == 64) {
            this.nextRowIndex = 0;
            this.nextSongPos++;
        }

        for (let i = 0; i < 4; ++i) {
            const ch = this.channels[i];
            const period = row[i].period;
            const effect = row[i].effect;
            let command = effect >> 8;
            let data = effect & 0xff;
            let upper = (data & 0xf0) >> 4;
            const lower = data & 0x0f;
            if (command == 0xe) {
                command = 0xe0 | upper;
                data = lower;
                upper = 0;
            }

            if (row[i].instr) {
                const instr = this.data.instruments[row[i].instr - 1];
                ch.instr = instr;
                if (command == 0xed) {
                    ch.at = instr.length;
                }
                else if (command != 0x3) {
                    ch.at = 0;
                }
                ch.volume = instr.volume;
                ch.volSlide.effect = 0;
            }

            ch.noteSlide.active = false;
            if (period) {
                if (command == 0x3) {
                    ch.noteSlide.speed = data;
                    ch.noteSlide.target = period;
                    ch.noteSlide.active = true;
                }
                else {
                    ch.period = period;
                    if (command != 0x5) {
                        ch.at = 0;
                    }
                }
            }

            ch.vibrato.active = false;
            ch.volSlide.speed = 0;
            ch.retrigger = null;
            ch.delay = null;
            ch.arpeggio = null;
            if (effect) {
                switch (command) {
                    case 0x0:
                        // 0: Arpeggio
                        ch.arpeggio = { offsets: [0, upper, lower], period: ch.period };
                        break;
                    case 0x1:
                        // 1: Slide up (Portamento Up)
                        ch.noteSlide.active = true;
                        ch.noteSlide.target = null;
                        ch.noteSlide.speed = -data;
                        break;
                    case 0x2:
                        // 2: Slide down (Portamento Down)
                        ch.noteSlide.active = true;
                        ch.noteSlide.target = null;
                        ch.noteSlide.speed = data;
                        break;
                    case 0x3:
                        // 3: Slide to note
                        // Parts are handled above!
                        if (!period) {
                            ch.noteSlide.active = true;
                        }
                        break;
                    case 0x4:
                        // 4: Vibrato
                        ch.vibrato.active = true;
                        if (upper) ch.vibrato.notes = lower;
                        if (lower) ch.vibrato.speed = upper;
                        break;
                    case 0x5:
                        // 5: Continue effect 3:'Slide to note', but also do Volume slide
                        ch.noteSlide.active = true;
                        if (upper) ch.volSlide.speed = upper;
                        if (lower) ch.volSlide.speed = -lower;
                        break;
                    case 0x6:
                        // 6: Continue effect 4:'Vibrato', but also do Volume slide
                        ch.vibrato.active = true;
                        if (upper) ch.volSlide.speed = upper;
                        if (lower) ch.volSlide.speed = -lower;
                        break;
                    case 0x9:
                        // 9: Set sample offset
                        ch.at = data * 256;
                        break;
                    case 0xa:
                        // A: Volume slide
                        if (upper) ch.volSlide.speed = upper;
                        if (lower) ch.volSlide.speed = -lower;
                        break;
                    case 0xb:
                        // B: Position Jump
                        this.nextRowIndex = 0;
                        this.nextSongPos = data & 0x7f;
                        break;
                    case 0xc:
                        // C: Set volume
                        ch.volume = data;
                        break;
                    case 0xd:
                        // D: Pattern Break
                        if (this.nextRowIndex != 0) {
                            this.nextSongPos++;
                        }
                        this.nextRowIndex = (upper >> 4) * 10 + lower;
                        break;
                    case 0xe9:
                        // E9: Retrigger sample
                        ch.retrigger = data;
                        break;
                    case 0xed:
                        // ED: Delay sample
                        // Handled in part above!
                        ch.delay = data;
                        break;
                    case 0xf:
                        // F: Set speed
                        if (data <= 31) {
                            this.ticksPerRow = data;
                        }
                        else {
                            this.bpm = data;
                            this.samplesPerTick = (this.sampleRate * 60) / (this.bpm * 4) / 6;
                        }
                        break;
                    default:
                        // Unhandled effects are logged (once) and ignored.
                        const key = command.toString(16);
                        if (!(key in debuggedEffects)) {
                            debuggedEffects[key] = true;
                            console.log(`Unhandled effect ${key}`);
                        }
                }
            }
        }
        return true;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channel = output[0];

        if (!this.playing) {
            for (let i = 0; i < channel.length; ++i) channel[i] = 0.0;
            return true;
        }

        for (let i = 0; i < channel.length; ++i) {
            if (this.nextTickAfter <= 0) {
                if (!this.nextTick()) {
                    this.port.postMessage({
                        event: 'stop'
                    });
                    return false;
                }
            }
            this.nextTickAfter--;
            let value = 0.0;

            for (let c = 0; c < 4; ++c) {
                const ch = this.channels[c];
                if (!ch) continue;
                if (!ch.instr) continue;
                if (ch.at >= ch.instr.length) continue;
                const vol = Math.min(64, Math.max(0, ch.volume + ch.volSlide.effect)) / 64;
                value += ch.instr.samples[ch.at | 0] * vol / 256;
                const period = ch.arpeggio ? ch.arpeggio.period : ch.period;
                let atStep = this.rate / (period - ch.instr.fineTune);
                if (ch.vibrato.active) {
                    // Not completely sure about this, but it sounds okay for now.
                    atStep *= (1 + (Math.sin(this.time * ch.vibrato.speed * this.bpm * 6) * (halfNoteSteps(ch.vibrato.notes / 12) - 1)));
                }
                ch.at += atStep;
                if (ch.instr.repeat) {
                    if (ch.at >= ch.instr.repeat.start + ch.instr.repeat.length) {
                        ch.at -= ch.instr.repeat.length;
                    }
                }
            }
            channel[i] = Math.tanh(value);
        }
        this.time += 1 / this.sampleRate;
        return true;
    }
}   

registerProcessor('player-worklet', PlayerWorklet);
