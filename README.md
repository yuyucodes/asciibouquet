# ASCII Bouquet

A bouquet of pink roses and blue hydrangea that grows and blooms in coloured ASCII, floating over water and lilypads.

Open `index.html` in a browser. It has no dependencies or build step. You can also serve the folder with any static server, for example `npx serve` or VS Code Live Server.

## How it works

Each frame draws the scene with shapes onto a tiny offscreen canvas, one pixel per character. Each pixel is then redrawn as a character from `.:-=+*cxoaX#%&@`, picked by brightness and coloured with the pixel's colour. A blurred copy underneath gives the glow.

## Files

- `index.html` : the page and its white frame
- `bouquet.js` : the scene, the animation and the ASCII renderer