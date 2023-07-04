const PAULA_FREQUENCY = 3546894.6;

class Channel {
    constructor(worklet) {
        this.worklet = worklet;
        this.instrument = null;
        this.period = 0;
        this.sampleSpeed = 0.0;
        this.sampleIndex = 0;
    }

    nextOutput() {
        if (!this.instrument || !this.period) return 0.0;
        const sample = this.instrument.bytes[this.sampleIndex | 0];

        this.sampleIndex += this.sampleSpeed;
        if (this.sampleIndex >= this.instrument.length) {
            return 0.0;
        }

        return sample / 256.0;
    }

    play(note) {
        if (note.instrument) {
            this.instrument = this.worklet.mod.instruments[note.instrument - 1];
            this.sampleIndex = 0;
        }

        if (note.period) {
            this.period = note.period - this.instrument.finetune;
            const sampleRate = PAULA_FREQUENCY / this.period;
            this.sampleSpeed = sampleRate / this.worklet.sampleRate;
        }

        if (note.effect) {
            this.effect(note.effect);
        }
    }

    effect(raw) {
        const id = raw >> 8;
        const data = raw & 0xff;
        if (id == 0x0f) {
            if (data >= 1 && data <= 31) {
                this.worklet.setTicksPerRow(data)
            }
            else {
                this.worklet.setBpm(data);
            }
        }
    }
}

class PlayerWorklet extends AudioWorkletProcessor {
    constructor() {
        super();
        this.port.onmessage = this.onmessage.bind(this);
        this.mod = null;
        this.channels = [ new Channel(this), new Channel(this), new Channel(this), new Channel(this) ];
    }

    onmessage(e) {
        if (e.data.type === 'play') {
            this.mod = e.data.mod;
            this.sampleRate = e.data.sampleRate;

            this.setBpm(125);
            this.setTicksPerRow(6);

            // Start at the last row of the pattern "before the first pattern"
            this.position = -1;
            this.rowIndex = 63;

            // Immediately move to the first row of the first pattern
            this.outputsUntilNextRow = 0;
        }
    }

    setTicksPerRow(ticksPerRow) {
        this.ticksPerRow = ticksPerRow;
        this.outputsPerRow = this.sampleRate * 60 / this.bpm / 4 * this.ticksPerRow / 6;
    }

    setBpm(bpm) {
        this.bpm = bpm;
        this.outputsPerRow = this.sampleRate * 60 / this.bpm / 4 * this.ticksPerRow / 6;
    }
    
    nextRow() {
        this.outputsUntilNextRow += this.outputsPerRow;
        ++this.rowIndex;
        if (this.rowIndex == 64) {
            this.rowIndex = 0;
            ++this.position;
        }

        const patternIndex = this.mod.patternTable[this.position];
        const pattern = this.mod.patterns[patternIndex];
        if (!pattern) debugger;
        const row = pattern.rows[this.rowIndex];

        for (let i = 0; i < 4; ++i) {
            this.channels[i].play(row.notes[i]);
        }
    }

    nextOutput() {
        if (!this.mod) return 0.0;

        if (this.outputsUntilNextRow <= 0) {
            this.nextRow();
        }

        this.outputsUntilNextRow--;

        const rawOutput = this.channels.reduce((acc, channel) => acc + channel.nextOutput(), 0.0);
        return Math.tanh(rawOutput);
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const channel = output[0];

        for (let i = 0; i < channel.length; ++i) {
            const value = this.nextOutput();
            channel[i] = value;
        }

        return true;
    }
}

registerProcessor('player-worklet', PlayerWorklet);
