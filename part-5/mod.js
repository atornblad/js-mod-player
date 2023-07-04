class Note {
    constructor(noteData) {
        this.instrument = (noteData[0] & 0xf0) | (noteData[2] >> 4);
        this.period = (noteData[0] & 0x0f) * 256 + noteData[1];
        this.effect = (noteData[2] & 0x0f) * 256 + noteData[3];
    }
}

class Row {
    constructor(rowData) {
        this.notes = [];

        // Each note is 4 bytes
        for (let i = 0; i < 16; i += 4) {
            const noteData = rowData.slice(i, i + 4);
            this.notes.push(new Note(noteData));
        }
    }
}

class Pattern {
    constructor(modfile, index) {
        // Each pattern is 1024 bytes long
        const data = new Uint8Array(modfile, 1084 + index * 1024, 1024);
        this.rows = [];

        // Each pattern is made up of 64 rows
        for (let i = 0; i < 64; ++i) {
            const rowData = data.slice(i * 16, i * 16 + 16);
            this.rows.push(new Row(rowData));
        }
    }
}

class Instrument {
    constructor(modfile, index, sampleStart) {
        const data = new Uint8Array(modfile, 20 + index * 30, 30);
        const nameBytes = data.slice(0, 21).filter(a => !!a);
        this.name = String.fromCodePoint(...nameBytes).trim();
        this.length = 2 * (data[22] * 256 + data[23]);
        this.finetune = data[24]; // Signed 4 bit integer
        if (this.finetune > 7) this.finetune -= 16;
        this.volume = data[25];
        this.repeatOffset = 2 * (data[26] * 256 + data[27]);
        this.repeatLength = 2 * (data[28] * 256 + data[29]);
        this.bytes = new Int8Array(modfile, sampleStart, this.length);
        this.isLooped = this.repeatOffset != 0 || this.repeatLength > 2;
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

        // Extract the pattern data
        this.patterns = [];
        for (let i = 0; i <= maxPatternIndex; ++i) {
            const pattern = new Pattern(modfile, i);
            this.patterns.push(pattern);
        }
    }
}
