// editor-scene.js — draws the editor itself with the app's own canvas code.
// No DOM: renderEditorScene paints a 1280x720 editor view (dark chrome,
// control column on the left, live cover preview on the right) onto any 2D
// context. The live preview comes from state.coverCanvas when the caller
// passes one; otherwise, when state.createCanvas is given, the cover is
// rendered here with renderCover onto an offscreen canvas and drawn in.

import { renderCover, SIZES } from './cover.js';

const UI = {
  chrome: '#171224',
  chromeEdge: '#241c38',
  panel: '#211a33',
  panelEdge: '#332a4d',
  ink: '#f2eefc',
  dim: '#a89ec4',
  faint: '#6f648f',
  accent: '#ff5e3a',
  accentHot: '#ff2e88',
  good: '#37d67a',
};

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function label(ctx, text, x, y, size, color, weight = 700) {
  ctx.font = `${weight} ${size}px "Arial Black", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function button(ctx, x, y, w, h, text, active, accent) {
  roundRect(ctx, x, y, w, h, 7);
  ctx.fillStyle = active ? (accent || UI.accent) : UI.panel;
  ctx.fill();
  ctx.strokeStyle = active ? (accent || UI.accent) : UI.panelEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = `700 ${Math.min(15, h * 0.42)}px "Arial Black", sans-serif`;
  ctx.fillStyle = active ? '#ffffff' : UI.dim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
}

function sliderRow(ctx, x, y, w, name, value01) {
  label(ctx, name, x, y, 12, UI.dim);
  const trackY = y + 12;
  ctx.fillStyle = UI.panelEdge;
  roundRect(ctx, x, trackY - 3, w, 6, 3);
  ctx.fill();
  const fillW = Math.max(6, w * value01);
  ctx.fillStyle = UI.accent;
  roundRect(ctx, x, trackY - 3, fillW, 6, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + fillW, trackY, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function thumb(ctx, x, y, w, h, name, seed) {
  // Stylised photo thumbnail: warm gradient "photo" with a sun and a
  // skyline, so the editor reads even before a real photo is drawn in.
  const g = ctx.createLinearGradient(x, y, x, y + h);
  const hues = [
    ['#3b1d6e', '#e14e6d', '#ffb347'],
    ['#0a2a4a', '#0e7d8c', '#7df9ff'],
    ['#4a0e2e', '#ff2e88', '#ffc46b'],
  ];
  const pick = hues[seed % hues.length];
  g.addColorStop(0, pick[0]);
  g.addColorStop(0.6, pick[1]);
  g.addColorStop(1, pick[2]);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,200,0.95)';
  ctx.beginPath();
  ctx.arc(x + w * 0.68, y + h * 0.34, h * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(20,8,40,0.9)';
  ctx.fillRect(x + w * 0.1, y + h * 0.62, w * 0.18, h * 0.38);
  ctx.fillRect(x + w * 0.34, y + h * 0.5, w * 0.22, h * 0.5);
  ctx.fillRect(x + w * 0.62, y + h * 0.58, w * 0.2, h * 0.42);
  ctx.font = `700 11px "Arial Black", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, x + 6, y + h - 6);
}

