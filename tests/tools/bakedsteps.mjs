/**
 * How far does the drawing move from one baked picture to the next?
 *
 *     node tests/tools/bakedsteps.mjs owl:wings
 *     node tests/tools/bakedsteps.mjs cow --medium=sketch
 *
 * The question `motion.mjs` asks, for the things it cannot see. A cycle that
 * became a row of drawings — a wing beat, an eyelid, a walk — steps by whatever
 * the gap between two consecutive drawings is, and the rule this whole design
 * is held to is that no step is bigger than a pixel. On screen that is often
 * unmeasurable: the owl's wing is a few pixels of dark against a tree that is
 * also dark, and a probe that counts pixels over a threshold reports whole
 * pixels however smoothly the thing under it slides.
 *
 * The pictures themselves can answer it exactly. Each is read out of the
 * library, its ink centroid taken — weighted by alpha, so a soft edge counts
 * for what it is — and the distance to the previous one printed. Answers are in
 * world units: multiply by the scale the thing is shown at, which for most
 * looks is one.
 *
 * Order is the order the look yields its poses in, which for a cycle is the
 * cycle. A look whose poses are not one sequence — the fourteen paint pots, or
 * the hedgehog's paws, which are two walk cycles one after the other — will
 * print a meaningless distance where one sequence ends and the next begins.
 *
 * A centroid answers "how far did it move", not "how far did it grow": a lid
 * closing about a fixed centre moves nothing and shows a step of nought here.
 * That is the tool being honest rather than the drawing being still.
 *
 * Needs a display; see tests/tools/README.md.
 */
import { openGame, serve, closeBrowser } from '../harness.js';
import { buildDir, flag } from './rig.mjs';

const id = process.argv[2];
if (!id || id.startsWith('-')) {
  console.error('usage: node tests/tools/bakedsteps.mjs <look id> [--medium=color]');
  process.exit(1);
}
const medium = flag('medium') ?? 'color';

const site = await serve(buildDir());
const game = await openGame(site.url);

try {
  const pictures = await game.evaluate(
    (pencil, want) => {
      const scratch = document.createElement('canvas');
      const out = [];
      for (const [slot, baked] of pencil.renderer.looks.entries()) {
        const parts = slot.split(':');
        const mediumOf = parts.pop();
        if (parts.slice(0, -1).join(':') !== want.id || mediumOf !== want.medium) continue;
        if (!baked.canvas) {
          out.push({ key: parts[parts.length - 1], empty: true });
          continue;
        }
        scratch.width = baked.width;
        scratch.height = baked.height;
        const ctx = scratch.getContext('2d');
        ctx.drawImage(baked.canvas, 0, 0);
        const { data } = ctx.getImageData(0, 0, baked.width, baked.height);
        let sx = 0;
        let sy = 0;
        let mass = 0;
        for (let y = 0; y < baked.height; y++) {
          for (let x = 0; x < baked.width; x++) {
            const alpha = data[(y * baked.width + x) * 4 + 3];
            sx += x * alpha;
            sy += y * alpha;
            mass += alpha;
          }
        }
        out.push({
          key: parts[parts.length - 1],
          size: `${baked.width}x${baked.height}`,
          // In world units: the picture's own pixels are `grain` of one each,
          // and the offsets the bake measured are in those same pixels.
          x: (baked.dx + sx / mass) * baked.grain,
          y: (baked.dy + sy / mass) * baked.grain,
        });
      }
      return out;
    },
    { id, medium },
  );

  if (!pictures.length) {
    console.error(`no pictures for ${id} in ${medium}; is the id right?`);
    process.exit(1);
  }

  console.log(`look      ${id} in ${medium} — ${pictures.length} pictures`);
  let worst = 0;
  let previous;
  for (const picture of pictures) {
    if (picture.empty) {
      console.log(`  ${picture.key.padEnd(14)} nothing drawn`);
      continue;
    }
    const step = previous
      ? Math.hypot(picture.x - previous.x, picture.y - previous.y)
      : undefined;
    if (step !== undefined && step > worst) worst = step;
    console.log(
      `  ${picture.key.padEnd(14)} ${picture.size.padStart(9)}  ` +
        `centre ${picture.x.toFixed(2)},${picture.y.toFixed(2)}` +
        (step === undefined ? '' : `   step ${step.toFixed(2)}`),
    );
    previous = picture;
  }
  console.log(`biggest step between consecutive pictures ${worst.toFixed(2)} world units`);
  if (game.errors.length) console.log(`page errors: ${game.errors.join(' | ')}`);
} finally {
  await game.close();
  await closeBrowser();
  await site.close();
}
