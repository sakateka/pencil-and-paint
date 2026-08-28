import { Suite } from './assert.js';
import { openGame } from './harness.js';

const RUN = { x: 2300, y: 1345 };

/**
 * The hen and her chick, in the run with the other five.
 *
 * They come from one of the paintings, and the thing worth asserting is not how
 * they look but the one behaviour that makes them a pair rather than two birds:
 * everything else in this valley keeps to a patch of ground, and the chick
 * keeps to its mother. It has no patch of its own and never flees on its own
 * account, because a frightened chick that ran the other way from her would be
 * a bug you would feel before you could name.
 */
export async function run(url) {
  const suite = new Suite('hen');
  const game = await openGame(url);

  try {
    const there = await game.evaluate((pencil, at) => {
      const { game } = pencil;
      const of = (kind) => game.herd.animals.filter((a) => a.kind === kind);
      const hen = of('hen')[0];
      const chick = of('chick')[0];
      return {
        hens: of('hen').length,
        chicks: of('chick').length,
        chickens: of('chicken').length,
        henScale: hen?.scale ?? 0,
        biggestChicken: Math.max(...of('chicken').map((c) => c.scale)),
        chickScale: chick?.scale ?? 0,
        inTheRun: Math.round(Math.hypot(hen.x - at.x, hen.y - at.y)),
        together: Math.round(Math.hypot(hen.x - chick.x, hen.y - chick.y)),
      };
    }, RUN);

    suite.equal(there.hens, 1, 'one hen');
    suite.equal(there.chicks, 1, 'and one chick');
    suite.ok(there.chickens >= 4, 'among the other chickens', `${there.chickens}`);
    suite.ok(
      there.henScale > there.biggestChicken,
      'she is bigger than any of them',
      `${there.henScale} vs ${there.biggestChicken}`,
    );
    suite.ok(there.chickScale < there.henScale / 1.5, 'and it is much smaller than her');
    suite.ok(there.inTheRun < 70, 'both of them inside the run', `${there.inTheRun}px`);
    suite.ok(there.together < 30, 'and they start side by side', `${there.together}px`);

    // A full minute of her wandering. It should never be more than a few steps
    // behind, whatever she does.
    const follow = await game.evaluate((pencil, at) => {
      const { game } = pencil;
      game.collectAll();
      game.teleport(at.x, at.y + 120);
      const hen = game.herd.animals.find((a) => a.kind === 'hen');
      const chick = game.herd.animals.find((a) => a.kind === 'chick');
      let max = 0;
      let moved = 0;
      const from = { x: hen.x, y: hen.y };
      for (let i = 0; i < 3600; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        max = Math.max(max, Math.hypot(hen.x - chick.x, hen.y - chick.y));
        moved = Math.max(moved, Math.hypot(hen.x - from.x, hen.y - from.y));
      }
      return { max: +max.toFixed(1), moved: +moved.toFixed(1) };
    }, RUN);

    suite.ok(follow.moved > 20, 'she does not stand still for a minute', `${follow.moved}px`);
    suite.ok(follow.max < 70, 'and it is never far behind her', `worst ${follow.max}px`);

    /*
     * Walk up to them. She shies off, as any of the birds would — and the point
     * is where the chick ends up: with her, not scattered the other way.
     */
    const startled = await game.evaluate((pencil) => {
      const { game } = pencil;
      const hen = game.herd.animals.find((a) => a.kind === 'hen');
      const chick = game.herd.animals.find((a) => a.kind === 'chick');
      game.teleport(hen.x, hen.y + 26);
      const before = { x: hen.x, y: hen.y };
      for (let i = 0; i < 150; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      pencil.renderOnce();
      return {
        henFled: +Math.hypot(hen.x - before.x, hen.y - before.y).toFixed(1),
        together: +Math.hypot(hen.x - chick.x, hen.y - chick.y).toFixed(1),
      };
    });

    suite.ok(startled.henFled > 5, 'she moves off when you come near', `${startled.henFled}px`);
    suite.ok(startled.together < 70, 'and it goes with her', `${startled.together}px`);

    // A new world puts the pair back together rather than scattering the chick
    // to a corner of the run on its own.
    const restarted = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.restart();
      const hen = game.herd.animals.find((a) => a.kind === 'hen');
      const chick = game.herd.animals.find((a) => a.kind === 'chick');
      for (let i = 0; i < 120; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return +Math.hypot(hen.x - chick.x, hen.y - chick.y).toFixed(1);
    });

    suite.ok(restarted < 70, 'a new world does not separate them', `${restarted}px`);

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
