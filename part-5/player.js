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

// Play a sample when the user clicks
const button = document.getElementById('play');
button.addEventListener('click', () => {
    audio.resume();
    player.port.postMessage({
        type: 'play',
        mod: mod,
        sampleRate: audio.sampleRate
    });
});
