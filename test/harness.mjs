// Harness for the Vice City Cover Maker (gta6-cover-art-01).
//
// Node only, no browser: `node test/harness.mjs` from the repo root. It exercises the renderer's pure
// functions from app/src/cover.js with node-canvas, checks the dossier flow the entrypoint runs, the
// screenshots, the offline/reference rules for app/ and the app caps from the kit RULES. It prints a
// pass/fail summary and exits non-zero on any failure.
//
// node-canvas is loaded from the absolute path the task names first, then from tools/node_modules/canvas,
// then from a plain `canvas` resolution. cover.js is an ES module written for the browser, so it is loaded
// by dynamic import when that works and otherwise by reading its source and evaluating the pure functions
// (it has no imports of its own) — either way the functions under test are the app's own code, not a copy.

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(join(here, '..'));
const appDir = join(root, 'app');
const coverPath = join(appDir, 'src', 'cover.js');

// ---------------------------------------------------------------------------
// node-canvas
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);
let canvasLib = null;
const canvasTries = [
  '/home/hatch/workspace/makefun/hexclash/node_modules/canvas',
  join(root, 'tools', 'node_modules', 'canvas'),
  'canvas',
];
for (const spec of canvasTries) {
  try {
    canvasLib = require(spec);
    break;
  } catch {
    // try the next location
  }
}
if (!canvasLib) {
  console.error('FAIL: node-canvas could not be loaded from any of:\n  ' + canvasTries.join('\n  '));
  process.exit(2);
}
const { createCanvas, loadImage } = canvasLib;

