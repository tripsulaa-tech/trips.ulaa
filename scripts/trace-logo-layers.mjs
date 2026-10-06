// Traces logo layer PNGs into vector SVG layers for Logo Studio's SVG / PDF downloads.
//
//   npm i --no-save potrace
//   node scripts/trace-logo-layers.mjs                        (every public/logo-layers/*.png)
//   node scripts/trace-logo-layers.mjs path/to/layer.png ...  (just these)
//
// Each `name.png` gets a `name.svg` beside it: one path, in the PNG's own pixel
// coordinates (viewBox = PNG size). A layer's shape is read from its alpha channel,
// so the colour inside the PNG does not matter (Logo Studio tints it anyway).
// Logo Studio uses `name.svg` when it exists and falls back to the PNG when it doesn't.
import { readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { Potrace } = require('potrace');
const Jimp = require('jimp');

const DIR = 'public/logo-layers';
const args = process.argv.slice(2);
const files = args.length
  ? args
  : (await readdir(DIR)).filter(f => f.toLowerCase().endsWith('.png')).map(f => path.join(DIR, f));

for (const file of files) {
  const img = await Jimp.read(file);
  const { width, height } = img.bitmap;
  // Alpha -> black ink on white paper, which is what potrace traces.
  img.scan(0, 0, width, height, function (x, y, idx) {
    const ink = 255 - this.bitmap.data[idx + 3];
    this.bitmap.data[idx] = ink;
    this.bitmap.data[idx + 1] = ink;
    this.bitmap.data[idx + 2] = ink;
    this.bitmap.data[idx + 3] = 255;
  });
  const tracer = new Potrace({ threshold: 128, turdSize: 4, optTolerance: 0.4, alphaMax: 1 });
  await new Promise((resolve, reject) => tracer.loadImage(img, err => (err ? reject(err) : resolve())));
  const d = [...tracer.getSVG().matchAll(/\sd="([^"]+)"/g)].map(m => m[1]).join(' ');
  const compact = d.replace(/(\d+\.\d{2})\d+/g, '$1').replace(/\.00\b/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path fill-rule="evenodd" d="${compact}"/></svg>\n`;
  const out = file.replace(/\.png$/i, '.svg');
  await writeFile(out, svg);
  console.log(`${out}  ${(svg.length / 1024).toFixed(0)} KB`);
}
