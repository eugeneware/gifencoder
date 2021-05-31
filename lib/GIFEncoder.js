/*
  GIFEncoder.js

  Authors
  Kevin Weiner (original Java version - kweiner@fmsware.com)
  Thibault Imbert (AS3 version - bytearray.org)
  Johan Nordberg (JS version - code@johan-nordberg.com)
  Eugene Ware (node.js streaming version - eugene@noblesmaurai.com)
*/

var { Readable, Duplex } = require('stream');
var NeuQuant = require('./TypedNeuQuant.js');
var LZWEncoder = require('./LZWEncoder.js');

function ByteArray() {
  this.data = [];
}

/**
 * @returns {Buffer}
 */
ByteArray.prototype.getData = function() {
  return Buffer.from(this.data);
};

/**
 * @param {any} val
 * @returns {void}
 */
ByteArray.prototype.writeByte = function(val) {
  this.data.push(val);
};

/**
 * @param {string} string
 * @returns {void}
 */
ByteArray.prototype.writeUTFBytes = function(string) {
  for (var l = string.length, i = 0; i < l; i++)
    this.writeByte(string.charCodeAt(i));
};

/**
 * @param {any[]} array
 * @param {number} [offset]
 * @param {number} [length]
 * @returns {void}
 */
ByteArray.prototype.writeBytes = function(array, offset, length) {
  for (var l = length || array.length, i = offset || 0; i < l; i++)
    this.writeByte(array[i]);
};

/**
 * @param {number} width
 * @param {number} height
 */
function GIFEncoder(width, height) {
  // image size
  this.width = ~~width;
  this.height = ~~height;

  // transparent color if given
  this.transparent = null;

  // transparent index in color table
  this.transIndex = 0;

  // -1 = no repeat, 0 = forever. anything else is repeat count
  this.repeat = -1;

  // frame delay (hundredths)
  this.delay = 0;

  this.image = null; // current frame
  this.pixels = null; // BGR byte array from frame
  this.indexedPixels = null; // converted frame indexed to palette
  this.colorDepth = null; // number of bit planes
  this.colorTab = null; // RGB palette
  this.usedEntry = new Array(); // active palette entries
  this.palSize = 7; // color table size (bits-1)
  this.dispose = -1; // disposal code (-1 = use default)
  this.firstFrame = true;
  this.sample = 10; // default sample interval for quantizer

  this.started = false; // started encoding

  this.readStreams = [];

  this.out = new ByteArray();
}

/**
 * @param {Readable} [rs]
 * @returns {Readable}
 */
GIFEncoder.prototype.createReadStream = function (rs) {
  if (!(rs instanceof Readable)) {
    rs = new Readable();
    rs._read = () => {};
  }
  this.readStreams.push(rs);
  return rs;
};

var fns = ['setDelay', 'setFrameRate', 'setDispose', 'setRepeat',
           'setTransparent', 'setQuality'];

/**
 * @param {Object} [options]
 * @returns {Duplex}
 */
GIFEncoder.prototype.createWriteStream = function (options) {
  if (options) {
    Object.keys(options).forEach((option) => {
      var fn = `set${option[0].toUpperCase()}${option.substr(1)}`;
      if (~fns.indexOf(fn)) {
        this[fn].call(this, options[option]);
      }
    });
  }

  var ws = new Duplex({ objectMode: true });
  ws._read = () => {};
  this.createReadStream(ws);

  ws._write = (data, enc, next) => {
    if (!this.started) this.start();
    this.addFrame(data);
    next();
  };
  var end = ws.end, self = this;
  ws.end = function () {
    end.apply(ws, [].slice.call(arguments));
    self.finish();
  };
  return ws;
};

/**
 * @returns {void}
 */
GIFEncoder.prototype.emit = function() {
  if (!this.readStreams.length) return;
  if (this.out.data.length) {
    var buff = Buffer.from(this.out.data);
    this.readStreams.forEach((rs) => {
      rs.push(buff);
    });
    this.out.data = [];
  }
};

/**
 * @returns {void}
 */
GIFEncoder.prototype.end = function() {
  if (!this.readStreams.length) return;
  this.emit();
  this.readStreams.forEach((rs) => {
    rs.push(null);
  });
  this.readStreams = [];
};

/**
 * Sets the delay time between each frame, or changes it for subsequent
 * frames. (applies to the next frame added)
 * @param {number} milliseconds
 * @returns {void}
 */
GIFEncoder.prototype.setDelay = function(milliseconds) {
  this.delay = Math.round(milliseconds / 10);
};

/**
 * Sets frame rate in frames per second.
 * @param {number} fps
 * @returns {void}
 */
GIFEncoder.prototype.setFrameRate = function(fps) {
  this.delay = Math.round(100 / fps);
};

/**
 * Sets the GIF frame disposal code for the last added frame and any
 * subsequent frames.
 * <br>
 * Default is 0 if no transparent color has been set, otherwise 2.
 * @param {number} disposalCode
 * @returns {void}
 */
