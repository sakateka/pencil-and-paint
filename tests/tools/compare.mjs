/**
 * Did a change alter the picture?
 *
 * Puts two builds into the same scripted moment, reads the same rectangle of
 * finished pixels out of each, and says how far apart they are. Screenshots of
 * both are written next to each other so the answer can also be looked at.
 *
 *     npx vite build --outDir tmp/dist --emptyOutDir      # what you changed
 *     git worktree add tmp/before <sha> && (build it too)
 *     node tests/tools/compare.mjs hammock --before=tmp/before/tmp/dist
 *
 * Pixels are read through `pencil.composited` rather than from a screenshot, so
 * the comparison is of the frame the game drew and not of anything the page
 * scaled around it.
 *
 * Note what this cannot tell you: whether a *movement* is smooth. Two builds can
 * agree on every still frame and disagree completely on what happens between
 * them — see `motion.mjs`, which exists because that is not hypothetical.
 */
import { openGame, serve, closeBrowser } from '../harness.js';
import { SCENES, SCENE_NAMES } from './scenes.mjs';
import { buildDir, flag, ROOT } from './rig.mjs';
import { join } from 'node:path';

const name = process.argv[2];
const scene = SCENES[name];
if (!scene?.still) {
  console.error(
    `usage: node tests/tools/compare.mjs <scene> --before=<dir>\n` +
      `scenes with a still: ${SCENE_NAMES.filter((n) => SCENES[n].still).join(', ')}`,
  );
  process.exit(1);
}
if (!flag('before')) {
  console.error('--before=<dir> is required: the build to compare against');
  process.exit(1);
}

async function grab(dir, tag) {
  const site = await serve(dir);
  const game = await openGame(site.url);
  try {
    const box = await game.evaluate(scene.still);
    const pixels = await game.evaluate(
      (pencil, at) => Array.from(pencil.composited(at.x, at.y, at.width, at.height).data),
      box,
    );
    const path = join(ROOT, 'tmp', `compare-${name}-${tag}.png`);
    await game.page.screenshot({ path, clip: box });
    return { pixels, path, errors: game.errors.slice() };
  } finally {
    await game.close();
    await site.close();
  }
}

const before = await grab(buildDir('before'), 'before');
const after = await grab(buildDir('dist'), 'after');
await closeBrowser();

if (before.pixels.length !== after.pixels.length) {
  console.error('the two builds framed different areas; nothing to compare');
  process.exit(1);
}

let total = 0;
let worst = 0;
for (let i = 0; i < before.pixels.length; i++) {
  const d = Math.abs(before.pixels[i] - after.pixels[i]);
  total += d;
  if (d > worst) worst = d;
}

console.log(`scene   ${name} — ${scene.describe}`);
console.log(`mean    ${(total / before.pixels.length).toFixed(2)} of 255`);
console.log(`worst   ${worst} of 255`);
console.log(`shots   ${before.path}\n        ${after.path}`);
for (const [tag, side] of [
  ['before', before],
  ['after', after],
]) {
  if (side.errors.length) console.log(`${tag} page errors: ${side.errors.join(' | ')}`);
}
