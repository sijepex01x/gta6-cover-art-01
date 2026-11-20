// cover.js — the cover-art renderer for Vice City Cover Maker.
// Pure ES module: no DOM, window or document anywhere, so it runs in the
// browser and in Node (node-canvas) unchanged. Deterministic: the same
// options always paint the same pixels — the skyline and palms come from a
// seeded hash of layout + size + grade, never Math.random.

export const SIZES = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  landscape: { w: 1920, h: 1080 },
};

const GUTTER_FRAC = 0.012; // gutter width, as a fraction of W

// Panel layouts, each a function of the content box (w, h in px) and the
// gutter g (px) returning panel rects relative to the content box origin.
// Panels tile the whole content box: the gutters between them (and the
// outer frame) are the same width, so the poster reads as one framed sheet
// with the sunset sky showing through the gutters.
const LAYOUT_DEFS = {
  duo: (w, h, g) => {
    const pw = (w - g) / 2;
    return [
      { x: 0, y: 0, w: pw, h },
      { x: pw + g, y: 0, w: pw, h },
    ];
  },
  trio: (w, h, g) => {
    const leftW = (w - g) * 0.58;
    const rightW = w - g - leftW;
    const rh = (h - g) / 2;
    return [
      { x: 0, y: 0, w: leftW, h },
      { x: leftW + g, y: 0, w: rightW, h: rh },
      { x: leftW + g, y: rh + g, w: rightW, h: rh },
    ];
  },
  quad: (w, h, g) => {
    const pw = (w - g) / 2;
    const ph = (h - g) / 2;
    return [
      { x: 0, y: 0, w: pw, h: ph },
      { x: pw + g, y: 0, w: pw, h: ph },
      { x: 0, y: ph + g, w: pw, h: ph },
      { x: pw + g, y: ph + g, w: pw, h: ph },
    ];
  },
  hero: (w, h, g) => {
    const heroH = (h - g) * 0.62;
    const botH = h - g - heroH;
    const pw = (w - g) / 2;
    return [
      { x: 0, y: 0, w, h: heroH },
      { x: 0, y: heroH + g, w: pw, h: botH },
      { x: pw + g, y: heroH + g, w: pw, h: botH },
    ];
  },
};

export const LAYOUTS = [
  { id: 'duo', name: 'Duo', panels: LAYOUT_DEFS.duo },
  { id: 'trio', name: 'Trio', panels: LAYOUT_DEFS.trio },
  { id: 'quad', name: 'Quad', panels: LAYOUT_DEFS.quad },
  { id: 'hero', name: 'Hero', panels: LAYOUT_DEFS.hero },
];

export function layoutPanels(layoutId, W, H) {
  const def = LAYOUT_DEFS[layoutId] || LAYOUT_DEFS.duo;
  const frame = GUTTER_FRAC * W; // outer frame, same width as the gutters
  const g = GUTTER_FRAC * W;
  const cw = W - 2 * frame;
  const ch = H - 2 * frame;
  return def(cw, ch, g).map((p) => ({
    x: frame + p.x,
    y: frame + p.y,
    w: p.w,
    h: p.h,
  }));
}

// --- deterministic pseudo-randomness ---------------------------------------
// FNV-1a hash of a string, then mulberry32. Same seed string -> same stream.

function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- cover-fit crop ---------------------------------------------------------

