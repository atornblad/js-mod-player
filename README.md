# JS-MOD-PLAYER

This is a MOD player, developed in vanilla JavaScript using modern (2022) Web Audio and Audio Worklet APIs.

Try it out live on my [GitHub Page](https://atornblad.github.io/js-mod-player).

Read about how it was made on [my Blog](https://atornblad.se/js-mod-player).

License: [Creative Commons Attribution-NonCommercial 4.0 International License](http://creativecommons.org/licenses/by-nc/4.0/)

---
## Getting started
Add a Protracker 2.3 compatible MOD file to your project.

Add the following `script` element to your html file:

```html
<script type="module">
    import { ModPlayer } from 'https://atornblad.se/files/js-mod-player/player.js';

    const audio = new AudioContext();
    const player = new ModPlayer(audio);
    await player.load('MOD_FILE_FILENAME');

    window.addEventListener('click', async () => {
        player.play();
    });
</script>
```

This will create an instance of the `ModPlayer` class and load the MOD file. When the user clicks the window, the music will start to play. Web Audio API does not allow audio to play until the user has interacted with the page, so you have to wait for some type of user input, like a click or a tap.

## Event system

To use music as a time source, or for synchronizing effects and events in a demo, you can use the `watch`
and `watchRows` methods to get notified at the exact moment different rows are played.

### Examples

```javascript
// Calls the switchToNextScene method when the music
// reaches row 16 in position 4.
player.watch(4, 16, switchToNextScene);

// Calls the flashTheScreen method every 4 rows
player.watchRows((pos, row) => {
    if ((row % 4) === 0) {
        flashTheScreen();
    }
});
```

# Specifications

## ModPlayer class

Public methods of the `ModPlayer` class:

 - `async load(url)` Loads a MOD file from a url.
 - `unload()` Unloads a loaded MOD file and frees resources.
 - `play()` Starts playing music.
 - `stop()` Stops playing.
 - `resume()` Resumes playing after a call to `stop()`.
 - `setVolume(volume)` Sets the volume of an internal gain node. Default value: 0.3
 - `setRow(position, row)` Jumps to a specific time in the music.
 - `watch(position, row, callback)` Registers a callback for a position and row.
 - `watchRows(callback)` Registers a callback for all rows.
 - `watchStop(callback)` Registers a callback for the "Set Speed Zero `F00` command"

Public member variables of the `ModPlayer` class:

 - `mod : Mod` The loaded MOD file.
 - `playing : Boolean` Returns true if music is currently playing.

## Mod class

Public member variables of the `ModPlayer` class:

 - `name : String` The name of the MOD file.
 - `length : Number` The number of positions.
 - `patternTable : Array of Number` The pattern index for each position.
 - `instruments : Array of Instrument` The instruments contained in the MOD file.
 - `patterns : Array of Pattern` The patterns contained in the MOD file.


## Pattern class

Public member variables of the `Pattern` class:

 - `rows : Array of Row` The 64 rows of notes contained in the pattern.

## Row class

Public member variables of the `Row` class:

 - `notes : Array of Note` The 4 notes containt in the row.

## Note class

Public member variables of the `Note` class:

 - `instrument : Number` The instrument number, between 1 and 31, or 0 for not changing.
 - `period : Number` The 12-bit period of the note, or 0 for not changing.
 - `effect : Number` The 12-bit effect data for the note.

## Instrument class

Public member variables of the `Instrument` class:

 - `name : String` Name of the instrument, from the MOD file.
 - `length : Number` The length of the sample, measured in bytes.
 - `finetune : Number` A signed 4 bit integer for finetuning the instrument.
 - `volume : Number` The default volume, between 0 and 64.
 - `repeatOffset : Number` For looping samples, the start of the loop.
 - `repeatLength : Number` For looping samples, the length of the loop.
 - `bytes : Int8Array` The raw sample data in signed bytes.
 - `isLooped : Boolean` True if the sample is looped.

