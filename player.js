import { loadMod } from './loader.js';

const AUDIO = Symbol('audio');
const GAIN = Symbol('gain');
const WORKLET = Symbol('worklet');
const ROW_CALLBACKS = Symbol('rowCallbacks');
const SINGLE_CALLBACKS = Symbol('singleCallbacks');
const STOP_CALLBACKS = Symbol('stopCallbacks');
const ALL_NOTES_CALLBACKS = Symbol('allNotesCallbacks');

const range = function* (min, max) {
    for (let i = min; i <= max; ++i) {
        yield i;
    }
};

const map = function* (iterator, func) {
    for (let i of iterator) {
        yield func(i);
    }
}

const notePerPeriod = [...map(range(0, 65535), p => 
    p < 124 ? null :
    24 + Math.round(12 * Math.log2(428 / p))
)];

export class ModPlayer {
    constructor(audioContext) {
        this.mod = null;
        this.playing = false;
        this[AUDIO] = audioContext || null;
        this[GAIN] = null;
        this[WORKLET] = null;
        this[ROW_CALLBACKS] = [];
        this[SINGLE_CALLBACKS] = { };
        this[STOP_CALLBACKS] = [];
        this[ALL_NOTES_CALLBACKS] = [];
    }

    /// Loads an Amiga ProTracker MOD filed from a given url
    async load(url) {
        if (this[WORKLET]) this.unload();

        this.mod = await loadMod(url);
        if (!this[AUDIO]) this[AUDIO] = new AudioContext();
        this[GAIN] = this[AUDIO].createGain();
        this[GAIN].gain.value = 0.3;
        await this[AUDIO].audioWorklet.addModule('./mod-player-worklet.js');
        this[WORKLET] = new AudioWorkletNode(this[AUDIO], 'mod-player-worklet');
        this[WORKLET].connect(this[GAIN]).connect(this[AUDIO].destination);

        this[WORKLET].port.onmessage = this.onmessage.bind(this);
    }

    onmessage(event) {
        const { data } = event;
        switch (data.type) {
            case 'row':
                // Call all the general row callbacks
                for (let callback of this[ROW_CALLBACKS]) {
                    callback(data.position, data.rowIndex);
                }

                // Call all the single row callbacks
                const key = data.position + ':' + data.rowIndex;
                if (key in this[SINGLE_CALLBACKS]) {
                    for (let callback of this[SINGLE_CALLBACKS][key]) {
                        callback(data.position, data.rowIndex);
                    }
                }
                break;
            case 'stop':
                for (let callback of this[STOP_CALLBACKS]) {
                    callback();
                }
                break;
            case 'note':
                for (let callback of this[ALL_NOTES_CALLBACKS]) {
                    callback({
                        channel: data.channel,
                        sample: data.sample,
                        volume: data.volume,
                        note: notePerPeriod[data.period]
                    });
                }
                break;
        }
    }

    /// Subscribes to all rows
    /// The position is the index of the 64-row block of music data
    /// The row is the row index within that block
    /// The callback for watchRows must have the following signature:
    /// callbackFunc(position,row)
    watchRows(callback) {
        this[WORKLET].port.postMessage({
            type: 'enableRowSubscription'
        });
        this[ROW_CALLBACKS].push(callback);
    }

    /// Subscribes to a single row
    /// The callback for watch must have the following signature:
    /// callbackFunc()
    watch(position, row, callback) {
        this[WORKLET].port.postMessage({
            type: 'enableRowSubscription'
        });
        
        // Store the callback in a dictionary
        const key = position + ':' + row;

        // There can be multiple callbacks for the same position and row
        // so we store them in an array
        if (!(key in this[SINGLE_CALLBACKS])) {
            this[SINGLE_CALLBACKS][key] = [];
        }

        // Add the callback to the array
        this[SINGLE_CALLBACKS][key].push(callback);
    }

    /// Subscribes to when music stops playing
    /// The callback for watch must have the following signature:
    /// callbackFunc()
    watchStop(callback) {
        this[WORKLET].port.postMessage({
            type: 'enableStopSubscription'
        });
        this[STOP_CALLBACKS].push(callback);
    }

    /// Subscribes to all individual notes starting
    /// The callback for watchNotes must have the following signature:
    /// callbackFunc( { channel: 1..4, sample: 1..32, volume: 1..64, note: -63..45 } )
    watchNotes(callback) {
        this[WORKLET].port.postMessage({
            type: 'enableNoteSubscription'
        });
        this[ALL_NOTES_CALLBACKS].push(callback);
    }

    /// Unloads a MOD file and removes all subscriptions
    unload() {
        if (this.playing) this.stop();
        if (!this[WORKLET]) return;

        this[WORKLET].disconnect();
        this[AUDIO].close();

        this.mod = null;
        this[AUDIO] = null;
        this[WORKLET] = null;
        this[ROW_CALLBACKS] = [];
        this[SINGLE_CALLBACKS] = { };
        this[ALL_NOTES_CALLBACKS] = [ ];
    }

    /// Starts the playback of a MOD file from position 0, row 0
    play() {
        if (this.playing) return;
        if (!this[WORKLET]) return;

        this[AUDIO].resume();
        this[WORKLET].port.postMessage({
            type: 'play',
            mod: this.mod,
            sampleRate: this[AUDIO].sampleRate
        });

        this.playing = true;
    }

    /// Stops the playback
    stop() {
        if (!this.playing) return;

        this[WORKLET].port.postMessage({
            type: 'stop'
        });

        this.playing = false;
    }

    /// Resumes the playback of a MOD file from the last stop() positio
    resume() {
        if (this.playing) return;

        this[WORKLET].port.postMessage({
            type: 'resume'
        });

        this.playing = true;
    }

    /// Immediately jumps to a specific position and row
    setRow(position, row) {
        this[WORKLET].port.postMessage({
            type: 'setRow',
            position: position,
            row: row
        });
    }

    /// Sets the playback volume
    setVolume(volume) {
        this[GAIN].gain.value = volume;
    }
}
