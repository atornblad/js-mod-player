class Instrument {
    constructor(modfile, index, sampleStart) {
        const data = new Uint8Array(modfile, 20 + index * 30, 30);
        const nameBytes = data.slice(0, 21).filter(a => !!a);
        this.name = String.fromCodePoint(...nameBytes).trim();
        this.length = 2 * (data[22] * 256 + data[23]);
        this.finetune = data[24];
        if (this.finetune > 7) this.finetune -= 16;
        this.volume = data[25];
        this.repeatOffset = 2 * (data[26] * 256 + data[27]);
        this.repeatLength = 2 * (data[28] * 256 + data[29]);
        this.bytes = new Int8Array(modfile, sampleStart, this.length);
        this.isLooped = this.repeatOffset != 0 || this.repeatLength > 2;
    }
}

class Note {
    constructor (noteData) {
        // The data for each note is bit-packed like this:
        //  Byte 0   Byte 1   Byte 2   Byte 3
        // 76543210 76543210 76543210 76543210
        // iiiipppp pppppppp iiiieeee eeeeeeee
        // i = instrument index
        // p = period
        // e = effect
        this.instrument = (noteData[0] & 0xf0) | (noteData[2] >> 4);
        this.period = (noteData[0] & 0x0f) * 256 + noteData[1];
        let effectId = noteData[2] & 0x0f;
        let effectData = noteData[3];
        if (effectId === 0x0e) {
            effectId = 0xe0 | (effectData >> 4);
            effectData &= 0x0f;
        }
        this.rawEffect = ((noteData[2] & 0x0f) << 8) | noteData[3];
        this.effectId = effectId;
        this.effectData = effectData;
        this.effectHigh = effectData >> 4;
        this.effectLow = effectData & 0x0f;
        this.hasEffect = effectId || effectData;
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
            // Each row is made up of 16 bytes
            const rowData = data.slice(i * 16, i * 16 + 16);
            this.rows.push(new Row(rowData));
        }
    }
}

export class Mod {
    constructor(modfile) {
        const nameArray = new Uint8Array(modfile, 0, 20);
        const nameBytes = nameArray.filter(a => !!a);
        this.name = String.fromCodePoint(...nameBytes).trim();

        // Store the song length
        this.length = new Uint8Array(modfile, 950, 1)[0];

        // Store the pattern table
        this.patternTable = new Uint8Array(modfile, 952, this.length);

        // Find the highest pattern number
        const maxPatternIndex = Math.max(...this.patternTable);

        // Extract all instruments
        this.instruments = [null];
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
