// shots.js — fixed scenes for screenshots.
// ?shot=editor loads a sample photo and caption into the editor;
// ?shot=cover shows the exported cover fullscreen (body.shot-cover).
// window.__shotReady is set after two animation frames, once painted.

export async function runShot(shot, query, load) {
  if (shot === 'cover') document.body.classList.add('shot-cover');
  const photo = query.get('photo') ?? 'pier';
  const caption = query.get('caption') ?? 'Sunset Heist';
  await load(`samples/${photo}.jpg`, caption);
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
