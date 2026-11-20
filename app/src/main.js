// main.js — the Vice Cover Studio editor.
// Wires the controls to the cover renderer (cover.js) and the screenshot
// scenes (shots.js). Photos stay on this machine: uploads are read with
// object URLs and never leave the browser.

import { SIZES, LAYOUTS, layoutPanels, computeCrop, renderCover } from './cover.js';
import { runShot } from './shots.js';

const $ = (id) => document.getElementById(id);
const canvas = $('cover');
const ctx = canvas.getContext('2d');
const statusEl = $('status');

const SWATCHES = [
  { name: 'White', value: '#ffffff' },
  { name: 'Gold', value: '#ffd166' },
  { name: 'Hot pink', value: '#ff2e88' },
  { name: 'Cyan', value: '#00d4ff' },
  { name: 'Black', value: '#14101d' },
];

const SIZE_LABELS = {
  square: 'Square 1080 x 1080',
  portrait: 'Portrait 1080 x 1350',
  landscape: 'Landscape 1920 x 1080',
};

// Editor state. Crop is kept per panel (zoom/ox/oy), so one photo can fill
// two panels with different crops; the photo itself is picked per panel.
const state = {
  photos: [], // { img, name, thumb }
  assign: [], // photo index per panel
  panelCrop: [], // { zoom, ox, oy } per panel
  selected: 0,
  layout: 'duo',
  size: 'square',
  grade: 'sunset',
  caption: 'Sunset Heist',
  tagline: 'VICE CITY • 2026',
  captionColor: '#ffffff',
  captionSize: 0, // 0 = auto fit
  captionY: 0.86,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function panelCount(layoutId) {
  const { w, h } = SIZES[state.size];
  return layoutPanels(layoutId || state.layout, w, h).length;
}

// Grow or shrink the per-panel arrays to match the current layout.
function ensurePanels() {
  const n = panelCount();
  while (state.assign.length < n) state.assign.push(0);
  while (state.panelCrop.length < n) state.panelCrop.push({ zoom: 1, ox: 0, oy: 0 });
  state.assign.length = n;
  state.panelCrop.length = n;
  if (state.selected >= n) state.selected = 0;
}

// Options for renderCover: each panel gets its own photo entry (the assigned
// photo with that panel's crop), and assign maps panel i to photo i.
function buildRenderOpts() {
  const { w, h } = SIZES[state.size];
  const panels = layoutPanels(state.layout, w, h);
  const photos = panels.map((panel, i) => {
    const photo = state.photos[state.assign[i] ?? 0];
    const crop = state.panelCrop[i] || { zoom: 1, ox: 0, oy: 0 };
    return photo
      ? { img: photo.img, zoom: crop.zoom, ox: crop.ox, oy: crop.oy }
      : { img: null, zoom: 1, ox: 0, oy: 0 };
  });
  return {
    photos,
    assign: panels.map((_, i) => i),
    caption: state.caption,
    tagline: state.tagline,
    size: state.size,
    layout: state.layout,
    grade: state.grade,
    captionColor: state.captionColor,
    captionSize: state.captionSize,
    captionY: state.captionY,
  };
}

function draw() {
  const { w, h } = SIZES[state.size];
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  renderCover(ctx, buildRenderOpts());
  drawSelection();
}

// Dashed gold outline around the selected panel, preview only — exports
// draw to a fresh canvas and never see this.
function drawSelection() {
  if (document.body.classList.contains('shot-cover')) return;
  const { w, h } = SIZES[state.size];
  const panel = layoutPanels(state.layout, w, h)[state.selected];
  if (!panel) return;
  ctx.save();
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = Math.max(4, canvas.width * 0.004);
  ctx.setLineDash([18, 12]);
  ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);
  ctx.restore();
}

// --- photos --------------------------------------------------------------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load ' + src));
    img.src = src;
  });
}

async function addPhotoFromSrc(src, name) {
  const img = await loadImage(src);
  state.photos.push({ img, name, thumb: src });
  refreshStrip();
  refreshPanelPhotoOptions();
  draw();
  return img;
}

function refreshStrip() {
  const strip = $('strip');
  strip.innerHTML = '';
  state.photos.forEach((photo, i) => {
    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'thumb';
    thumb.title = 'Use ' + photo.name + ' in the selected panel';
    const img = document.createElement('img');
    img.src = photo.thumb;
    img.alt = photo.name;
    thumb.appendChild(img);
    thumb.addEventListener('click', () => {
      state.assign[state.selected] = i;
      refreshStrip();
      refreshPanelPhotoOptions();
      draw();
    });
    if (state.assign[state.selected] === i) thumb.classList.add('active');
    strip.appendChild(thumb);
  });
  $('photo-count').textContent = state.photos.length
    ? state.photos.length + (state.photos.length === 1 ? ' photo loaded — click a thumbnail to put it in the selected panel.' : ' photos loaded — click a thumbnail to put it in the selected panel.')
    : 'No photos yet — upload one or use a sample.';
}