GIFEncoder.prototype.setDispose = function(disposalCode) {
  if (disposalCode >= 0) this.dispose = disposalCode;
};

/**
 * Sets the number of times the set of GIF frames should be played.
 * <br>
 * -1 = play once
 * 0 = repeat indefinitely
 * <br>
 * Default is -1
 * <br>
 * Must be invoked before the first image is added.
 * @param {number} repeat
 * @returns {void}
 */
GIFEncoder.prototype.setRepeat = function(repeat) {
  this.repeat = repeat;
};

/**
 * Sets the transparent color for the last added frame and any subsequent
 * frames. Since all colors are subject to modification in the quantization
 * process, the color in the final palette for each frame closest to the given
 * color becomes the transparent color for that frame. May be set to null to
 * indicate no transparent color.
 * @param {string | number} color
 * @returns {void}
 */
GIFEncoder.prototype.setTransparent = function(color) {
  this.transparent = color;
};

/**
 * Adds next GIF frame. The frame is not written immediately, but is
 * actually deferred until the next frame is received so that timing
 * data can be inserted. Invoking finish() flushes all frames.
 * @param {any} imageData
 * @returns {void}
 */
GIFEncoder.prototype.addFrame = function(imageData) {
  // HTML Canvas 2D Context Passed In
  if (imageData && (typeof imageData.getImageData === 'function')) {
    this.image = imageData.getImageData(0, 0, this.width, this.height).data;
  } else {
    this.image = imageData;
  }

  this.getImagePixels(); // convert to correct format if necessary
  this.analyzePixels(); // build color table & map pixels

  if (this.firstFrame) {
    this.writeLSD(); // logical screen descriptior
    this.writePalette(); // global color table
    if (this.repeat >= 0) {
      // use NS app extension to indicate reps
      this.writeNetscapeExt();
    }
  }

  this.writeGraphicCtrlExt(); // write graphic control extension
  this.writeImageDesc(); // image descriptor
  if (!this.firstFrame) this.writePalette(); // local color table
  this.writePixels(); // encode and write pixel data

  this.firstFrame = false;
  this.emit();
};

/**
 * Adds final trailer to the GIF stream, if you don't call the finish method
 * the GIF stream will not be valid.
 * @returns {void}
 */
GIFEncoder.prototype.finish = function() {
  this.out.writeByte(0x3b); // gif trailer
  this.end();
};

/**
 * Sets quality of color quantization (conversion of images to the maximum 256
 * colors allowed by the GIF specification). Lower values (minimum = 1)
 * produce better colors, but slow processing significantly. 10 is the
 * default, and produces good color mapping at reasonable speeds. Values
 * greater than 20 do not yield significant improvements in speed.
 * @param {number} quality
 * @returns {void}
 */
GIFEncoder.prototype.setQuality = function(quality) {
  if (quality < 1) quality = 1;
  this.sample = quality;
};

/**
 * Writes GIF file header.
 * @returns {void}
 */
GIFEncoder.prototype.start = function() {
  this.out.writeUTFBytes('GIF89a');
  this.started = true;
  this.emit();
};

/**
 * Analyzes current frame colors and creates color map.
 * @returns {void}
 */
GIFEncoder.prototype.analyzePixels = function() {
  var len = this.pixels.length;
  var nPix = len / 3;

  this.indexedPixels = new Uint8Array(nPix);

  var imgq = new NeuQuant(this.pixels, this.sample);
  imgq.buildColormap(); // create reduced palette
  this.colorTab = imgq.getColormap();

  // map image pixels to new palette
  for (var j = 0, k = 0, n = 0xff; j < nPix; j++) {
    var index = imgq.lookupRGB(
      this.pixels[k++] & n,
      this.pixels[k++] & n,
      this.pixels[k++] & n
    );
    this.usedEntry[index] = true;
    this.indexedPixels[j] = index;
  }

  this.pixels = null;
  this.colorDepth = 8;
  this.palSize = 7;

  // get closest match to transparent color if specified
  if (this.transparent !== null) {
    this.transIndex = this.findClosest(this.transparent);

    // ensure that pixels with full transparency in the RGBA image are using the selected transparent color index in the indexed image.
    for (var pixelIndex = 0; pixelIndex < nPix; pixelIndex++) {
      if (this.image[pixelIndex * 4 + 3] == 0) {
        this.indexedPixels[pixelIndex] = this.transIndex;
      }
    }
  }
};

/**
 * Returns index of palette color closest to `c`.
 * @param {string | number} c
 * @returns {number}
 */
