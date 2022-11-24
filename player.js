import { loadMod } from './loader.js';

export class ModPlayer {
    constructor() {
        this.mod = null;
        this.audio = null;
        this.worklet = null;
        this.playing = false;
        this.rowCallbacks = [];
        this.singleCallbacks = { };
    }

    async load(url) {
        if (this.worklet) this.unload();
        if (this.playing) this.stop();

        this.mod = await loadMod(url);
        this.audio = new AudioContext();
        await this.audio.audioWorklet.addModule('./player-worklet.js');
        this.worklet = new AudioWorkletNode(this.audio, 'player-worklet');
        this.worklet.connect(this.audio.destination);

        this.worklet.port.onmessage = this.onmessage.bind(this);
    }

    onmessage(event) {
        const { data } = event;
        switch (data.type) {
            case 'row':
                // Call all the general row callbacks
                for (let callback of this.rowCallbacks) {
                    callback(data.position, data.rowIndex);
                }

                // Call all the single row callbacks
                const key = data.position + ':' + data.rowIndex;
                if (this.singleCallbacks[key]) {
                    for (let callback of this.singleCallbacks[key]) {
                        callback(data.position, data.rowIndex);
                    }
                }
                break;
        }
    }

    watchRows(callback) {
        this.worklet.port.postMessage({
            type: 'enableRowSubscription'
        });
        this.rowCallbacks.push(callback);
    }

    watch(position, row, callback) {
        this.worklet.port.postMessage({
            type: 'enableRowSubscription'
        });
        
        // Store the callback in a dictionary
        const key = position + ':' + row;

        // There can be multiple callbacks for the same position and row
        // so we store them in an array
        if (!this.singleCallbacks[key]) {
            this.singleCallbacks[key] = [];
        }

        // Add the callback to the array
        this.singleCallbacks[key].push(callback);
    }

    unload() {
        if (this.playing) this.stop();
        if (!this.worklet) return;

        this.worklet.disconnect();
        this.audio.close();

        this.mod = null;
        this.audio = null;
        this.worklet = null;
        this.rowCallbacks = [];
        this.singleCallbacks = { };
    }

    async play() {
        if (this.playing) return;
        if (!this.worklet) return;

        //this.audio.resume();
        this.worklet.port.postMessage({
            type: 'play',
            mod: this.mod,
            sampleRate: this.audio.sampleRate
        });

        this.playing = true;
    }

    async stop() {
        if (!this.playing) return;

        this.worklet.port.postMessage({
            type: 'stop'
        });

        this.playing = false;
    }

    async resume() {
        if (this.playing) return;

        this.worklet.port.postMessage({
            type: 'resume'
        });

        this.playing = true;
    }

    setRow(position, row) {
        this.worklet.port.postMessage({
            type: 'setRow',
            position: position,
            row: row
        });
    }
}