function refreshPanelPhotoOptions() {
  const sel = $('panel-photo');
  const current = state.assign[state.selected] ?? 0;
  sel.innerHTML = '';
  if (!state.photos.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No photos yet';
    sel.appendChild(opt);
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  state.photos.forEach((photo, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = 'Photo ' + (i + 1) + ' — ' + photo.name;
    sel.appendChild(opt);
  });
  sel.value = String(current);
}

// --- panel selection + crop controls -------------------------------------

function selectPanel(i) {
  state.selected = i;
  syncPanelControls();
  refreshStrip();
  draw();
}

function syncPanelControls() {
  const crop = state.panelCrop[state.selected] || { zoom: 1, ox: 0, oy: 0 };
  $('panel-label').textContent = 'Panel ' + (state.selected + 1) + ' of ' + panelCount();
  $('zoom').value = crop.zoom;
  $('zoom-val').textContent = crop.zoom.toFixed(2) + 'x';
  $('pos-x').value = crop.ox;
  $('pos-x-val').textContent = String(Math.round(crop.ox * 100));
  $('pos-y').value = crop.oy;
  $('pos-y-val').textContent = String(Math.round(crop.oy * 100));
  refreshPanelPhotoOptions();
}

// Drag on the preview pans the selected panel's photo: the photo follows
// the pointer, converted from cover pixels into the crop's ox/oy units.
function panSelected(dx, dy) {
  const i = state.selected;
  const photo = state.photos[state.assign[i] ?? 0];
  if (!photo || !photo.img) return;
  const panel = layoutPanels(state.layout, canvas.width, canvas.height)[i];
  if (!panel) return;
  const crop = state.panelCrop[i];
  const iw = photo.img.naturalWidth || photo.img.width;
  const ih = photo.img.naturalHeight || photo.img.height;
  const cur = computeCrop(iw, ih, panel.w, panel.h, crop.zoom, crop.ox, crop.oy);
  // Base cover crop, to find the slack the zoom opened up.
  const panelAspect = panel.w / panel.h;
  const imgAspect = iw / ih;
  let sw0;
  let sh0;
  if (imgAspect > panelAspect) {
    sh0 = ih;
    sw0 = ih * panelAspect;
  } else {
    sw0 = iw;
    sh0 = iw / panelAspect;
  }
  const slackX = (sw0 - cur.sw) / 2;
  const slackY = (sh0 - cur.sh) / 2;
  if (slackX > 0) {
    const sx0 = (iw - sw0) / 2;
    crop.ox = clamp((cur.sx - dx * (cur.sw / panel.w) - sx0 - slackX) / slackX, -1, 1);
  }
  if (slackY > 0) {
    const sy0 = (ih - sh0) / 2;
    crop.oy = clamp((cur.sy - dy * (cur.sh / panel.h) - sy0 - slackY) / slackY, -1, 1);
  }
  draw();
}

let drag = null;

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const panels = layoutPanels(state.layout, canvas.width, canvas.height);
  const idx = panels.findIndex((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
  if (idx === -1) return;
  if (idx !== state.selected) selectPanel(idx);
  drag = { x, y, scaleX, scaleY };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * drag.scaleX;
  const y = (e.clientY - rect.top) * drag.scaleY;
  const dx = x - drag.x;
  const dy = y - drag.y;
  drag.x = x;
  drag.y = y;
  if (dx || dy) panSelected(dx, dy);
});

const endDrag = () => {
  if (!drag) return;
  drag = null;
  syncPanelControls();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// --- pickers ---------------------------------------------------------------

function buildSegmented(containerId, items, currentId, onPick) {
  const box = $(containerId);
  box.innerHTML = '';
  items.forEach((item) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = item.label;
    b.setAttribute('aria-pressed', String(item.id === currentId));
    b.addEventListener('click', () => {
      onPick(item.id);
      [...box.children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      draw();
    });
    box.appendChild(b);
  });
}

function buildPickers() {
  buildSegmented(
    'layout-picker',
    LAYOUTS.map((l) => ({ id: l.id, label: l.name })),
    state.layout,
    (id) => {
      state.layout = id;
      ensurePanels();
      syncPanelControls();
    },
  );
  buildSegmented(
    'size-picker',
    Object.keys(SIZES).map((id) => ({ id, label: SIZE_LABELS[id] || id })),
    state.size,
    (id) => {
      state.size = id;
      ensurePanels();
      syncPanelControls();
    },
  );
  document.querySelectorAll('#grade-picker button').forEach((b) => {
    b.addEventListener('click', () => {
      state.grade = b.dataset.grade;
      document.querySelectorAll('#grade-picker button').forEach((c) => {
        c.setAttribute('aria-pressed', String(c === b));
      });
      draw();
    });
  });
}

function buildSwatches() {
  const box = $('swatches');
  SWATCHES.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = s.value;
    b.title = s.name;
    b.setAttribute('aria-label', 'Caption colour ' + s.name);
    b.setAttribute('aria-pressed', String(s.value === state.captionColor));
    b.addEventListener('click', () => {
      state.captionColor = s.value;
      [...box.children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      draw();
    });
    box.appendChild(b);
  });
}

// --- control wiring --------------------------------------------------------

function bindRange(id, valId, format, apply) {
  const input = $(id);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    $(valId).textContent = format(v);
    apply(v);
    draw();
  });
}

