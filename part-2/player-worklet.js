class PlayerWorklet extends AudioWorkletProcessor {
    constructor() {
        super();
        this.port.onmessage = this.onmessage.bind(this);
        this.sample = null;
        this.index = 0;
    }

    onmessage(e) {
        if (e.data.type === 'play') {
            // Start at the beginning of the sample
            this.sample = e.data.sample;
            this.index = 0;
        }
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const channel = output[0];

        for (let i = 0; i < channel.length; ++i) {
            if (this.sample) {
                // Using a bitwise OR ZERO forces the index to be an integer
                channel[i] = this.sample[this.index | 0] / 256.0;

                // Increment the index with 0.32 for a
                // sample rate of 15360 or 14112 Hz, depending
                // on the playback rate (48000 or 44100 Hz)
                this.index += 0.32;

                // Stop playing when reaching the end of the sample
                if (this.index >= this.sample.length) {
                    this.sample = null;
                }
            } else {
                channel[i] = 0;
            }
        }

        return true;
    }
}

registerProcessor('player-worklet', PlayerWorklet);
