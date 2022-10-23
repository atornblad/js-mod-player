# JS-MOD-PLAYER

This is a MOD player, developed in vanilla JavaScript using modern (2022) Web Audio and Audio Worklet APIs.

Try it out on my [GitHub Page](https://atornblad.github.io/js-mod-player)

License: [Creative Commons Attribution-NonCommercial 4.0 International License](http://creativecommons.org/licenses/by-nc/4.0/)

## Basic usage

To simply load a MOD file and play it, call the async `jsModPlayer` function, which will return a player object. Then call its `play` method from inside an event listener.

```javascript
// Musiklinjen by Firefox and Tip (Jimmy Fredriksson and Robert Österbergh)
const url = 'https://api.modarchive.org/downloads.php?moduleid=101789';
const player = await jsModPlayer(url);

// Audio is only allowed to start when a user interacts (clicks, taps)
document.body.addEventListener('click', async () => player.play());
```

## Reacting to timing events

There are two ways of reacting to timing events from a player object:

 - `player.watch(name, songPos, row, callback)`
 - `player.watchRows(callback)`

The `watch` function lets you add a named callback that gets called at a specific **"song position"** *(pattern index)* and **"row"**. The `callback` will be called with the song position and row as parameters. If you add the same name multiple times, the same callback is used, and called once for each song potision and row.

```javascript
const func = (songPos, row) => {
    console.log(`Reached ${songPos}:${row}`);
};
// Call the above function at three times in this song
player.watch('debug', 1, 0, func);
player.watch('debug', 4, 8);
player.watch('debug', 5, 32);
```

The `watchRows` function lets you add a callback that will be called for each row in the song. The `callback` will be called with the song position and row as parameters.

```javascript
let lastTime = null;
const everyRow = (songPos, row) => {
    const now = Date.now() / 1000;
    if (!lastTime) {
        const diff = now - lastTime;
        console.log(`Time between rows: {${diff} seconds}`);
    }
    lastTime = now;
};

player.watchRows(everyRow);
```

## Stopping, resuming and seeking

It is also possible to stop, resume and seek in the song using the `stop`, `resume` and `setSongPosition` methods.

 - `player.stop()`
 - `player.resume()`
 - `player.setSongPosition(songPos)`

