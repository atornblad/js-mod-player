import { loadMod } from './loader.js';

// Create the audio context
const audio = new AudioContext();

// Load an audio worklet
await audio.audioWorklet.addModule('player-worklet.js');

// Create a player
const player = new AudioWorkletNode(audio, 'player-worklet');

// Connect the player to the audio context
player.connect(audio.destination);

// Load Elekfunk from api.modarchive.org
const url = 'https://api.modarchive.org/downloads.php?moduleid=41529';
const mod = await loadMod(url);

// Keyboard map for the 31 instruments
// Press one of these keys to play the corresponding sample
const keyMap = '1234567890qwertyuiopasdfghjklzx,.';

// Play a sample when the user clicks
window.addEventListener('keydown', (e) => {
    const instrIndex = keyMap.indexOf(e.key);
    if (instrIndex === -1) return;

    const instrument = mod.instruments[instrIndex];
    console.log(instrument);

    audio.resume();
    player.port.postMessage({
        type: 'play',
        sample: instrument.bytes
    });
});
