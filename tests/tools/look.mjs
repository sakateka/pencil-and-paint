/**
 * Open a build, say what the frame costs, and take its picture.
 *
 * The first thing to run when something is wrong and you do not yet know what.
 *
 *     node tests/tools/look.mjs
 *     node tests/tools/look.mjs hammock --dist=tmp/dist
 *
 * `upload` and `new` are the invariant the render design exists for: once the
 * valley is warm they are meant to be zero, every frame, for ever. A number
 * other than zero is the bug, before anybody feels it.
 */
import { openGame, serve, closeBrowser } from '../harness.js';
import { SCENES, SCENE_NAMES } from './scenes.mjs';
import { buildDir } from './rig.mjs';
import { join } from 'node:path';
import { ROOT } from './rig.mjs';

const name = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : undefined;
const scene = name ? SCENES[name] : undefined;
if (name && !scene?.still) {
  console.error(`usage: node tests/tools/look.mjs [scene]\nscenes: ${SCENE_NAMES.join(', ')}`);
  process.exit(1);
}

const site = await serve(buildDir());
const game = await openGame(site.url);

try {
  const box = scene ? await game.evaluate(scene.still) : undefined;
  // A moment of play, so nothing is being measured mid warm-up.
  if (!scene) await new Promise((resolve) => setTimeout(resolve, 2000));

  const state = await game.evaluate((pencil) => {
    const { renderer, perf } = pencil;
    const cost = renderer.frameCost;
    const worst = perf.worstFrames[0];
    // Who, not just how much: `new 25` names nothing on its own, and the four
    // things that can raise it want four different fixes.
    const uploaders = renderer.uploadReport();
    const makers = renderer.createReport();
    return {
      blame: [uploaders.worst, makers.worst].filter(Boolean).join('  |  '),
      stamps: renderer.stampPeak,
      build: pencil.build,
      looks: {
        pictures: renderer.looks.pictures,
        megabytes: renderer.looks.megabytes,
        bakeMs: Math.round(renderer.looks.bakeMs),
      },
      uploadedKb: Math.round((cost.uploadedPx * 4) / 1024),
      created: cost.created,
      bakes: renderer.frameStages.bakes,
      drawMs: Number(perf.snapshot().drawMs.toFixed(2)),
      worst: worst ? `${worst.frameMs}ms at ${worst.at}s` : 'none',
    };
  });

  console.log(`build     ${state.build}`);
  console.log(
    `library   ${state.looks.pictures} pictures  ${state.looks.megabytes}MB  ` +
      `baked in ${state.looks.bakeMs}ms`,
  );
  console.log(
    `frame     upload ${state.uploadedKb}KB  new ${state.created}  ` +
      `bakes ${state.bakes}  draw ${state.drawMs}ms`,
  );
  // The whole session, not the last frame: what is uploaded once at warm-up
  // belongs in this list too, and the way to tell them apart is that a warm-up
  // sprite appears once and a fault appears again the next time you look.
  if (state.blame) console.log(`since load ${state.blame}`);
  console.log(`stamps    ${state.stamps.peak} at once, pool ${state.stamps.pool}`);
  console.log(`worst     ${state.worst}`);

  const path = join(ROOT, 'tmp', `look-${name ?? 'start'}.png`);
  await game.page.screenshot(box ? { path, clip: box } : { path });
  console.log(`shot      ${path}`);
  if (game.errors.length) console.log(`page errors: ${game.errors.join(' | ')}`);
} finally {
  await game.close();
  await closeBrowser();
  await site.close();
}
