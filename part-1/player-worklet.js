class PlayerWorklet extends AudioWorkletProcessor {
    constructor() {
        super();
        this.port.onmessage = this.onmessage.bind(this);
        this.playing = false;
    }

    onmessage(e) {
        if (e.data.type === 'play') {
            // Toggle between playing and silence
            this.playing = !this.playing;
            this.phase = 0;
        }
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const channel = output[0];

        for (let i = 0; i < channel.length; ++i) {
            if (this.playing) {
                channel[i] = Math.sin(this.phase);
                this.phase += 0.1;
            } else {
                channel[i] = 0;
            }
        }

        return true;
    }
}

registerProcessor('player-worklet', PlayerWorklet);
