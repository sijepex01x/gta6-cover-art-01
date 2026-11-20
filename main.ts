// Vice City Cover Maker — the program that hands the gta6-cover-art-01 entry in.
//
// The app itself is plain static files under app/: open app/index.html in a desktop browser and it works with no
// network at all. It turns photos from the user's own machine plus a caption into GTA-style multi-panel cover art
// and exports the finished cover as a PNG to share. Four panel layouts (Duo, Trio, Quad, Hero), each photo
// cover-fit cropped and pannable/zoomable inside its panel, a Vice City sunset or neon grade with a seeded
// skyline, palms and sun, and bold Anton caption lettering (Oswald secondary face, both SIL OFL fonts shipped
// under app/fonts/). Three export sizes: 1080 x 1080 square, 1080 x 1350 portrait, 1920 x 1080 landscape.
//
// This file is the entrypoint the grader runs (Node 22, standard library only, no install step). It copies app/ and
// screenshots/ from beside this file into the output directory — /output in the grader, or $MAKEFUN_OUTPUT_DIR
// anywhere else — and writes /output/dossier.json with make.fun's vendored buildDossier helper, so the judge can
// read the app's source and screenshots. Before the dossier is written it checks the screenshots the gate will
// check: 3 or 4 files, each no bigger than 256 KiB, and refuses to hand in a broken set.
//
// Run it locally like this:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and try the app itself with `node serve.ts`, then http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const shotsDir = join(here, 'screenshots');
const MAX_SHOT_BYTES = 262144; // 256 KiB, the gate's per-screenshot cap.

// The gate only accepts 3 or 4 screenshots, each at most 256 KiB. Catch a bad set here, with a message that
// names the exact file or count at fault, instead of handing in an entry the scorer would refuse.
function checkScreenshots() {
  if (!existsSync(shotsDir)) {
    throw new Error(
      'screenshots/ is missing: the entry needs 3 or 4 screenshots (the first by name is the cover), ' +
        'each a PNG or JPEG of at most 256 KiB',
    );
  }
  const shots = readdirSync(shotsDir)
    .filter((name) => !name.startsWith('.'))
    .sort();
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(
      `screenshots/ holds ${shots.length} file(s) (${shots.join(', ') || 'none'}), but the gate accepts ` +
        'exactly 3 or 4: add or remove a screenshot so the first by name is the cover and one shows the ' +
        'editor with a photo loaded',
    );
  }
  for (const name of shots) {
    const bytes = statSync(join(shotsDir, name)).size;
    if (bytes > MAX_SHOT_BYTES) {
      throw new Error(
        `screenshots/${name} is ${bytes} bytes, over the 256 KiB (262144 byte) screenshot cap: ` +
          're-export it smaller (at most 1280px on the long side) and try again',
      );
    }
  }
}

checkScreenshots();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps: only text_max_bytes shapes the dossier's bytes; the rest refuse an entry the scorer
// would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of app files
// in all, or a path under app/ over 1000 bytes — app/ counts beside /output's own 1000-entry cap, with its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
