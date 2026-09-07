import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The pose library: every drawing in the game, baked once and afterwards moved.
 *
 * Asked without a picture. The library is plain Canvas2D — it bakes under
 * `?nodraw`, where Phaser is never created at all — so what it holds can be
 * inspected in a couple of seconds rather than in the framed suites.
 */
export async function run(url) {
  const suite = new Suite('looks');
  const game = await openGame(url);

  try {
    /*
     * Every baked picture must have a transparent edge to slide on.
     *
     * A sprite is a quad and the edge of a quad is not antialiased: a screen
     * pixel is inside it or it is not. The only thing that can put a silhouette
     * between two pixels is a soft edge *inside* the texture, which the
     * filtering ramps across. So a picture cropped flush against fully opaque
     * ink cannot move by less than a whole pixel, however smooth the number
     * driving it.
     *
     * That is not theoretical. A sheep's back is a row of fluff circles, whose
     * topmost row of ink is a half-transparent crown, and it slid a tenth of a
     * pixel at a time. A cow's back is one straight fill edge landing exactly
     * on the bake's pixel grid, so its topmost row came out fully opaque — and
     * walking north she held still for five frames and then jumped a whole one.
     * Measured on the fix: 44 frames of 44 moved, none by more than 0.12px.
     *
     * `BLEED` in `looks.ts` is what this asserts. It is worth asserting rather
     * than trusting, because the fault is invisible in every still and the
     * obvious "optimisation" — crop tight, it is only transparent pixels — puts
     * it straight back.
     */
    const edges = await game.evaluate((pencil) => {
      const worst = [];
      let checked = 0;
      for (const [slot, baked] of pencil.renderer.looks.entries()) {
        if (!baked.canvas || !baked.width || !baked.height) continue;
        checked++;
        const ctx = baked.canvas.getContext('2d', { willReadFrequently: true });
        const { data } = ctx.getImageData(0, 0, baked.width, baked.height);
        const alpha = (x, y) => data[(y * baked.width + x) * 4 + 3];
        let max = 0;
        for (let x = 0; x < baked.width; x++) {
          max = Math.max(max, alpha(x, 0), alpha(x, baked.height - 1));
        }
        for (let y = 0; y < baked.height; y++) {
          max = Math.max(max, alpha(0, y), alpha(baked.width - 1, y));
        }
        if (max > 0) worst.push(`${slot} ${max}`);
      }
      return { checked, worst: worst.slice(0, 4), count: worst.length };
    });

    suite.atLeast(edges.checked, 100, 'the library baked something to look at');
    suite.equal(
      edges.count,
      0,
      'every baked picture has a transparent border to slide on',
      edges.worst.join(', '),
    );

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
