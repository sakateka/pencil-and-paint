/**
 * Is a motion smooth, or is it stepped?
 *
 * A screenshot cannot answer that, and believing it can cost a rewrite: the
 * hammock's sag was once baked as six pictures, and every single frame of it
 * was correct while the movement between them read as a dropped frame. What was
 * wrong was the distance travelled per frame, not the time any frame took.
 *
 *     node tests/tools/motion.mjs hammock
 *     node tests/tools/motion.mjs walk --dist=tmp/dist --frames=60
 *
 * Needs a display; see tests/tools/README.md.
 *
 * Read the `steps` line. A smooth motion moves a little every frame. A stepped
 * one holds still for several frames and then jumps, which is what the six-sag
 * hammock did — five moves in forty-four frames, in jumps of four and five
 * pixels — and is what a player calls lag.
 */
import { openGame, serve, closeBrowser } from '../harness.js';
import { SCENES, SCENE_NAMES } from './scenes.mjs';
import { buildDir, flag } from './rig.mjs';
import { pixels } from './pixels.mjs';

const name = process.argv[2];
const scene = SCENES[name];
if (!scene?.motion) {
  console.error(
    `usage: node tests/tools/motion.mjs <scene>\n` +
      `scenes with a motion probe: ` +
      `${SCENE_NAMES.filter((n) => SCENES[n].motion).join(', ')}`,
  );
  process.exit(1);
}

const frames = Number(flag('frames') ?? 45);
const site = await serve(buildDir());
const game = await openGame(site.url);

try {
  const clip = await game.evaluate(scene.motion.begin);
  const samples = [];
  for (let f = 0; f < frames; f++) {
    await game.evaluate(scene.motion.step);
    samples.push(scene.motion.find(await pixels(game.page, clip)));
  }
  if (samples.every((value) => value < 0)) {
    console.error('the probe never found what it was looking for; is the scene framed right?');
    process.exit(1);
  }
  const steps = samples
    .slice(1)
    .map((value, i) => Number((value - samples[i]).toFixed(2)));
  const moved = steps.filter((step) => Math.abs(step) > 0.01);
  const biggest = Math.max(0, ...moved.map(Math.abs));

  console.log(`scene     ${name} — ${scene.describe}`);
  console.log(`position  ${samples.map((v) => v.toFixed(1)).join(' ')}`);
  console.log(`steps     ${steps.join(' ')}`);
  console.log(
    `frames ${steps.length}  moved ${moved.length}  held still ` +
      `${steps.length - moved.length}  biggest step ${biggest.toFixed(2)}px`,
  );
  if (game.errors.length) console.log(`page errors: ${game.errors.join(' | ')}`);
} finally {
  await game.close();
  await closeBrowser();
  await site.close();
}
