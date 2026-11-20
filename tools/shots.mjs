// shots.mjs — renders the 4 screenshots for gta6-cover-art-01 with node-canvas,
// using the app's own drawing code (app/src/cover.js + app/src/editor-scene.js)
// so every screenshot is the app's real rendering, never composited or edited.
// Run: node tools/shots.mjs   (from the repo root, or anywhere — paths are
// resolved from this file's directory).
//
// Gate limits (RULES.txt): each file <= 256 KiB, long side <= 1280 px,
// short side >= 480 px. PNG first; JPEG quality 88 only if a PNG is too big.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import { renderCover, SIZES } from '../app/src/cover.js';
import { renderEditorScene } from '../app/src/editor-scene.js';

const require = createRequire(import.meta.url);
// Reuse the hexclash node-canvas install (Node 24 works with it, canvas 3.2.3).
// If that ever fails, `npm install canvas` inside tools/ and point here instead.
const { createCanvas, loadImage, registerFont } = require(
  '/home/hatch/workspace/makefun/hexclash/node_modules/canvas',
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS_DIR = path.join(ROOT, 'screenshots');
const MAX_BYTES = 256 * 1024;
const MAX_LONG = 1280;
const MIN_SHORT = 480;

registerFont(path.join(ROOT, 'app/fonts/Anton-Regular.ttf'), { family: 'Anton' });
registerFont(path.join(ROOT, 'app/fonts/Oswald-Variable.ttf'), { family: 'Oswald' });

const pier = await loadImage(path.join(ROOT, 'app/samples/pier.jpg'));
const boulevard = await loadImage(path.join(ROOT, 'app/samples/boulevard.jpg'));

// Render a cover at its native export size, then downscale to fit the gate.
function renderCoverCanvas(opts) {
  const dims = SIZES[opts.size];
  const canvas = createCanvas(dims.w, dims.h);
  renderCover(canvas.getContext('2d'), opts);
  return canvas;
}

function downscale(src, targetW, targetH) {
  const canvas = createCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(src, 0, 0, targetW, targetH);
  return canvas;
}

// Encode PNG first; if it busts the 256 KiB gate, re-encode as JPEG q88
// under the same base name. Throws if the dimensions break the gate.
function writeShot(canvas, baseName) {
  const w = canvas.width;
  const h = canvas.height;
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (long > MAX_LONG) throw new Error(`${baseName}: long side ${long} > ${MAX_LONG}`);
  if (short < MIN_SHORT) throw new Error(`${baseName}: short side ${short} < ${MIN_SHORT}`);
  let buf = canvas.toBuffer('image/png');
  let name = `${baseName}.png`;
  if (buf.length > MAX_BYTES) {
    buf = canvas.toBuffer('image/jpeg', { quality: 0.88 });
    name = `${baseName}.jpg`;
    if (buf.length > MAX_BYTES) {
      throw new Error(`${name}: still ${buf.length} bytes > ${MAX_BYTES} even as JPEG q88`);
    }
  }
  fs.writeFileSync(path.join(SHOTS_DIR, name), buf);
  console.log(`${name}  ${w}x${h}  ${buf.length} bytes  (${name.endsWith('.png') ? 'PNG' : 'JPEG q88'})`);
  return { name, w, h, bytes: buf.length };
}

fs.mkdirSync(SHOTS_DIR, { recursive: true });
const results = [];

// 01 — the cover: exported LANDSCAPE cover (1920x1080 -> 1280x720),
// duo layout, both sample photos, sunset grade. Duo (not quad): the wide
// quad panels cover-crop both faces out of frame (both photos have their
// faces near the top), while duo's tall panels show each face whole.
{
  const full = renderCoverCanvas({
    photos: [
      { img: pier, zoom: 1.05, ox: 0, oy: 0 },
      { img: boulevard, zoom: 1.15, ox: 0, oy: -1 },
    ],
    assign: [0, 1],
    caption: 'SUNSET HEIST',
    tagline: 'VICE CITY • 2026',
    size: 'landscape',
    layout: 'duo',
    grade: 'sunset',
  });
  results.push(writeShot(downscale(full, 1280, 720), '01-cover'));
}

// 02 — the editor: 1280x720 editor scene with a square cover preview,
// pier.jpg loaded, caption visible.
{
  const preview = renderCoverCanvas({
    photos: [
      { img: pier, zoom: 1.15, ox: 0, oy: 0 },
      { img: boulevard, zoom: 1.1, ox: 0, oy: 0 },
    ],
    assign: [0, 1, 0, 1],
    caption: 'SUNSET HEIST',
    tagline: 'VICE CITY • 2026',
    size: 'square',
    layout: 'quad',
    grade: 'sunset',
  });
  const canvas = createCanvas(1280, 720);
  renderEditorScene(canvas.getContext('2d'), 1280, 720, {
    coverCanvas: preview,
    caption: 'SUNSET HEIST',
    layout: 'quad',
    size: 'square',
    grade: 'sunset',
    photoNames: ['pier.jpg', 'boulevard.jpg'],
  });
  results.push(writeShot(canvas, '02-editor'));
}

// 03 — exported PORTRAIT cover (1080x1350 -> 1024x1280),
// neon grade, trio layout, boulevard.jpg, different caption.
// Trio (not hero): the hero's wide top panel cover-crops the woman's face
// out of frame; trio's tall panels show her full height in all three.
{
  const full = renderCoverCanvas({
    photos: [{ img: boulevard, zoom: 1.0, ox: 0, oy: 0 }],
    assign: [0, 0, 0],
    caption: 'NEON NIGHTS',
    tagline: 'AFTER DARK • VICE CITY',
    size: 'portrait',
    layout: 'trio',
    grade: 'neon',
  });
  results.push(writeShot(downscale(full, 1024, 1280), '03-portrait'));
}

// 04 — exported SQUARE cover (1080x1080 native),
// trio layout, pier.jpg, sunset grade, different caption.
{
  const full = renderCoverCanvas({
    photos: [{ img: pier, zoom: 1.2, ox: 0, oy: 0 }],
    assign: [0, 0, 0],
    caption: 'BOULEVARD QUEEN',
    tagline: 'VICE CITY • 2026',
    size: 'square',
    layout: 'trio',
    grade: 'sunset',
  });
  results.push(writeShot(full, '04-square'));
}

console.log(`\n4 shots written to ${SHOTS_DIR}`);
for (const r of results) {
  if (r.bytes > MAX_BYTES) throw new Error(`${r.name} over gate: ${r.bytes}`);
}
console.log('All shots within gate limits (<=256 KiB, long side <=1280, short side >=480).');