// ---------------------------------------------------------------------------
// tiny assertion framework
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];
function check(cond, label) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL: ${label}`);
  }
  return !!cond;
}
function section(name) {
  console.log(`\n== ${name} ==`);
}
function near(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

// ---------------------------------------------------------------------------
// load the renderer's pure functions (Worker 1's app/src/cover.js)
// ---------------------------------------------------------------------------
section('renderer exports');
let cover = null;
try {
  cover = await import(coverPath);
} catch (importErr) {
  // Browser-style ES module without a package.json "type": "module" next to it: Node parses .js as
  // CommonJS, so the export statements fail to load. Fall back to evaluating the source as-is (the
  // renderer is pure functions with no imports of its own) and picking its exports back out.
  try {
    const src = readFileSync(coverPath, 'utf8');
    if (/^\s*import\s/m.test(src)) throw new Error('cover.js has imports; cannot evaluate standalone');
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) names.add(name);
      }
    }
    const stripped = src.replace(/export\s+(?=function|const|let|class)/g, '');
    const list = [...names];
    const factory = new Function(`${stripped}\n;return { ${list.join(', ')} };`);
    cover = factory();
  } catch (evalErr) {
    console.log(`  FAIL: could not load app/src/cover.js (${importErr.message}; fallback: ${evalErr.message})`);
    failed += 1;
    failures.push('load app/src/cover.js');
  }
}
check(cover !== null, 'app/src/cover.js loads');
for (const name of ['SIZES', 'LAYOUTS', 'layoutPanels', 'computeCrop', 'fitCaptionSize', 'renderCover']) {
  check(cover !== null && cover[name] !== undefined, `cover.js exports ${name}`);
}

// ---------------------------------------------------------------------------
// SIZES
// ---------------------------------------------------------------------------
section('SIZES');
function sizeMap() {
  const raw = cover?.SIZES;
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const out = {};
    for (const s of raw) out[String(s.name ?? s.key ?? '').toLowerCase()] = { width: s.width, height: s.height };
    return out;
  }
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    if (Array.isArray(val)) out[key.toLowerCase()] = { width: val[0], height: val[1] };
    else if (val && typeof val === 'object') {
      // The renderer spells dimensions w/h; accept width/height too.
      out[key.toLowerCase()] = { width: val.width ?? val.w, height: val.height ?? val.h };
    }
  }
  return out;
}
const sizes = sizeMap();
check(sizes.square?.width === 1080 && sizes.square?.height === 1080, 'SIZES.square is 1080x1080');
check(sizes.portrait?.width === 1080 && sizes.portrait?.height === 1350, 'SIZES.portrait is 1080x1350');
check(sizes.landscape?.width === 1920 && sizes.landscape?.height === 1080, 'SIZES.landscape is 1920x1080');
const sizeKeys = Object.keys(sizes);
check(sizeKeys.length === 3, `SIZES holds exactly 3 sizes (got ${sizeKeys.length})`);

// ---------------------------------------------------------------------------
// LAYOUTS + layoutPanels
// ---------------------------------------------------------------------------
section('layoutPanels');
function layoutNames() {
  const raw = cover?.LAYOUTS;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    // LAYOUTS entries carry an id (the key layoutPanels/renderCover take) and a display name:
    // prefer the id, since the name is only for the UI.
    return raw.map((entry) =>
      typeof entry === 'string' ? entry : entry.id ?? entry.key ?? entry.name ?? String(entry),
    );
  }
  return Object.keys(raw);
}
function expectedPanels(name) {
  const n = name.toLowerCase();
  if (/duo|split|two|pair/.test(n)) return 2;
  if (/trio|tri|three|strip/.test(n)) return 3;
  if (/hero/.test(n)) return 3; // hero: one big panel on top, two below
  if (/quad|four|grid/.test(n)) return 4;
  if (/single|one|full/.test(n)) return 1;
  return null;
}
function normPanel(p) {
  if (!p || typeof p !== 'object') return null;
  const x = p.x ?? p.left ?? 0;
  const y = p.y ?? p.top ?? 0;
  const w = p.w ?? p.width ?? 0;
  const h = p.h ?? p.height ?? 0;
  if (![x, y, w, h].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return { x, y, w, h };
}
function callLayoutPanels(layout, w, h) {
  const attempts = [
    () => cover.layoutPanels(layout, w, h),
    () => cover.layoutPanels(layout, { width: w, height: h }),
    () => cover.layoutPanels({ layout, width: w, height: h }),
  ];
  for (const fn of attempts) {
    try {
      const out = fn();
      if (Array.isArray(out) && out.length > 0 && out.every((p) => normPanel(p) !== null)) return out.map(normPanel);
    } catch {
      // try the next call shape
    }
  }
  return null;
}
const layouts = layoutNames();
check(layouts.length === 4, `LAYOUTS holds exactly 4 layouts (got ${layouts.length}: ${layouts.join(', ')})`);
for (const layout of layouts) {
  for (const [sizeName, { width: W, height: H }] of Object.entries(sizes)) {
    const panels = callLayoutPanels(layout, W, H);
    check(panels !== null, `layoutPanels(${layout}, ${sizeName}) returns panels`);
    if (!panels) continue;
    const expected = expectedPanels(layout);
    if (expected !== null) check(panels.length === expected, `${layout} has ${expected} panel(s) (got ${panels.length})`);
    else check(panels.length >= 1 && panels.length <= 6, `${layout} panel count ${panels.length} is sane`);
    let area = 0;
    for (const p of panels) {
      check(p.x >= 0 && p.y >= 0, `${layout}/${sizeName} panel inside left/top (x=${p.x}, y=${p.y})`);
      check(p.x + p.w <= W && p.y + p.h <= H, `${layout}/${sizeName} panel inside right/bottom (${p.x + p.w}<=${W}, ${p.y + p.h}<=${H})`);
      check(p.w > 0 && p.h > 0, `${layout}/${sizeName} panel has positive size (${p.w}x${p.h})`);
      area += p.w * p.h;
    }
    check(area >= 0.4 * W * H, `${layout}/${sizeName} panels cover >=40% of the canvas`);
    for (let i = 0; i < panels.length; i += 1) {
      for (let j = i + 1; j < panels.length; j += 1) {
        const a = panels[i];
        const b = panels[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        const overlap = overlapX > 0 && overlapY > 0;
        check(!overlap, `${layout}/${sizeName} panels ${i} and ${j} do not overlap (gutter >= 0)`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// computeCrop
// ---------------------------------------------------------------------------
section('computeCrop');
function normCrop(c) {
  if (!c || typeof c !== 'object') return null;
  const sx = c.sx ?? c.x ?? 0;
  const sy = c.sy ?? c.y ?? 0;
  const sw = c.sw ?? c.w ?? c.width ?? 0;
  const sh = c.sh ?? c.h ?? c.height ?? 0;
  if (![sx, sy, sw, sh].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return { sx, sy, sw, sh };
}
function callComputeCrop(imgW, imgH, panelW, panelH, zoom, ox, oy) {
  const attempts = [
    () => cover.computeCrop(imgW, imgH, panelW, panelH, zoom, ox, oy),
    () => cover.computeCrop({ width: imgW, height: imgH }, { width: panelW, height: panelH }, zoom, { x: ox, y: oy }),
    () => cover.computeCrop({ width: imgW, height: imgH }, { width: panelW, height: panelH }, { zoom, ox, oy }),
  ];
  for (const fn of attempts) {
    try {
      const out = normCrop(fn());
      if (out) return out;
    } catch {
      // try the next call shape
    }
  }
  return null;
}
{
  // Probing: zoom 1 on a same-ratio image must take the whole source (cover-fit, no letterbox).
  const whole = callComputeCrop(800, 600, 400, 300, 1, 0, 0);
  check(whole !== null, 'computeCrop returns a crop rect {sx, sy, sw, sh}');
  if (whole) {
    check(near(whole.sw, 800) && near(whole.sh, 600), `computeCrop zoom 1 same-ratio takes the whole image (got ${whole.sw}x${whole.sh})`);
    check(near(whole.sx, 0) && near(whole.sy, 0), 'computeCrop zoom 1 same-ratio starts at 0,0');
  }
  const imgSizes = [
    [800, 600],
    [600, 800],
    [1200, 800],
    [720, 720],
  ];
  const panelSizes = [
    [400, 300],
    [300, 400],
    [500, 500],
  ];
  const zooms = [1, 1.5, 2, 3];
  const pans = [
    [0, 0],
    [-0.5, 0],
    [0.5, 0],
    [0, -0.5],
    [0, 0.5],
    [-1, -1],
    [1, 1],
  ];
  let zoomShrinks = true;
  for (const [imgW, imgH] of imgSizes) {
    for (const [panelW, panelH] of panelSizes) {
      const base = callComputeCrop(imgW, imgH, panelW, panelH, 1, 0, 0);
      check(base !== null, `computeCrop(${imgW}x${imgH} -> ${panelW}x${panelH}, z=1) returns a rect`);
      if (!base) continue;
      // Cover-fit: the crop keeps the panel's aspect ratio (no letterbox).
      check(near(base.sw / base.sh, panelW / panelH, 0.02), `computeCrop crop ratio matches panel ratio (${base.sw}/${base.sh} vs ${panelW}/${panelH})`);
      for (const zoom of zooms) {
        for (const [ox, oy] of pans) {
          const c = callComputeCrop(imgW, imgH, panelW, panelH, zoom, ox, oy);
          check(c !== null, `computeCrop z=${zoom} pan=(${ox},${oy}) returns a rect`);
          if (!c) continue;
          check(c.sx >= 0, `crop sx>=0 (got ${c.sx}) for ${imgW}x${imgH} z=${zoom} pan=(${ox},${oy})`);
          check(c.sy >= 0, `crop sy>=0 (got ${c.sy}) for ${imgW}x${imgH} z=${zoom} pan=(${ox},${oy})`);
          check(c.sx + c.sw <= imgW + 1e-6, `crop sx+sw<=imgW (got ${c.sx + c.sw}<=${imgW}) z=${zoom} pan=(${ox},${oy})`);
          check(c.sy + c.sh <= imgH + 1e-6, `crop sy+sh<=imgH (got ${c.sy + c.sh}<=${imgH}) z=${zoom} pan=(${ox},${oy})`);
          check(c.sw > 0 && c.sh > 0, `crop has positive size (${c.sw}x${c.sh}) z=${zoom} pan=(${ox},${oy})`);
        }
      }
      const zoomed = callComputeCrop(imgW, imgH, panelW, panelH, 2, 0, 0);
      if (zoomed && !near(zoomed.sw, base.sw) && zoomed.sw >= base.sw) zoomShrinks = false;
      if (zoomed) check(zoomed.sw < base.sw && zoomed.sh < base.sh, `computeCrop zoom 2 shrinks the source rect (${zoomed.sw}x${zoomed.sh} < ${base.sw}x${base.sh})`);
    }
  }
  check(zoomShrinks, 'computeCrop zoom>1 never enlarges the source rect');
}

// ---------------------------------------------------------------------------
// fitCaptionSize
// ---------------------------------------------------------------------------
section('fitCaptionSize');
function callFitCaption(text, maxW, start) {
  // The real signature is fitCaptionSize(ctx, text, maxW, startSize): the context does the measuring.
  const probe = createCanvas(800, 200);
  const pctx = probe.getContext('2d');
  const attempts = [
    () => cover.fitCaptionSize(pctx, text, maxW, start),
    () => cover.fitCaptionSize(pctx, text, maxW),
    () => cover.fitCaptionSize(text, maxW, start),
  ];
  for (const fn of attempts) {
    try {
      const out = fn();
      if (typeof out === 'number' && Number.isFinite(out) && out > 0) return out;
    } catch {
      // try the next call shape
    }
  }
  return null;
}
{
  const short = callFitCaption('HEIST', 500, 80);
  check(short !== null, 'fitCaptionSize returns a number for short text');
  const long = callFitCaption('THE BIGGEST HEIST VICE CITY HAS EVER SEEN', 500, 80);
  check(long !== null, 'fitCaptionSize returns a number for long text');
  if (short !== null && long !== null) {
    check(long < short, `fitCaptionSize shrinks for longer text (${long} < ${short})`);
    check(short <= 80, `fitCaptionSize never exceeds the start size (${short} <= 80)`);
  }
  const veryLongA = callFitCaption('A'.repeat(120), 400, 80);
  const veryLongB = callFitCaption('B'.repeat(200), 400, 80);
  check(veryLongA !== null && veryLongB !== null, 'fitCaptionSize returns a number for very long text');
  if (veryLongA !== null && veryLongB !== null) {
    check(veryLongA >= 8, `fitCaptionSize never goes below its 8px floor (got ${veryLongA})`);
    check(veryLongA === veryLongB, `fitCaptionSize bottoms out at the floor for very long text (${veryLongA} vs ${veryLongB})`);
  }
  // It must fit the width: measure with a plain bold sans face at the returned size (loose tolerance,
  // since the app measures in Anton, which is narrower than the fallback face).
  const probe = createCanvas(800, 200);
  const pctx = probe.getContext('2d');
  for (const text of ['SUNSET HEIST', 'BOULEVARD QUEEN OF VICE CITY']) {
    const size = callFitCaption(text, 500, 80);
    if (size === null) {
      check(false, `fitCaptionSize returns a size for "${text}"`);
      continue;
    }
    pctx.font = `bold ${size}px sans-serif`;
    const w = pctx.measureText(text).width;
    check(w <= 500 * 1.3, `fitCaptionSize("${text}") fits ~500px (measured ${Math.round(w)}px at ${size}px)`);
  }
}

// ---------------------------------------------------------------------------
// renderCover: determinism + correctness (node-canvas)
// ---------------------------------------------------------------------------
section('renderCover');
function withNaturalSize(img) {
  // node-canvas images carry width/height; give them naturalWidth/naturalHeight too, in case the
  // renderer reads those (a browser Image has both).
  if (img && img.naturalWidth === undefined) {
    Object.defineProperty(img, 'naturalWidth', { value: img.width });
    Object.defineProperty(img, 'naturalHeight', { value: img.height });
  }
  return img;
}
let photo = null;
try {
  photo = withNaturalSize(await loadImage(join(appDir, 'samples', 'pier.jpg')));
  check(photo.width === 720 && photo.height === 720, 'sample photo pier.jpg loads (720x720)');
} catch (e) {
  check(false, `sample photo pier.jpg loads (${e.message})`);
}
const firstLayout = layouts[0] ?? 'duo';
function baseOpts(overrides = {}) {
  // renderCover(ctx, opts): opts.size is a SIZES key, opts.layout a LAYOUTS id, and photos are
  // [{ img, zoom, ox, oy }] — one entry per panel slot (assign maps panels to photos).
  return {
    photo: null,
    caption: 'SUNSET HEIST',
    layout: firstLayout,
    size: 'square',
    sizeKey: 'square',
    width: sizes.square?.width ?? 1080,
    height: sizes.square?.height ?? 1080,
    zoom: 1,
    ox: 0,
    oy: 0,
    ...overrides,
  };
}
function renderOpts(opts) {
  return {
    size: opts.sizeKey ?? opts.size,
    layout: opts.layout,
    caption: opts.caption,
    photos: opts.photo ? [{ img: opts.photo, zoom: opts.zoom ?? 1, ox: opts.ox ?? 0, oy: opts.oy ?? 0 }] : [],
    grade: opts.grade ?? 'sunset',
  };
}
let renderShape = null;
function tryRender(canvas, opts) {
  const ctx = canvas.getContext('2d');
  const shapes = [
    () => cover.renderCover(ctx, renderOpts(opts)),
    () => cover.renderCover(ctx, opts),
    () => cover.renderCover(canvas, opts),
    () => cover.renderCover(canvas, opts.photo ?? null, opts.caption, opts.layout, opts.sizeKey ?? opts.size),
  ];
  for (let i = 0; i < shapes.length; i += 1) {
    try {
      const out = shapes[i]();
      if (out && typeof out.then === 'function') throw new Error('renderCover returned a promise (sync render expected)');
      return i;
    } catch {
      // try the next call shape
    }
  }
  return -1;
}
function renderOnce(opts) {
  const w = opts.width ?? sizes[opts.sizeKey ?? opts.size]?.width ?? 1080;
  const h = opts.height ?? sizes[opts.sizeKey ?? opts.size]?.height ?? 1080;
  const canvas = createCanvas(w, h);
  if (renderShape === null) {
    renderShape = tryRender(canvas, opts);
    check(renderShape >= 0, `renderCover accepts (ctx, opts) (layout=${opts.layout}, size=${w}x${h})`);
    if (renderShape < 0) return null;
    return canvas;
  }
  const ctx = canvas.getContext('2d');
  const shapes = [
    () => cover.renderCover(ctx, renderOpts(opts)),
    () => cover.renderCover(ctx, opts),
    () => cover.renderCover(canvas, opts),
    () => cover.renderCover(canvas, opts.photo ?? null, opts.caption, opts.layout, opts.sizeKey ?? opts.size),
  ];
  shapes[renderShape]();
  return canvas;
}
function pngBytes(canvas) {
  return canvas ? canvas.toBuffer('image/png') : null;
}
function pixelsDiffer(a, b) {
  return !!a && !!b && !a.equals(b);
}
if (photo && cover?.renderCover) {
  const noPhotoA = renderOnce(baseOpts());
  const noPhotoB = renderOnce(baseOpts());
  const aBytes = pngBytes(noPhotoA);
  const bBytes = pngBytes(noPhotoB);
  check(aBytes !== null && bBytes !== null, 'renderCover renders a no-photo cover');
  if (aBytes && bBytes) check(aBytes.equals(bBytes), 'renderCover is deterministic: same opts twice -> byte-identical PNG');
  const withPhoto = renderOnce(baseOpts({ photo }));
  const photoBytes = pngBytes(withPhoto);
  check(photoBytes !== null, 'renderCover renders with a real sample photo');
  if (aBytes && photoBytes) check(pixelsDiffer(aBytes, photoBytes), 'render with a photo differs from the no-photo render');
  const otherCaption = renderOnce(baseOpts({ caption: 'BOULEVARD QUEEN' }));
  const captionBytes = pngBytes(otherCaption);
  if (aBytes && captionBytes) check(pixelsDiffer(aBytes, captionBytes), 'changing the caption changes the pixels');
  if (layouts.length > 1) {
    const otherLayout = renderOnce(baseOpts({ layout: layouts[1] }));
    const layoutBytes = pngBytes(otherLayout);
    if (aBytes && layoutBytes) check(pixelsDiffer(aBytes, layoutBytes), `different layouts differ (${layouts[0]} vs ${layouts[1]})`);
  }
  for (const [sizeName, { width: W, height: H }] of Object.entries(sizes)) {
    const canvas = renderOnce(baseOpts({ size: sizeName, sizeKey: sizeName, width: W, height: H, photo }));
    check(canvas !== null && canvas.width === W && canvas.height === H, `rendered ${sizeName} canvas is exactly ${W}x${H}`);
    const bytes = pngBytes(canvas);
    if (bytes && noPhotoA) {
      // A second render of the same size+opts must be identical too (per-size determinism).
      const again = renderOnce(baseOpts({ size: sizeName, sizeKey: sizeName, width: W, height: H, photo }));
      const againBytes = pngBytes(again);
      check(!!againBytes && bytes.equals(againBytes), `renderCover deterministic at ${sizeName} (${W}x${H})`);
    }
  }
} else {
  check(false, 'renderCover determinism tests need a loaded photo and renderCover');
}

// ---------------------------------------------------------------------------
// Dossier flow: run main.ts twice, the two out/ trees must be byte-identical
// ---------------------------------------------------------------------------
section('dossier flow (main.ts twice)');
function hashTree(dir) {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const rel = p.slice(dir.length + 1);
      if (lstatSync(p).isDirectory()) walk(p);
      else out[rel] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  walk(dir);
  return out;
}
let dossierOk = false;
try {
  rmSync(join(root, 'out'), { recursive: true, force: true });
  execSync('mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts', { cwd: root, stdio: 'pipe' });
  const first = hashTree(join(root, 'out'));
  execSync('mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts', { cwd: root, stdio: 'pipe' });
  const second = hashTree(join(root, 'out'));
  check(Object.keys(first).length > 0, 'dossier run writes files to out/');
  check(JSON.stringify(first) === JSON.stringify(second), 'dossier flow twice is byte-identical (every file hash matches)');
  const dossierPath = join(root, 'out', 'dossier.json');
  check(existsSync(dossierPath), 'out/dossier.json exists');
  if (existsSync(dossierPath)) {
    const bytes = statSync(dossierPath).size;
    check(bytes <= 1572864, `out/dossier.json is <=1.5 MiB (${bytes} bytes)`);
    try {
      JSON.parse(readFileSync(dossierPath, 'utf8'));
      check(true, 'out/dossier.json parses as JSON');
      dossierOk = true;
    } catch (e) {
      check(false, `out/dossier.json parses as JSON (${e.message})`);
    }
  }
  const indexPath = join(root, 'out', 'app', 'index.html');
  check(existsSync(indexPath), 'out/app/index.html exists');
  if (existsSync(indexPath)) check(statSync(indexPath).size <= 1048576, `out/app/index.html is <=1 MiB (${statSync(indexPath).size} bytes)`);
} catch (e) {
  check(false, `dossier flow runs cleanly (${String(e.message ?? e).split('\n')[0]})`);
} finally {
  rmSync(join(root, 'out'), { recursive: true, force: true });
}
check(dossierOk, 'dossier flow completed end to end');

// ---------------------------------------------------------------------------
// Screenshots
// ---------------------------------------------------------------------------
section('screenshots');
{
  const dir = join(root, 'screenshots');
  const names = existsSync(dir) ? readdirSync(dir).filter((n) => !n.startsWith('.')).sort() : [];
  check(names.length >= 3 && names.length <= 4, `screenshots/ holds 3-4 files (got ${names.length})`);
  for (const name of names) {
    const p = join(dir, name);
    const bytes = statSync(p).size;
    check(bytes <= 262144, `screenshots/${name} is <=256 KiB (${bytes} bytes)`);
    const magic = readFileSync(p).subarray(0, 4);
    const isPng = magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4e && magic[3] === 0x47;
    const isJpeg = magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff;
    check(isPng || isJpeg, `screenshots/${name} has valid PNG/JPEG magic bytes`);
    try {
      const img = await loadImage(p);
      const longSide = Math.max(img.width, img.height);
      const shortSide = Math.min(img.width, img.height);
      check(longSide <= 1280, `screenshots/${name} long side <=1280 (${longSide})`);
      check(shortSide >= 480, `screenshots/${name} short side >=480 (${shortSide})`);
    } catch (e) {
      check(false, `screenshots/${name} decodes as an image (${e.message})`);
    }
  }
}

// ---------------------------------------------------------------------------
// No external references in app/
// ---------------------------------------------------------------------------
section('no external references in app/');
function textFilesUnder(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (lstatSync(p).isDirectory()) walk(p);
      else if (['.html', '.js', '.mjs', '.css'].includes(extname(name))) out.push(p);
    }
  };
  walk(dir);
  return out;
}
function resolveSpec(fromFile, spec) {
  if (spec.startsWith('data:')) return { ok: true, kind: 'data' };
  if (spec.startsWith('/')) return { ok: existsSync(join(appDir, spec.slice(1))), kind: 'root-relative' };
  return { ok: existsSync(resolve(dirname(fromFile), spec)), kind: 'relative' };
}
{
  const files = textFilesUnder(appDir);
  check(files.length > 0, 'app/ holds text files to scan');
  const protoRelative = /(?:["'`\s(=,])\/\/(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:[/"'\s]|$)/;
  for (const file of files) {
    const rel = file.slice(appDir.length + 1);
    const src = readFileSync(file, 'utf8');
    check(!src.includes('http://'), `${rel}: no http:// URL`);
    check(!src.includes('https://'), `${rel}: no https:// URL`);
    check(!protoRelative.test(src), `${rel}: no protocol-relative //host URL`);
    check(!src.includes('eval('), `${rel}: no eval(`);
    check(!src.includes('new Function'), `${rel}: no new Function`);
    check(!src.includes('serviceWorker'), `${rel}: no serviceWorker`);
    check(!src.includes('document.cookie'), `${rel}: no document.cookie`);
    const specs = new Set();
    for (const m of src.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) specs.add(m[1]);
    for (const m of src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) specs.add(m[1]);
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*["']([^"']+)["']/g)) specs.add(m[1]);
    for (const m of src.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) specs.add(m[1]);
    for (const m of src.matchAll(/import\s+["']([^"']+)["']/g)) specs.add(m[1]);
    for (const spec of specs) {
      if (spec.startsWith('#')) continue; // fragment-only link
      const r = resolveSpec(file, spec);
      check(r.ok, `${rel}: reference "${spec}" resolves to a file under app/ or a data: URI`);
    }
  }
}

