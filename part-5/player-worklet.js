const PAULA_FREQUENCY = 3546894.6;

const ARPEGGIO = 0x00;
const SLIDE_UP = 0x01;
const SLIDE_DOWN = 0x02;
const TONE_PORTAMENTO = 0x03;
const VIBRATO = 0x04;
const TONE_PORTAMENTO_WITH_VOLUME_SLIDE = 0x05;
const VIBRATO_WITH_VOLUME_SLIDE = 0x06;
const SAMPLE_OFFSET = 0x09;
const VOLUME_SLIDE = 0x0A;
const SET_VOLUME = 0x0C;
const PATTERN_BREAK = 0x0D;
const EXTENDED = 0x0e;
const SET_SPEED = 0x0f;
const RETRIGGER_NOTE = 0xe9;
const DELAY_NOTE = 0xed;

class Channel {
    constructor(worklet) {
        this.worklet = worklet;
        this.instrument = null;
        this.playing = false;
        this.period = 0;
        this.sampleSpeed = 0.0;
        this.sampleIndex = 0;
        this.volume = 64;
        this.portamentoSpeed = 0;
        this.vibratoDepth = 0;
        this.vibratoSpeed = 0;
        this.vibratoIndex = 0;
    }

    nextOutput() {
        if (!this.instrument || !this.period) return 0.0;
        const sample = this.instrument.bytes[this.sampleIndex | 0];

        this.sampleIndex += this.sampleSpeed;

        if (this.instrument.isLooped) {
            if (this.sampleIndex >= this.instrument.repeatOffset + this.instrument.repeatLength) {
                this.sampleIndex = this.instrument.repeatOffset;
            }
        }
        else if (this.sampleIndex >= this.instrument.length) {
            return 0.0;
        }

        return sample / 256.0 * this.currentVolume / 64;
    }
    
    performTick() {
        if (this.volumeSlide) {
            this.currentVolume += this.volumeSlide;
            if (this.currentVolume < 0) this.currentVolume = 0;
            if (this.currentVolume > 64) this.currentVolume = 64;
        }

        if (this.vibrato) {
            this.vibratoIndex = (this.vibratoIndex + this.vibratoSpeed) % 64;
            this.currentPeriod = this.period + Math.sin(this.vibratoIndex / 64 * Math.PI * 2) * this.vibratoDepth;
        }
        else if (this.periodDelta) {
            if (this.portamento) {
                if (this.currentPeriod != this.period) {
                    // Which direction to slide?
                    const sign = Math.sign(this.period - this.currentPeriod);
                    // Don't slide past the target period
                    const distance = Math.abs(this.currentPeriod - this.period);
                    const diff = Math.min(distance, this.periodDelta);
                    this.currentPeriod += sign * diff;
                }
            }
            else {
                this.currentPeriod += this.periodDelta;
            }
        }

        
        if (this.currentPeriod < 113) this.currentPeriod = 113;
        if (this.currentPeriod > 856) this.currentPeriod = 856;

        const sampleRate = PAULA_FREQUENCY / this.currentPeriod;
        this.sampleSpeed = sampleRate / this.worklet.sampleRate;
    }

    play(note) {
        // Keep track of whether the sample should start from the beginning
        this.setSampleIndex = false;

        if (note.instrument) {
            this.instrument = this.worklet.mod.instruments[note.instrument - 1];
            this.sampleIndex = 0;
            this.volume = this.instrument.volume;
            this.currentVolume = this.volume;
        }

        // Keep track of whether period should change immediately
        this.setCurrentPeriod = false;

        if (note.period) {
            this.period = note.period - this.instrument.finetune;
            this.currentPeriod = this.period;
        }

        // setSampleIndex and setCurrentPeriod could change back to false in the effect method
        this.effect(note.effect);

        if (this.setCurrentPeriod) {
            this.currentPeriod = this.period;
        }

        if (this.setSampleIndex !== false) {
            this.sampleIndex = this.setSampleIndex;
        }
    }

