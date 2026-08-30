import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { closeBrowser, serve } from './harness.js';

import { run as collision } from './collision.test.js';
import { run as stillness } from './stillness.test.js';
import { run as progression } from './progression.test.js';
import { run as rendering } from './rendering.test.js';
import { run as devpanel } from './devpanel.test.js';
import { run as startup } from './startup.test.js';
import { run as petting } from './petting.test.js';
import { run as fishing } from './fishing.test.js';
import { run as i18n } from './i18n.test.js';
import { run as hammock } from './hammock.test.js';
import { run as studio } from './studio.test.js';
import { run as treehouse } from './treehouse.test.js';
import { run as frogs } from './frogs.test.js';
import { run as hen } from './hen.test.js';
import { run as owl } from './owl.test.js';
import { run as vigil } from './vigil.test.js';
import { run as lion } from './lion.test.js';
import { run as sky } from './sky.test.js';
import { run as hills } from './hills.test.js';
import { run as perch } from './perch.test.js';
import { run as hedgehog } from './hedgehog.test.js';
import { run as cuckoo } from './cuckoo.test.js';

const SUITES = [startup, collision, stillness, progression, rendering, devpanel, petting, fishing, hammock, studio, treehouse, frogs, hen, owl, vigil, lion, sky, hills, perch, hedgehog, cuckoo, i18n];

/**
 * Runs every suite against a production build, served over HTTP the way a
 * static host would.
 *
 * Left to itself it makes the build first — type-checks, then `vite build` —
 * into a directory of its own under tmp/, so what is under test is always
 * the current source, never a stale `dist/`, and two runs going at once
 * never touch each other's files: one run empties out only its own directory.
 *
 * Every directory is kept after the run and named in the output, for looking
 * at what was actually served; `npm run test:clean` is what removes them —
 * nothing here cleans up after itself automatically.
 *
 * Set PENCIL_DIST to point at an existing build (`dist/`, say) and it is
 * tested exactly as found, without building anything.
 */
function buildFresh() {
  // tmp/ is gitignored scratch, so it may not exist yet on a fresh checkout.
  const scratch = join(import.meta.dirname, '..', 'tmp');
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, 'test-'));
  const step = (name, ...args) => {
    const done = spawnSync('npm', ['exec', '--', name, ...args], { stdio: 'inherit' });
    if (done.status !== 0) {
      console.error(`build failed in tmp/ test directory ${dir}`);
      rmSync(dir, { recursive: true, force: true });
      process.exit(1);
    }
  };
  step('tsc', '--noEmit');
  step('vite', 'build', '--outDir', dir, '--emptyOutDir');
  return dir;
}

async function main() {
  const started = performance.now();
  const external = process.env.PENCIL_DIST;
  let root;
  let ours = false;
  if (external) {
    root = `${external.replace(/\/?$/, '/')}`;
    if (!existsSync(`${root}index.html`)) {
      console.error(`No build found at ${root}. Run a build, or unset PENCIL_DIST to make one.`);
      process.exit(1);
    }
  } else {
    root = buildFresh();
    ours = true;
  }

  const server = await serve(root);
  let allPassed = true;

  try {
    for (const suite of SUITES) {
      const result = await suite(server.url);
      if (!result.report()) allPassed = false;
    }
  } finally {
    await closeBrowser();
    await server.close();
  }

  if (ours) console.log(`build served from ${root} — kept; npm run test:clean removes it`);

  /*
   * The whole run, build included: this is what `npm test` cost, not just the
   * suites. Rounded to the second past a minute, tenths below it — a fraction
   * of a second is signal on a quick run and noise on a long one.
   */
  const seconds = (performance.now() - started) / 1000;
  const elapsed =
    seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  console.log(allPassed ? `\nall suites passed in ${elapsed}\n` : `\nFAILURES after ${elapsed}\n`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
