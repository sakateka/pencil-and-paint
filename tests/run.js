import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { availableParallelism } from 'node:os';
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
import { run as ending } from './ending.test.js';
import { run as camera } from './camera.test.js';

const SUITES = [startup, collision, stillness, progression, rendering, devpanel, petting, fishing, hammock, studio, treehouse, frogs, hen, owl, vigil, lion, sky, hills, perch, hedgehog, cuckoo, ending, i18n, camera];

// Standard GitHub-hosted Linux runners have 2 vCPU for private repositories
// and 4 vCPU for public ones. Cap local runs at that public standard too: the
// suite count should not turn a developer's large workstation into a stress
// test by default.
const MAX_STANDARD_RUNNER_CPUS = 4;
const DEFAULT_SUITE_CONCURRENCY = Math.max(
  1,
  Math.min(MAX_STANDARD_RUNNER_CPUS, availableParallelism()),
);

function suiteConcurrency() {
  const requested = process.env.PENCIL_SUITE_CONCURRENCY;
  if (requested === undefined) return DEFAULT_SUITE_CONCURRENCY;
  const value = Number(requested);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('PENCIL_SUITE_CONCURRENCY must be a positive integer');
  }
  return Math.min(SUITES.length, value);
}

/** Run suites concurrently, but keep their reports in the declared order. */
async function runSuites(url, concurrency) {
  const results = new Array(SUITES.length);
  let next = 0;

  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= SUITES.length) return;
      try {
        results[index] = { suite: await SUITES[index](url) };
      } catch (error) {
        // Let the other workers finish so teardown never races a still-running
        // browser context; report the rejection with the other suite results.
        results[index] = { error };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, SUITES.length) }, worker),
  );
  return results;
}

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
 * Suites run in a bounded pool sized for the standard GitHub runner. Set
 * PENCIL_SUITE_CONCURRENCY to override it for a particular run.
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

  const concurrency = suiteConcurrency();
  const server = await serve(root);
  let allPassed = true;

  try {
    console.log(`running ${SUITES.length} suites with concurrency ${concurrency}`);
    const results = await runSuites(server.url, concurrency);
    for (const [index, result] of results.entries()) {
      if (result.error) {
        console.error(`\nsuite ${index + 1} threw:`, result.error);
        allPassed = false;
      } else if (!result.suite.report()) {
        allPassed = false;
      }
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