export function computeCrop(imgW, imgH, panelW, panelH, zoom = 1, ox = 0, oy = 0) {
  const z = Math.max(1, zoom || 1);
  const px = Math.max(-1, Math.min(1, ox || 0));
  const py = Math.max(-1, Math.min(1, oy || 0));
  const panelAspect = panelW / panelH;
  const imgAspect = imgW / imgH;
  // Base cover crop: the largest source rect with the panel's aspect.
  let sw0;
  let sh0;
  if (imgAspect > panelAspect) {
    sh0 = imgH;
    sw0 = imgH * panelAspect;
  } else {
    sw0 = imgW;
    sh0 = imgW / panelAspect;
  }
  const sw = sw0 / z;
  const sh = sh0 / z;
  // Centre the base crop, then pan within the slack the zoom opened up:
  // px=0 keeps the crop centred on the base crop, px=+1/-1 push it to the
  // base crop's right/left edge. Clamped so it never leaves the image.
  const sx0 = (imgW - sw0) / 2;
  const sy0 = (imgH - sh0) / 2;
  const slackX = (sw0 - sw) / 2;
  const slackY = (sh0 - sh) / 2;
  const sx = Math.max(0, Math.min(imgW - sw, sx0 + slackX + px * slackX));
  const sy = Math.max(0, Math.min(imgH - sh, sy0 + slackY + py * slackY));
  return { sx, sy, sw, sh };
}

// --- text helpers -----------------------------------------------------------

const FONT_STACK = 'Anton, "Arial Black", sans-serif';

function fontString(size, weight = 400) {
  return `${weight} ${size}px ${FONT_STACK}`;
}

// Largest size <= startSize whose width fits maxW (never below 8px).
export function fitCaptionSize(ctx, text, maxW, startSize) {
  let size = Math.max(8, startSize);
  ctx.font = fontString(size, 900);
  while (size > 8 && ctx.measureText(text).width > maxW) {
    size = Math.max(8, size * 0.92);
    ctx.font = fontString(size, 900);
  }
  return size;
}

// Draws text with extra tracking between glyphs (canvas letterSpacing is
// not in every engine, so spacing is done by hand). Returns total width.
function drawTracked(ctx, text, x, y, tracking) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  return cx - tracking - x;
}

function trackedWidth(ctx, text, tracking) {
  let w = -tracking;
  for (const ch of text) w += ctx.measureText(ch).width + tracking;
  return Math.max(0, w);
}

// --- the cover --------------------------------------------------------------

