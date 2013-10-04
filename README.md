# gifencoder

Streaming server-side animated (and non-animated) gif generation for node.js

This code is based on the fine work of the following developers, but adds
server-side generation with [node-canvas](https://github.com/learnboost/node-canvas)
and support for node.js Buffers:

* Kevin Weiner (original Java version - kweiner@fmsware.com)
* Thibault Imbert (AS3 version - bytearray.org)
* Johan Nordberg ([gif.js](http://jnordberg.github.io/gif.js/) - code@johan-nordberg.com)

## Installation

This module is installed via npm:

``` bash
$ npm install gifencoder
```

## Example Usage

``` js
var GIFEncoder = require('gifencoder');
var Canvas = require('canvas');
var fs = require('fs');

var encoder = new GIFEncoder(320, 240);
encoder.start();
encoder.setRepeat(0);   // 0 for repeat, -1 for no-repeat
encoder.setDelay(500);  // frame delay in ms
encoder.setQuality(10); // image quality. 10 is default.

// use node-canvas
var canvas = new Canvas(320, 240);
var ctx = canvas.getContext('2d');

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

var buf = encoder.stream().getData();
fs.writeFile('myanimated.gif', buf, function (err) {
  // animated GIF written to myanimated.gif
});
```

The above code will render an image like:

![Animated GIF](https://raw.github.com/eugeneware/gifencoder/master/examples/myanimated.gif)

## Streaming API

You can also use a streaming API to receive data:

``` js
var GIFEncoder = require('gifencoder');
var Canvas = require('canvas');
var fs = require('fs');

var encoder = new GIFEncoder(320, 240);
// stream the results as they are available into myanimated.gif
encoder.createReadStream().pipe(fs.createWriteStream('myanimated.gif'));

encoder.start();
encoder.setRepeat(0);   // 0 for repeat, -1 for no-repeat
encoder.setDelay(500);  // frame delay in ms
encoder.setQuality(10); // image quality. 10 is default.

// use node-canvas
var canvas = new Canvas(320, 240);
var ctx = canvas.getContext('2d');

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
```
