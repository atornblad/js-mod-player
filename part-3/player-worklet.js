const PAULA_FREQUENCY = 3546894.6;

class PlayerWorklet extends AudioWorkletProcessor {
    constructor() {
        super();
        this.port.onmessage = this.onmessage.bind(this);
        this.mod = null;
    }

    onmessage(e) {
        if (e.data.type === 'play') {
            this.mod = e.data.mod;
            this.sampleRate = e.data.sampleRate;

            this.bpm = 125;
            this.outputsPerRow = this.sampleRate * 60 / this.bpm / 4;

            // Start at the last row of the pattern "before the first pattern"
            this.position = -1;
            this.rowIndex = 63;

            // Immediately move to the first row of the first pattern
            this.outputsUntilNextRow = 0;

            this.instrument = null;
            this.period = null;
        }
    }

    nextRow() {
        ++this.rowIndex;
        if (this.rowIndex == 64) {
            this.rowIndex = 0;
            ++this.position;
        }

        const patternIndex = this.mod.patternTable[this.position];
        const pattern = this.mod.patterns[patternIndex];
        const row = pattern.rows[this.rowIndex];
        const note = row.notes[0];

        if (note.instrument) {
            this.instrument = this.mod.instruments[note.instrument - 1];
            this.sampleIndex = 0;
        }

        if (note.period) {
            this.period = note.period - this.instrument.finetune;
        }
    }

    nextOutput() {
        if (!this.mod) return 0.0;

        if (this.outputsUntilNextRow <= 0) {
            this.nextRow();
            this.outputsUntilNextRow += this.outputsPerRow;
        }

        this.outputsUntilNextRow--;

        if (!this.instrument || !this.period) return 0.0;
        if (!this.period) return 0.0;

        if (this.sampleIndex >= this.instrument.bytes.length) {
            return 0.0;
        }

        const sample = this.instrument.bytes[this.sampleIndex | 0];
        const sampleRate = PAULA_FREQUENCY / this.period;
        this.sampleIndex += sampleRate / this.sampleRate;

        return sample / 256.0;
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
