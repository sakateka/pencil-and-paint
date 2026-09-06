import { openGame } from './harness.js';
import { Suite } from './assert.js';

/**
 * The ending, which nobody was watching.
 *
 * When the last pot is found the colour floods outwards over a few seconds.
 * Nothing tested it, and a renderer change broke it in a way no other test
 * could see: for three quarters of a second in the middle of the sweep the
 * colour layer drew nothing at all, so the screen went back to pencil and then
 * jumped to full colour. Every other assertion in the suite passed, because
 * every other assertion looks at a still frame in ordinary play.
 *
 * What this pins is the shape of the sweep rather than any one frame: the lit
 * share of the screen goes up and never falls. That is the whole promise of
 * the ending — the colour arrives, it does not flicker on the way.
 */
export async function run(url) {
  const suite = new Suite('the ending');
  const game = await openGame(url);

  try {
    /*
     * Sampled sparsely and judged by hue rather than by exact colour: the
     * point is how much of the window is painted, not what is painted on it.
     * Every eighth pixel in both directions is four thousand samples, which is
     * far more than enough for a share and cheap enough to do every frame.
     */
    const sweep = await game.evaluate((pencil) => {
      const { game, renderer } = pencil;
      game.teleport(1300, 1330);

      /*
       * Every eighth pixel in both directions, over the whole window: the point
       * is how much of it is painted, not what is painted on it.
       */
      const litShare = () => {
        const w = renderer.width;
        const h = renderer.height;
        const img = pencil.composited(0, 0, w, h);
        let lit = 0;
        let seen = 0;
        for (let y = 0; y < h; y += 8) {
          for (let x = 0; x < w; x += 8) {
            const i = (y * w + x) * 4;
            const r = img.data[i];
            const g = img.data[i + 1];
            const b = img.data[i + 2];
            seen++;
            if (g > 90 && g > r * 1.12 && g > b * 1.12) lit++;
          }
        }
        return lit / seen;
      };

      /*
       * Stepped by hand rather than waited for.
       *
       * The sweep is driven by `advance`, so five seconds of it is five
       * seconds of clock, not five seconds of sitting still watching frames go
       * past — and on a loaded machine the frames come slower than the clock
       * anyway, which made this the longest thing in the suite by a factor of
       * two.
       */
      pencil.renderOnce();
      const before = litShare();
      game.collectAll();
      const shares = [];
      for (let i = 0; i < 300; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        pencil.renderOnce();
        if (i % 10 === 0) shares.push(+litShare().toFixed(3));
      }
      return { before: +before.toFixed(3), shares };
    });

    suite.atLeast(sweep.before, 0.01, 'the colour is a blob before the last pot');

    /*
     * The one that would have caught it. A drop of more than a couple of
     * percent between consecutive samples is the colour going away, and the
     * failure it was written for was a drop of fifty-two points to nothing.
     */
    let worstDrop = 0;
    let worstAt = -1;
    for (let i = 1; i < sweep.shares.length; i++) {
      const drop = sweep.shares[i - 1] - sweep.shares[i];
      if (drop > worstDrop) {
        worstDrop = drop;
        worstAt = i;
      }
    }
    suite.atMost(
      +worstDrop.toFixed(3),
      0.03,
      `the colour never goes backwards during the flood (worst dip at sample ${worstAt})`,
    );

    const settled = sweep.shares[sweep.shares.length - 1];
    suite.atLeast(settled, 0.8, 'and the whole window ends up coloured');
    suite.atLeast(
      +(settled - sweep.before).toFixed(3),
      0.5,
      'which is a great deal more than it started with',
    );

    suite.equal(game.errors.length, 0, 'no page errors');
  } finally {
    await game.close();
  }

  return suite;
}
