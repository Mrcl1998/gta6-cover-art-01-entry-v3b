// Night Drive Cover Studio — the entry program (Node 22, standard library
// only). The app is plain static files under app/ (index.html, its ES
// modules, vendored fonts, sample photos) and screenshots/ holds the four
// screenshots. This program hands them in: it copies app/ and screenshots/
// from beside this file into /output and writes /output/dossier.json with
// the vendored make.fun library.
//
// The grader runs this in a sandbox where the repository is read-only and
// /output is a bind mount: this program never removes /output itself, it
// only empties what is inside it, and it adds the owner write bit through
// each child tree first (copies can carry read-only modes, so a second run
// over its own output still works). Outside the grader, MAKEFUN_OUTPUT_DIR
// stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Empty the contents of the output directory without removing it.
function emptyDirContents(dir) {
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) {
    const child = join(dir, name);
    const info = statSync(child);
    if (info.isDirectory()) {
      emptyDirContents(child);
      rmSync(child, { recursive: true, force: true });
    } else {
      chmodSync(child, 0o600);
      rmSync(child, { force: true });
    }
  }
}

// Make every file under a tree owner-writable first, so removing a tree
// whose files were copied with read-only modes never fails.
function makeWritable(dir) {
  for (const name of readdirSync(dir)) {
    const child = join(dir, name);
    const info = statSync(child);
    if (info.isDirectory()) {
      makeWritable(child);
    } else {
      chmodSync(child, 0o600);
    }
  }
}

emptyDirContents(out);
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
makeWritable(join(out, 'app'));
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  makeWritable(join(out, 'screenshots'));
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than
// 4 screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB
// of app files, in all, or a path under app/ over 1000 bytes).
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
