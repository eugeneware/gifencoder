var expect = require('expect.js'),
    fs = require('fs'),
    path = require('path'),
    Canvas = require('canvas'),
    concat = require('concat-stream'),
    stream = require('stream'),
    png = require('png-js'),
    after = require('after'),
    range = require('range'),
    pngFileStream = require('png-file-stream'),
    GIFEncoder = require('..');

function getData(ctx, width, height) {
  return ctx.getImageData(0, 0, width || ctx.canvas.width, height || ctx.canvas.height).data;
}

function fixtures(file) {
  return path.join(__dirname, 'fixtures', file);
}

function root(file) {
  return path.join(__dirname, '..', file);
}

describe('GIFEncoder', function() {
  it('should expose a read streaming interface', function(done) {
    var buf = fs.readFileSync(fixtures('in.png'));
    var img = new Canvas.Image();
    img.src = buf;

    var canvas = new Canvas(img.width, img.height);
    var ctx = canvas.getContext('2d');

    var encoder = new GIFEncoder(img.width, img.height);
    encoder.createReadStream().pipe(concat(function (data) {
      var expected = fs.readFileSync(fixtures('out.gif'));
      expect(data).to.eql(expected);
      done();
    }));

    encoder.start();
    encoder.setRepeat(-1);
    encoder.setDelay(500);
    encoder.setQuality(10);

    ctx.drawImage(img, 0, 0);
    encoder.addFrame(ctx);

    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, img.width, img.height);
    encoder.addFrame(ctx);

    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 0, img.width, img.height);
    encoder.addFrame(ctx);

    encoder.finish();
  });

  it('should expose a write streaming interface', function(done) {
    var buf = fs.readFileSync(fixtures('in.png'));
    var img = new Canvas.Image();
    img.src = buf;

    var canvas = new Canvas(img.width, img.height);
    var ctx = canvas.getContext('2d');

    var encoder = new GIFEncoder(img.width, img.height);
    encoder.createReadStream().pipe(concat(function (data) {
      var expected = fs.readFileSync(fixtures('out.gif'));
      expect(data).to.eql(expected);
      done();
    }));

    encoder.setRepeat(-1);
    encoder.setDelay(500);
    encoder.setQuality(10);

    var ws = encoder.createWriteStream();

    ctx.drawImage(img, 0, 0);
    ws.write(ctx);

    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, img.width, img.height);
    ws.write(ctx);

    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 0, img.width, img.height);
    ws.write(ctx);
    ws.end();
  });

  it('should be able to pipe with bitmaps', function(done) {
    var rs = new stream.Readable({ objectMode: true });
    var frames = [];
    rs._read = function () {
      if (frames.length) {
        rs.push(frames.shift());
      } else {
        rs.push(null);
      }
    };

    var buf = fs.readFileSync(fixtures('in.png'));
    var img = new Canvas.Image();
    img.src = buf;

    var canvas = new Canvas(img.width, img.height);
    var ctx = canvas.getContext('2d');

    var encoder = new GIFEncoder(img.width, img.height);
    encoder.createReadStream().pipe(concat(function (data) {
      var expected = fs.readFileSync(fixtures('out.gif'));
      expect(data).to.eql(expected);
      done();
    }));

    encoder.setRepeat(-1);
    encoder.setDelay(500);
    encoder.setQuality(10);

    var ws = encoder.createWriteStream();

    ctx.drawImage(img, 0, 0);
    frames.push(getData(ctx));

    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, img.width, img.height);
    frames.push(getData(ctx));

    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 0, img.width, img.height);
    frames.push(getData(ctx));

    rs.pipe(ws);
  });

  it('should pipe with png file bitmaps', function(done) {
    var encoder = new GIFEncoder(854, 480);
    pngFileStream('test/**/frame?.png')
      .pipe(encoder.createWriteStream({ repeat: -1, delay: 500, quality: 10 }))
      .pipe(concat(function (data) {
        var expected = fs.readFileSync(fixtures('out.gif'));
        expect(data).to.eql(expected);
        done();
      }));
  });

  it('should pipe with write options', function(done) {
    function createReadStream() {
      var rs = new stream.Readable({ objectMode: true });
      rs._read = function () { };

      var n = 3;
      var next = after(n, finish);
      var frames = [];
      range(0, n).forEach(function (i) {
        png.decode(fixtures('frame' + i + '.png'), function (pixels) {
          frames[i] = pixels;
          next();
        });
      });

      function finish() {
        (function next() {
          if (frames.length) {
            rs.push(frames.shift());
            setImmediate(next);
          } else {
            rs.push(null);
          }
        })();
      }

      return rs;
    }

    var encoder = new GIFEncoder(854, 480);
    encoder.createReadStream().pipe(concat(function (data) {
      var expected = fs.readFileSync(fixtures('out.gif'));
      expect(data).to.eql(expected);
      done();
    }));

    var ws = encoder.createWriteStream({ repeat: -1, delay: 500, quality: 10 });
    createReadStream().pipe(ws);
  });

  it('should pipe a through stream', function(done) {
    function createReadStream() {
      var rs = new stream.Readable({ objectMode: true });
      rs._read = function () { };

      var n = 3;
      var next = after(n, finish);
      var frames = [];
      range(0, n).forEach(function (i) {
        png.decode(fixtures('frame' + i + '.png'), function (pixels) {
          frames[i] = pixels;
          next();
        });
      });

      function finish() {
        (function next() {
          if (frames.length) {
            rs.push(frames.shift());
            setImmediate(next);
          } else {
            rs.push(null);
          }
        })();
      }

      return rs;
    }

    var encoder = new GIFEncoder(854, 480);
    createReadStream()
      .pipe(encoder.createWriteStream({ repeat: -1, delay: 500, quality: 10 }))
      .pipe(concat(function (data) {
        var expected = fs.readFileSync(fixtures('out.gif'));
        expect(data).to.eql(expected);
        done();
      }));
  });
});