export function renderCover(ctx, opts) {
  const sizeKey = opts.size && SIZES[opts.size] ? opts.size : 'square';
  const { w: W, h: H } = SIZES[sizeKey];
  const layoutId = LAYOUT_DEFS[opts.layout] ? opts.layout : 'duo';
  const grade = opts.grade === 'neon' ? 'neon' : 'sunset';
  const caption = (opts.caption || 'VICE CITY').toUpperCase();
  const tagline = opts.tagline === undefined ? 'VICE CITY • 2026' : opts.tagline;
  const captionColor = opts.captionColor || '#ffffff';
  const captionY = typeof opts.captionY === 'number' ? opts.captionY : 0.86;
  const photos = Array.isArray(opts.photos) ? opts.photos : [];
  const assign = Array.isArray(opts.assign) ? opts.assign : [];
  const rand = mulberry32(hashSeed(`${layoutId}|${sizeKey}|${grade}`));

  ctx.save();
  ctx.clearRect(0, 0, W, H);

  // (1) Sky: vertical sunset / neon gradient. It shows through the gutters
  // and the outer frame, so the sunset grades the whole sheet.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  if (grade === 'sunset') {
    sky.addColorStop(0.0, '#1b0b38');
    sky.addColorStop(0.42, '#7a2a8e');
    sky.addColorStop(0.66, '#e14e6d');
    sky.addColorStop(0.84, '#ff8c42');
    sky.addColorStop(1.0, '#ffc46b');
  } else {
    sky.addColorStop(0.0, '#0a0118');
    sky.addColorStop(0.42, '#4a0e7a');
    sky.addColorStop(0.66, '#ff2e88');
    sky.addColorStop(0.86, '#00d4ff');
    sky.addColorStop(1.0, '#7df9ff');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // (2) Sun disc with glow, sitting on the horizon (bottom third).
  const horizonY = H * 0.68;
  const sunX = W * (0.58 + rand() * 0.12);
  const sunR = Math.min(W, H) * 0.11;
  const glow = ctx.createRadialGradient(sunX, horizonY, sunR * 0.2, sunX, horizonY, sunR * 3.2);
  glow.addColorStop(0, grade === 'sunset' ? 'rgba(255,170,80,0.65)' : 'rgba(255,46,136,0.55)');
  glow.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - sunR * 3.2, horizonY - sunR * 3.2, sunR * 6.4, sunR * 6.4);
  ctx.beginPath();
  ctx.arc(sunX, horizonY, sunR, 0, Math.PI * 2);
  ctx.fillStyle = grade === 'sunset' ? '#ffe9a8' : '#ff7ad9';
  ctx.fill();

  // (3) Skyline silhouette along the bottom third + palm trees.
  const silColor = grade === 'sunset' ? '#170a2e' : '#0d0226';
  const winColor = grade === 'sunset' ? 'rgba(255,205,100,0.9)' : 'rgba(0,229,255,0.9)';
  ctx.fillStyle = silColor;
  let bx = -W * 0.02;
  while (bx < W * 1.02) {
    const bw = W * (0.045 + rand() * 0.065);
    const bh = H * (0.07 + rand() * 0.2);
    const by = H - bh;
    ctx.fillRect(bx, by, bw, bh);
    // Antenna on some towers.
    if (rand() < 0.3) {
      ctx.fillRect(bx + bw / 2 - 1, by - H * 0.03, 2, H * 0.03);
      ctx.beginPath();
      ctx.arc(bx + bw / 2, by - H * 0.03, Math.max(2, W * 0.002), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,90,90,0.95)';
      ctx.fill();
      ctx.fillStyle = silColor;
    }
    // Lit windows.
    ctx.fillStyle = winColor;
    const cols = Math.max(1, Math.floor(bw / (W * 0.014)));
    const rows = Math.max(1, Math.floor(bh / (H * 0.02)));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (rand() < 0.28) {
          ctx.fillRect(
            bx + W * 0.006 + c * (W * 0.014),
            by + H * 0.008 + r * (H * 0.02),
            Math.max(2, W * 0.005),
            Math.max(2, H * 0.008),
          );
        }
      }
    }
    ctx.fillStyle = silColor;
    bx += bw + W * (0.004 + rand() * 0.012);
  }
  // Palm silhouettes in front of the towers.
  const palms = 2 + Math.floor(rand() * 3);
  ctx.strokeStyle = silColor;
  ctx.fillStyle = silColor;
  for (let i = 0; i < palms; i++) {
    const px = W * (0.06 + rand() * 0.88);
    const ph = H * (0.09 + rand() * 0.08);
    const lean = (rand() - 0.5) * W * 0.03;
    const topX = px + lean;
    const topY = H - ph;
    ctx.lineWidth = Math.max(3, W * 0.006);
    ctx.beginPath();
    ctx.moveTo(px, H);
    ctx.quadraticCurveTo(px + lean * 0.4, H - ph * 0.6, topX, topY);
    ctx.stroke();
    // Fronds: arcs fanning out from the crown.
    ctx.lineWidth = Math.max(2, W * 0.004);
    const fronds = 6;
    for (let f = 0; f < fronds; f++) {
      const a = Math.PI * (0.08 + (f / (fronds - 1)) * 0.84);
      const fx = topX + Math.cos(a) * ph * 0.55;
      const fy = topY + Math.sin(a) * ph * 0.42 - ph * 0.08;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(
        topX + Math.cos(a) * ph * 0.3,
        topY + Math.sin(a) * ph * 0.28 - ph * 0.12,
        fx,
        fy,
      );
      ctx.stroke();
    }
    // Coconuts.
    ctx.beginPath();
    ctx.arc(topX + 3, topY + 4, Math.max(2, W * 0.003), 0, Math.PI * 2);
    ctx.arc(topX - 3, topY + 5, Math.max(2, W * 0.003), 0, Math.PI * 2);
    ctx.fill();
  }

  // (4) Photo panels. Each photo is cover-fit with its crop, a subtle warm
  // grade wash, and a thin inner border.
  const panels = layoutPanels(layoutId, W, H);
  panels.forEach((panel, i) => {
    const idx = assign[i] !== undefined ? assign[i] : i;
    const photo = photos.length
      ? photos[((idx % photos.length) + photos.length) % photos.length]
      : undefined;
    if (photo && photo.img) {
      const iw = photo.img.naturalWidth || photo.img.width || 1;
      const ih = photo.img.naturalHeight || photo.img.height || 1;
      const crop = computeCrop(iw, ih, panel.w, panel.h, photo.zoom, photo.ox, photo.oy);
      ctx.drawImage(photo.img, crop.sx, crop.sy, crop.sw, crop.sh, panel.x, panel.y, panel.w, panel.h);
      // Subtle warm grade over the photo (multiply-ish translucent wash).
      ctx.fillStyle = grade === 'sunset' ? 'rgba(255,110,40,0.10)' : 'rgba(255,0,140,0.08)';
      ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
      ctx.fillStyle = grade === 'sunset' ? 'rgba(255,0,110,0.05)' : 'rgba(0,180,255,0.06)';
      ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    } else {
      // Empty panel: dark violet placeholder so the grid still reads.
      const ph = ctx.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.h);
      ph.addColorStop(0, '#2a1250');
      ph.addColorStop(1, '#12081f');
      ctx.fillStyle = ph;
      ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    }
    // Thin inner border.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(2, W * 0.002);
    ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);
  });

  // (5) Caption: big bold condensed capitals, dark outline + light fill +
  // soft shadow, over a gentle dark scrim so it stays legible at 480px.
  const capMaxW = W * 0.92;
  const startSize = opts.captionSize && opts.captionSize > 0 ? opts.captionSize : W * 0.115;
  const capSize = fitCaptionSize(ctx, caption, capMaxW, startSize);
  const capBaseline = Math.min(H * 0.97, Math.max(H * 0.1, captionY * H));
  const scrim = ctx.createLinearGradient(0, capBaseline - capSize * 1.5, 0, H);
  scrim.addColorStop(0, 'rgba(10,0,20,0)');
  scrim.addColorStop(1, 'rgba(10,0,20,0.5)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, capBaseline - capSize * 1.5, W, H - (capBaseline - capSize * 1.5));
  ctx.font = fontString(capSize, 900);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = capSize * 0.08;
  ctx.shadowOffsetY = capSize * 0.03;
  ctx.strokeStyle = 'rgba(24,6,36,0.92)';
  ctx.lineWidth = Math.max(3, capSize * 0.11);
  ctx.strokeText(caption, W / 2, capBaseline);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = captionColor;
  ctx.fillText(caption, W / 2, capBaseline);

  // (6) Tagline strip: small letterspaced caps above the caption.
  if (tagline) {
    const tag = tagline.toUpperCase();
    const tagSize = Math.max(14, W * 0.021);
    ctx.font = fontString(tagSize, 400);
    const tracking = tagSize * 0.42;
    const tw = trackedWidth(ctx, tag, tracking);
    const tx = (W - tw) / 2;
    const ty = capBaseline - capSize * 1.18;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = tagSize * 0.25;
    ctx.shadowOffsetY = 1;
    drawTracked(ctx, tag, tx, ty, tracking);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    // Tick marks flanking the tagline.
    const tickY = ty - tagSize * 0.32;
    const tickLen = Math.max(18, W * 0.03);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1.5, W * 0.0015);
    ctx.beginPath();
    ctx.moveTo(tx - tickLen - W * 0.015, tickY);
    ctx.lineTo(tx - W * 0.015, tickY);
    ctx.moveTo(tx + tw + W * 0.015, tickY);
    ctx.lineTo(tx + tw + W * 0.015 + tickLen, tickY);
    ctx.stroke();
  }

  // (7) Subtle vignette.
  const vig = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.42,
    W / 2, H / 2, Math.max(W, H) * 0.75,
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(10,0,20,0.24)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();
  return { w: W, h: H };
}
