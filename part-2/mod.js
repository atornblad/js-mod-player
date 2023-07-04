class Instrument {
    constructor(modfile, index, sampleStart) {
        // Instrument data starts at index 20, and each instrument is 30 bytes long
        const data = new Uint8Array(modfile, 20 + index * 30, 30);

        // Trim trailing null bytes
        const nameBytes = data.slice(0, 21).filter(a => !!a);
        this.name = String.fromCodePoint(...nameBytes).trim();

        this.length = 2 * (data[22] * 256 + data[23]);

        this.finetune = data[24] & 0x0f; // Signed 4 bit integer
        if (this.finetune > 7) this.finetune -= 16;

        this.volume = data[25];
        this.repeatOffset = 2 * (data[26] * 256 + data[27]);
        this.repeatLength = 2 * (data[28] * 256 + data[29]);
        this.bytes = new Int8Array(modfile, sampleStart, this.length);
    }
}

export class Mod {
    constructor(modfile) {
        // Store the pattern table
        this.patternTable = new Uint8Array(modfile, 952, 128);

        // Find the highest pattern number
        const maxPatternIndex = Math.max(...this.patternTable);

        // Extract all instruments
        this.instruments = [];
        let sampleStart = 1084 + (maxPatternIndex + 1) * 1024;
        for (let i = 0; i < 31; ++i) {
            const instr = new Instrument(modfile, i, sampleStart);
            this.instruments.push(instr);
            sampleStart += instr.length;
        }
    }
}
