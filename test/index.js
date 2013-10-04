var expect = require('expect.js'),
    fs = require('fs'),
    path = require('path'),
    Canvas = require('canvas'),
    GIFEncoder = require('..');

describe('GIFEncoder', function() {
  it('should be able to Generate a PNG', function(done) {
    var buf = fs.readFileSync(path.join(__dirname, 'fixtures', 'in.png'));
    var img = new Canvas.Image();
    img.src = buf;

    var canvas = new Canvas(img.width, img.height);
    var ctx = canvas.getContext('2d');

    var encoder = new GIFEncoder(img.width, img.height);
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
    var out = encoder.stream().getData();
    var expected = fs.readFileSync(path.join(__dirname, 'fixtures', 'out.gif'));

    expect(out).to.eql(expected);

    done();
  });
});