export function renderEditorScene(ctx, W, H, state) {
  const s = state || {};
  const caption = s.caption || 'SUNSET HEIST';
  const layout = s.layout || 'duo';
  const size = s.size || 'square';
  const photoNames = Array.isArray(s.photoNames) && s.photoNames.length
    ? s.photoNames
    : ['pier.jpg', 'boulevard.jpg'];

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = UI.chrome;
  ctx.fillRect(0, 0, W, H);

  // Top bar.
  ctx.fillStyle = UI.chromeEdge;
  ctx.fillRect(0, 0, W, 52);
  ctx.fillStyle = UI.accentHot;
  ctx.beginPath();
  ctx.arc(30, 26, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 13px "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('6', 30, 27);
  label(ctx, 'VICE CITY COVER MAKER', 50, 31, 17, UI.ink, 900);
  label(ctx, 'GTA 6-style poster studio', 268, 31, 12, UI.faint, 400);
  ctx.font = '700 12px "Arial Black", sans-serif';
  ctx.fillStyle = UI.good;
  ctx.textAlign = 'right';
  ctx.fillText('● READY', W - 20, 31);

  // Left control column.
  const colX = 20;
  const colW = 330;
  let y = 72;

  label(ctx, 'PHOTOS', colX, y, 12, UI.faint);
  y += 12;
  const tw = (colW - 10) / 2;
  const th = 96;
  photoNames.slice(0, 2).forEach((name, i) => {
    thumb(ctx, colX + i * (tw + 10), y, tw, th, name, i);
    if (i === 0) {
      ctx.strokeStyle = UI.accent;
      ctx.lineWidth = 3;
      roundRect(ctx, colX, y, tw, th, 6);
      ctx.stroke();
    }
  });
  y += th + 8;
  button(ctx, colX, y, colW, 34, '+ ADD PHOTO', false);
  y += 34 + 22;

  label(ctx, 'LAYOUT', colX, y, 12, UI.faint);
  y += 12;
  const layouts = ['duo', 'trio', 'quad', 'hero'];
  const bw = (colW - 3 * 8) / 4;
  layouts.forEach((id, i) => {
    button(ctx, colX + i * (bw + 8), y, bw, 32, id.toUpperCase(), id === layout);
  });
  y += 32 + 22;

  label(ctx, 'SIZE', colX, y, 12, UI.faint);
  y += 12;
  const sizes = [
    { id: 'square', label: '1080×1080' },
    { id: 'portrait', label: '1080×1350' },
    { id: 'landscape', label: '1920×1080' },
  ];
  const sw = (colW - 2 * 8) / 3;
  sizes.forEach((sz, i) => {
    button(ctx, colX + i * (sw + 8), y, sw, 32, sz.label, sz.id === size);
  });
  y += 32 + 22;

  label(ctx, 'CAPTION', colX, y, 12, UI.faint);
  y += 12;
  roundRect(ctx, colX, y, colW, 38, 7);
  ctx.fillStyle = UI.panel;
  ctx.fill();
  ctx.strokeStyle = UI.panelEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = '900 17px Anton, "Arial Black", sans-serif';
  ctx.fillStyle = UI.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(caption.toUpperCase(), colX + 12, y + 20);
  y += 38 + 22;

  label(ctx, 'CROP', colX, y, 12, UI.faint);
  y += 20;
  sliderRow(ctx, colX, y, colW, 'ZOOM', 0.42);
  y += 34;
  sliderRow(ctx, colX, y, colW, 'POSITION X', 0.55);
  y += 34;
  sliderRow(ctx, colX, y, colW, 'POSITION Y', 0.45);
  y += 34 + 14;

  // Export button.
  roundRect(ctx, colX, y, colW, 46, 9);
  const eg = ctx.createLinearGradient(colX, y, colX + colW, y);
  eg.addColorStop(0, UI.accent);
  eg.addColorStop(1, UI.accentHot);
  ctx.fillStyle = eg;
  ctx.fill();
  ctx.font = '900 16px "Arial Black", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⬇  EXPORT PNG', colX + colW / 2, y + 24);

  // Right: live preview area.
  const prevX = colX + colW + 24;
  const prevY = 72;
  const prevW = W - prevX - 20;
  const prevH = H - prevY - 20;
  ctx.fillStyle = '#0e0a18';
  roundRect(ctx, prevX, prevY, prevW, prevH, 10);
  ctx.fill();
  ctx.strokeStyle = UI.panelEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  label(ctx, 'LIVE PREVIEW', prevX + 14, prevY + 24, 12, UI.faint);

  // The cover itself, fitted inside the preview area.
  const dims = SIZES[size] || SIZES.square;
  const fit = Math.min((prevW - 28) / dims.w, (prevH - 44) / dims.h);
  const dw = dims.w * fit;
  const dh = dims.h * fit;
  const dx = prevX + (prevW - dw) / 2;
  const dy = prevY + 34 + (prevH - 34 - dh) / 2;
  let coverCanvas = s.coverCanvas || null;
  if (!coverCanvas && typeof s.createCanvas === 'function' && Array.isArray(s.photos)) {
    coverCanvas = s.createCanvas(dims.w, dims.h);
    const cctx = coverCanvas.getContext('2d');
    renderCover(cctx, {
      photos: s.photos,
      assign: s.assign,
      caption,
      tagline: s.tagline,
      size,
      layout,
      grade: s.grade || 'sunset',
      captionColor: s.captionColor,
    });
  }
  if (coverCanvas) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.drawImage(coverCanvas, dx, dy, dw, dh);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(dx, dy, dw, dh);
  } else {
    ctx.fillStyle = UI.panel;
    roundRect(ctx, dx, dy, dw, dh, 6);
    ctx.fill();
    ctx.font = '700 14px "Arial Black", sans-serif';
    ctx.fillStyle = UI.dim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ADD A PHOTO TO PREVIEW', dx + dw / 2, dy + dh / 2);
  }
  ctx.font = '700 12px "Arial Black", sans-serif';
  ctx.fillStyle = UI.dim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(
    `${dims.w} × ${dims.h}  •  ${layout.toUpperCase()}  •  ${(s.grade || 'sunset').toUpperCase()}`,
    prevX + prevW / 2,
    H - 8,
  );

  ctx.restore();
}