function wireControls() {
  $('photo').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    for (const file of files) {
      const url = URL.createObjectURL(file);
      try {
        await addPhotoFromSrc(url, file.name);
      } catch {
        statusEl.textContent = 'Could not read ' + file.name + '.';
      }
    }
    e.target.value = '';
    if (files.length) {
      statusEl.textContent = files.length === 1
        ? 'Photo added — click a panel, then drag to position it.'
        : files.length + ' photos added.';
    }
  });

  document.querySelectorAll('[data-sample]').forEach((btn) => {
    btn.addEventListener('click', () => {
      addPhotoFromSrc('samples/' + btn.dataset.sample + '.jpg', btn.dataset.sample + '.jpg')
        .catch(() => {
          statusEl.textContent = 'Could not load the sample photo.';
        });
    });
  });

  $('panel-photo').addEventListener('change', (e) => {
    state.assign[state.selected] = Number(e.target.value);
    refreshStrip();
    draw();
  });

  bindRange('zoom', 'zoom-val', (v) => v.toFixed(2) + 'x', (v) => {
    state.panelCrop[state.selected].zoom = v;
  });
  bindRange('pos-x', 'pos-x-val', (v) => String(Math.round(v * 100)), (v) => {
    state.panelCrop[state.selected].ox = v;
  });
  bindRange('pos-y', 'pos-y-val', (v) => String(Math.round(v * 100)), (v) => {
    state.panelCrop[state.selected].oy = v;
  });

  $('caption').addEventListener('input', (e) => {
    state.caption = e.target.value;
    draw();
  });
  $('tagline').addEventListener('input', (e) => {
    state.tagline = e.target.value;
    draw();
  });
  bindRange('caption-size', 'caption-size-val', (v) => (v === 0 ? 'Auto' : v + ' px'), (v) => {
    state.captionSize = v;
  });
  bindRange('caption-y', 'caption-y-val', (v) => Math.round(v * 100) + '%', (v) => {
    state.captionY = v;
  });

  $('export').addEventListener('click', exportPNG);
}

// --- export ----------------------------------------------------------------

async function exportPNG() {
  const { w, h } = SIZES[state.size];
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  renderCover(off.getContext('2d'), buildRenderOpts());
  const blob = await new Promise((resolve) => off.toBlob(resolve, 'image/png'));
  if (!blob) {
    statusEl.textContent = 'Export failed — please try again.';
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cover-' + w + 'x' + h + '.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  statusEl.textContent = 'Saved cover-' + w + 'x' + h + '.png';
}

// --- screenshot scenes + startup -------------------------------------------

async function loadShotPhoto(path, caption) {
  state.photos = [];
  state.caption = caption;
  $('caption').value = caption;
  await addPhotoFromSrc(path, path.split('/').pop());
  state.assign = state.assign.map(() => 0);
  state.panelCrop = state.panelCrop.map(() => ({ zoom: 1, ox: 0, oy: 0 }));
  refreshStrip();
  refreshPanelPhotoOptions();
  draw();
}

async function init() {
  buildPickers();
  buildSwatches();
  wireControls();
  ensurePanels();
  syncPanelControls();
  refreshStrip();
  draw();
  const query = new URLSearchParams(window.location.search);
  const shot = query.get('shot');
  if (shot === 'editor' || shot === 'cover') {
    await runShot(shot, query, loadShotPhoto);
  } else {
    await addPhotoFromSrc('samples/pier.jpg', 'pier.jpg').catch(() => {
      statusEl.textContent = 'Sample photo could not be loaded — upload a photo to begin.';
    });
  }
  // Redraw once the display font arrives, so captions render in Anton.
  try {
    await document.fonts.load('40px Anton');
  } catch {
    // Fall back to the system font stack; the cover still draws.
  }
  draw();
}

document.fonts.ready.then(() => draw());
init();