// ---------------------------------------------------------------------------
// App caps + fonts
// ---------------------------------------------------------------------------
section('app caps + fonts');
{
  let count = 0;
  let bytes = 0;
  let symlinks = 0;
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const st = lstatSync(p);
      count += 1;
      if (st.isSymbolicLink()) symlinks += 1;
      else if (st.isDirectory()) walk(p);
      else bytes += st.size;
    }
  };
  walk(appDir);
  check(symlinks === 0, `app/ holds no symlinks (got ${symlinks})`);
  check(count <= 993, `app/ file count <=993 (got ${count})`);
  check(bytes <= 50331648, `app/ total bytes <=48 MiB (got ${bytes})`);
  const indexPath = join(appDir, 'index.html');
  check(existsSync(indexPath), 'app/index.html exists');
  if (existsSync(indexPath)) check(statSync(indexPath).size <= 1048576, `app/index.html <=1 MiB (${statSync(indexPath).size} bytes)`);
  const fontsDir = join(appDir, 'fonts');
  check(existsSync(fontsDir), 'app/fonts/ exists');
  if (existsSync(fontsDir)) {
    const fontFiles = readdirSync(fontsDir).filter((n) => /\.(ttf|otf|woff2?)$/i.test(n));
    check(fontFiles.length > 0, `app/fonts/ holds a font file (got ${fontFiles.join(', ') || 'none'})`);
    for (const f of fontFiles) check(statSync(join(fontsDir, f)).size > 0, `app/fonts/${f} is non-empty`);
    const license = readdirSync(fontsDir).filter((n) => /ofl|licen[cs]e/i.test(n));
    check(license.length > 0, `app/fonts/ holds an OFL license file (got ${license.join(', ') || 'none'})`);
    if (license.length > 0) {
      const text = readFileSync(join(fontsDir, license[0]), 'utf8');
      check(/SIL Open Font License/i.test(text), `${license[0]} is the SIL Open Font License`);
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n================ harness: ${passed} passed, ${failed} failed (${passed + failed} assertions) ================`);
if (failed > 0) {
  console.log('failures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('harness: all green');