GIFEncoder.prototype.findClosest = function(c) {
  if (this.colorTab === null) return -1;

  var r = (c & 0xFF0000) >> 16;
  var g = (c & 0x00FF00) >> 8;
  var b = (c & 0x0000FF);
  var minpos = 0;
  var dmin = 256 * 256 * 256;
  var len = this.colorTab.length;

  for (var i = 0, n = 0xff; i < len;) {
    var index = i / 3;
    var dr = r - (this.colorTab[i++] & n);
    var dg = g - (this.colorTab[i++] & n);
    var db = b - (this.colorTab[i++] & n);
    var d = dr * dr + dg * dg + db * db;
    if (this.usedEntry[index] && (d < dmin)) {
      dmin = d;
      minpos = index;
    }
  }

  return minpos;
};

/**
 * Extracts image pixels into byte array
 * pixels. (removes alphachannel from canvas imagedata)
 * @returns {void}
 */
GIFEncoder.prototype.getImagePixels = function() {
  var w = this.width;
  var h = this.height;
  this.pixels = new Uint8Array(w * h * 3);

  var data = this.image;
  var count = 0;

  for (var i = 0; i < h; i++) {
    for (var j = 0; j < w; j++) {
      var b = (i * w * 4) + j * 4;
      this.pixels[count++] = data[b];
      this.pixels[count++] = data[b + 1];
      this.pixels[count++] = data[b + 2];
    }
  }
};

/**
 * Writes Graphic Control Extension.
 * @returns {void}
 */
GIFEncoder.prototype.writeGraphicCtrlExt = function() {
  this.out.writeByte(0x21); // extension introducer
  this.out.writeByte(0xf9); // GCE label
  this.out.writeByte(4); // data block size

  var transp, disp;
  if (this.transparent === null) {
    transp = 0;
    disp = 0; // dispose = no action
  } else {
    transp = 1;
    disp = 2; // force clear if using transparent color
  }

  if (this.dispose >= 0) {
    disp = this.dispose & 7; // user override
  }
  disp <<= 2;

  // packed fields
  this.out.writeByte(
    0 | // 1:3 reserved
    disp | // 4:6 disposal
    0 | // 7 user input - 0 = none
    transp // 8 transparency flag
  );

  this.writeShort(this.delay); // delay x 1/100 sec
  this.out.writeByte(this.transIndex); // transparent color index
  this.out.writeByte(0); // block terminator
};

/**
 * Writes Image Descriptor.
 * @returns {void}
 */
GIFEncoder.prototype.writeImageDesc = function() {
  this.out.writeByte(0x2c); // image separator
  this.writeShort(0); // image position x,y = 0,0
  this.writeShort(0);
  this.writeShort(this.width); // image size
  this.writeShort(this.height);

  // packed fields
  if (this.firstFrame) {
    // no LCT - GCT is used for first (or only) frame
    this.out.writeByte(0);
  } else {
    // specify normal LCT
    this.out.writeByte(
      0x80 | // 1 local color table 1=yes
      0 | // 2 interlace - 0=no
      0 | // 3 sorted - 0=no
      0 | // 4-5 reserved
      this.palSize // 6-8 size of color table
    );
  }
};

/**
 * Writes Logical Screen Descriptor.
 * @returns {void}
 */
GIFEncoder.prototype.writeLSD = function() {
  // logical screen size
  this.writeShort(this.width);
  this.writeShort(this.height);

  // packed fields
  this.out.writeByte(
    0x80 | // 1 : global color table flag = 1 (gct used)
    0x70 | // 2-4 : color resolution = 7
    0x00 | // 5 : gct sort flag = 0
    this.palSize // 6-8 : gct size
  );

  this.out.writeByte(0); // background color index
  this.out.writeByte(0); // pixel aspect ratio - assume 1:1
};

/**
 * Writes Netscape application extension to define repeat count.
 * @returns {void}
 */
GIFEncoder.prototype.writeNetscapeExt = function() {
  this.out.writeByte(0x21); // extension introducer
  this.out.writeByte(0xff); // app extension label
  this.out.writeByte(11); // block size
  this.out.writeUTFBytes('NETSCAPE2.0'); // app id + auth code
  this.out.writeByte(3); // sub-block size
  this.out.writeByte(1); // loop sub-block id
  this.writeShort(this.repeat); // loop count (extra iterations, 0=repeat forever)
  this.out.writeByte(0); // block terminator
};

/**
 * Writes color table.
 * @returns {void}
 */
GIFEncoder.prototype.writePalette = function() {
  this.out.writeBytes(this.colorTab);
  var n = (3 * 256) - this.colorTab.length;
  for (var i = 0; i < n; i++)
    this.out.writeByte(0);
};

/**
 * @param {string | number} pValue
 * @returns {void}
 */
GIFEncoder.prototype.writeShort = function(pValue) {
  var n = 0xFF;
  this.out.writeByte(pValue & n);
  this.out.writeByte((pValue >> 8) & n);
};

/**
 * Encodes and writes pixel data.
 * @returns {void}
 */
GIFEncoder.prototype.writePixels = function() {
  var enc = new LZWEncoder(this.width, this.height, this.indexedPixels, this.colorDepth);
  enc.encode(this.out);
};

module.exports = GIFEncoder;
