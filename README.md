# Vice City Cover Maker — GTA 6 Cover Art Maker

Turn a photo from your own machine and a caption into GTA-style multi-panel cover art, and export it as a PNG to share. Built for the [make.fun](https://make.fun/c/gta6-cover-art-01) `gta6-cover-art-01` competition.

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/sijepex01x/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/sijepex01x/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

## How it works

The app is plain static files under `app/` — no build step, no network request, no upload. Open `app/index.html` in desktop Chrome (or run `node serve.ts` and open http://localhost:8080) and everything runs on your own machine: your photos are read locally in the browser and never leave it.

1. **Add photos.** Pick one photo to fill every panel, or a different photo per panel. Two free-to-use sample photos ship under `app/samples/` so you can try it with one click.
2. **Crop and position each photo.** Drag a photo inside its panel to pan it, and zoom it to frame the shot — the cover-fit crop always fills the panel, never letterboxes.
3. **Pick a layout.** Four multi-panel poster layouts — **Duo** (two panels side by side), **Trio** (one tall panel with two stacked beside it), **Quad** (a four-panel grid) and **Hero** (one big panel on top with two below) — over a Vice City sunset or neon grade.
4. **Write the caption.** Bold poster lettering across the foot of the cover, in Anton with an Oswald secondary face, over a Vice City sunset-to-neon colour grade. The caption auto-shrinks to fit, and you can edit it live while the preview updates.
5. **Pick a size and export.** One click downloads the finished cover as a PNG.

## Export sizes

| Size | Dimensions | For |
| --- | --- | --- |
| Square | 1080 × 1080 | Feed posts |
| Portrait | 1080 × 1350 | Portrait posts, stories |
| Landscape | 1920 × 1080 | Banners, wide posts |

## Controls

- **Photo upload** — choose a photo from your machine for the selected panel (or for all panels at once).
- **Crop / position** — drag inside a panel to pan the photo; zoom slider to frame it tighter or looser.
- **Caption** — type the poster line; it renders live in bold capitals with a sunset tint and drop shadow.
- **Layouts** — Duo, Trio, Quad and Hero panel arrangements, switchable at any time without losing your photos or caption.
- **Sizes** — square, portrait and landscape export sizes.
- **Export PNG** — downloads the cover at the exact pixel size above.

## Original art, original type

All of the cover art is drawn fresh by this app's own code — the panels, the sunset/neon grade, the lettering treatment. There is no Rockstar Games logo, wordmark, official artwork, character or font in here. The fonts are shipped as files under `app/fonts/` under the SIL Open Font License (OFL): **Anton** (`Anton-Regular.ttf`, `OFL.txt`) for the big caption lettering and **Oswald** (`Oswald-Variable.ttf`, `OFL-Oswald.txt`) as the secondary face. The sample photos under `app/samples/` were made with an image model for make.fun and are free to use.

## Files

- `app/` — the whole app: `index.html`, `style.css`, `src/cover.js` (panel layouts, cover-fit crop, caption fitting, cover rendering), `src/main.js` (editor wiring), `src/shots.js` (fixed scenes for screenshots), `samples/` and `fonts/`.
- `screenshots/` — 4 screenshots: the exported cover first, then the editor with a photo loaded, then a second exported cover.
- `test/harness.mjs` — the test harness: 2,359 assertions, no browser needed (run `node test/harness.mjs` from the repo root).
- `main.ts` — the entrypoint that hands the entry in: it copies `app/` and `screenshots/` to `/output` (or `$MAKEFUN_OUTPUT_DIR`) and writes `/output/dossier.json`. It refuses to hand in a bad screenshot set — fewer than 3 or more than 4 files, or any file over 256 KiB — before the dossier is written.
- `serve.ts` — a tiny static server for trying the app locally (`node serve.ts`, then http://localhost:8080).
- `vendor/makefun-app.ts` — make.fun's vendored dossier library, unchanged from the kit.

## Try it

```sh
node serve.ts        # serves app/ at http://localhost:8080
node test/harness.mjs   # runs the 100+ assertion harness (needs node-canvas, see below)
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # builds the dossier into out/
```

The harness renders covers with [node-canvas](https://github.com/Automattic/node-canvas); it loads it from the absolute path `/home/hatch/workspace/makefun/hexclash/node_modules/canvas`, falling back to `tools/node_modules/canvas` if that is present.

---

<sub>Entered on [make.fun](https://make.fun/?ref=s3jx158p&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards</sub>
