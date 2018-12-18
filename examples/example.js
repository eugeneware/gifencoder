const GIFEncoder = require('..');
const { createCanvas } = require('canvas');
const fs = require('fs');

const encoder = new GIFEncoder(320, 240);
encoder.start();
encoder.setRepeat(0);   // 0 for repeat, -1 for no-repeat
encoder.setDelay(500);  // frame delay in ms
encoder.setQuality(10); // image quality. 10 is default.

// use node-canvas
const canvas = createCanvas(320, 240);
const ctx = canvas.getContext('2d');

// red rectangle
ctx.fillStyle = '#ff0000';
ctx.fillRect(0, 0, 320, 240);
encoder.addFrame(ctx);

// green rectangle
ctx.fillStyle = '#00ff00';
ctx.fillRect(0, 0, 320, 240);
encoder.addFrame(ctx);

// blue rectangle
ctx.fillStyle = '#0000ff';
ctx.fillRect(0, 0, 320, 240);
encoder.addFrame(ctx);

encoder.finish();

const buf = encoder.out.getData();
fs.writeFile('myanimated.gif', buf, function (err) {
  // animated GIF written to myanimated.gif
});
