import { loadMod } from './loader.js';

const AUDIO = Symbol('audio');
const GAIN = Symbol('gain');
const WORKLET = Symbol('worklet');
const ROW_CALLBACKS = Symbol('rowCallbacks');
const SINGLE_CALLBACKS = Symbol('singleCallbacks');

export class ModPlayer {
    constructor() {
        this.mod = null;
        this.playing = false;
        this[AUDIO] = null;
        this[GAIN] = null;
        this[WORKLET] = null;
        this[ROW_CALLBACKS] = [];
        this[SINGLE_CALLBACKS] = { };
    }

    async load(url) {
        if (this.worklet) this.unload();
        if (this.playing) this.stop();

        this.mod = await loadMod(url);
        this[AUDIO] = new AudioContext();
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
        }
    }

    watchRows(callback) {
        this[WORKLET].port.postMessage({
            type: 'enableRowSubscription'
        });
        this[ROW_CALLBACKS].push(callback);
    }

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
    }

    async play() {
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

    stop() {
        if (!this.playing) return;

        this[WORKLET].port.postMessage({
            type: 'stop'
        });

        this.playing = false;
    }

    resume() {
        if (this.playing) return;

        this[WORKLET].port.postMessage({
            type: 'resume'
        });

        this.playing = true;
    }

    setRow(position, row) {
        this[WORKLET].port.postMessage({
            type: 'setRow',
            position: position,
            row: row
        });
    }

    setVolume(volume) {
        this[GAIN].gain.value = volume;
    }
}