    effect(raw) {
        this.volumeSlide = 0;
        this.periodDelta = 0;
        this.portamento = false;
        this.vibrato = false;

        if (!raw) return;

        let id = raw >> 8;
        let data = raw & 0xff;

        if (id == EXTENDED) {
            id = (id << 4) | (data >> 4);
            data = data & 0x0f;
        }

        switch (id) {
            case SET_VOLUME:
                this.volume = data;
                this.currentVolume = this.volume;
                break;
            case SLIDE_UP:
                this.periodDelta = -data;
                break;
            case SLIDE_DOWN:
                this.periodDelta = data;
                break;
            case TONE_PORTAMENTO:
                this.portamento = true;
                if (data) this.portamentoSpeed = data;
                this.periodDelta = this.portamentoSpeed;
                this.setCurrentPeriod = false;
                this.setSampleIndex = false;
                break;
            case TONE_PORTAMENTO_WITH_VOLUME_SLIDE:
                this.portamento = true;
                this.setCurrentPeriod = false;
                this.setSampleIndex = false;
                this.periodDelta = this.portamentoSpeed;
                if (data & 0xf0) {
                    this.volumeSlide = data >> 4;
                }
                else if (data & 0x0f) {
                    this.volumeSlide = -(data & 0x0f);
                }
                break;
            case VIBRATO:
                const speed = data >> 4;
                const depth = data & 0x0f;
                if (speed) this.vibratoSpeed = speed;
                if (depth) this.vibratoDepth = depth;
                this.vibrato = true;
                break;
            case VOLUME_SLIDE:
                if (data & 0xf0) {
                    this.volumeSlide = data >> 4;
                }
                else if (data & 0x0f) {
                    this.volumeSlide = -(data & 0x0f);
                }
                break;
            case VIBRATO_WITH_VOLUME_SLIDE:
                this.vibrato = true;
                if (data & 0xf0) {
                    this.volumeSlide = data >> 4;
                }
                else if (data & 0x0f) {
                    this.volumeSlide = -(data & 0x0f);
                }
                break;
            case SET_SPEED:
                if (data >= 1 && data <= 31) {
                    this.worklet.setTicksPerRow(data);
                }
                else {
                    this.worklet.setBpm(data);
                }
                break;
            case SAMPLE_OFFSET:
                this.sampleIndex = data * 256;
                break;
            case PATTERN_BREAK:
                const row = (data >> 4) * 10 + (data & 0x0f);
                this.worklet.setPatternBreak(row);
                break;
        }
    }
}

class PlayerWorklet extends AudioWorkletProcessor {
    constructor() {
        super();
        this.port.onmessage = this.onmessage.bind(this);
        this.mod = null;
        this.channels = [ new Channel(this), new Channel(this), new Channel(this), new Channel(this) ];
        this.patternBreak = false;
    }

    onmessage(e) {
        if (e.data.type === 'play') {
            this.mod = e.data.mod;
            this.sampleRate = e.data.sampleRate;

            this.setBpm(125);
            this.setTicksPerRow(6);

            // Start at the last tick of the pattern "before the first pattern"
            this.position = -1;
            this.rowIndex = 63;
            this.tick = 5;
            this.ticksPerRow = 6;

            // Immediately move to the first row of the first pattern
            this.outputsUntilNextTick = 0;
        }
    }
    
    setPatternBreak(row) {
        this.patternBreak = row;
    }

    setTicksPerRow(ticksPerRow) {
        this.ticksPerRow = ticksPerRow;
    }

    setBpm(bpm) {
        this.bpm = bpm;
        this.outputsPerTick = this.sampleRate * 60 / this.bpm / 4 / 6;
    }

    nextTick() {
        ++this.tick;
        if (this.tick == this.ticksPerRow) {
            this.tick = 0;
            this.nextRow();
        }

        for (let i = 0; i < 4; ++i) {
            this.channels[i].performTick();
        }
    }
    
    nextRow() {
        ++this.rowIndex;
        
        if (this.patternBreak !== false) {
            this.rowIndex = this.patternBreak;
            ++this.position;
            this.patternBreak = false;
        }
        else if (this.rowIndex == 64) {
            this.rowIndex = 0;
            ++this.position;
        }
        
        if (this.rowIndex == 64) {
            this.rowIndex = 0;
            ++this.position;
        }

        const patternIndex = this.mod.patternTable[this.position];
        const pattern = this.mod.patterns[patternIndex];
        const row = pattern.rows[this.rowIndex];

        for (let i = 0; i < 4; ++i) {
            this.channels[i].play(row.notes[i]);
        }
    }

    nextOutput() {
        if (!this.mod) return 0.0;

        if (this.outputsUntilNextTick <= 0) {
            this.nextTick();
            this.outputsUntilNextTick += this.outputsPerTick;
        }

        this.outputsUntilNextTick--;

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
