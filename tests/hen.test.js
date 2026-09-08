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
     *
     * The approach is from whichever side of her is outward from the centre of
     * her run, so she always has the whole field to shy into. She wanders while
     * the page runs, and the background frames that slip in before this starts
     * leave her anywhere in the run — approach her from a fixed side and she is
     * sometimes already at that edge, with nowhere to go: the shy target clamps
     * to where she stands and she barely stirs.
     */
    const startled = await game.evaluate((pencil) => {
      const { game } = pencil;
      const hen = game.herd.animals.find((a) => a.kind === 'hen');
      const chick = game.herd.animals.find((a) => a.kind === 'chick');
      let dx = hen.x - hen.homeX;
      let dy = hen.y - hen.homeY;
      const len = Math.hypot(dx, dy) || 1; // at the centre, any side will do
      if (len < 1) dx = 1;
      game.teleport(hen.x + (dx / len) * 26, hen.y + (dy / len) * 26);
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

    /*
     * --- and the other hen, the one on the nest ---
     *
     * A second bird and deliberately not this one: that hen wanders the run all
     * day and this one has not moved for a fortnight. What is worth asserting
     * about her is exactly that — she sits. Everything else in the valley that
     * is alive either wanders or flees, and she does neither, which is why she
     * is the only bird you can walk up to and look at.
     */
    const broody = await game.evaluate((pencil) => {
      const { game } = pencil;
      const of = (kind) => game.herd.animals.filter((a) => a.kind === kind);
      const her = of('broody')[0];
      const run = { left: 2200, right: 2430, top: 1290, bottom: 1420 };
      return {
        count: of('broody').length,
        inTheRun:
          her.x > run.left && her.x < run.right && her.y > run.top && her.y < run.bottom,
        // Past the five chickens' patch, so nothing wanders over her.
        clearOfTheFlock: Math.min(
          ...of('chicken').map((c) => Math.hypot(c.homeX - her.x, c.homeY - her.y) - c.homeRadius),
        ),
        /*
         * Nought, which is the data fact that makes her sit. Not her `scale` —
         * she is drawn about twice a chicken's size at the same scale, so a
         * comparison of those two numbers says nothing and passing it would
         * have been theatre.
         */
        speed: her.speed,
        homeRadius: her.homeRadius,
        // She is not the hen with the chick: two different animals.
        separate: of('hen')[0] !== her,
        at: `${Math.round(her.x)},${Math.round(her.y)}`,
      };
    });

    suite.equal(broody.count, 1, 'one hen on the nest');
    suite.ok(broody.separate, 'and she is not the hen with the chick');
    suite.ok(broody.inTheRun, 'sitting inside the run', broody.at);
    suite.ok(broody.clearOfTheFlock > 0, 'out of the flock’s way', `${Math.round(broody.clearOfTheFlock)}px clear`);
    suite.equal(broody.speed, 0, 'she has no walking speed at all');
    suite.equal(broody.homeRadius, 0, 'and no patch of field to wander round');

    // Walk right up to her, wait, and she has not budged.
    const sat = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.collectAll();
      const her = game.herd.animals.find((a) => a.kind === 'broody');
      const from = { x: her.x, y: her.y };
      game.teleport(her.x, her.y + 26);
      let clockRan = 0;
      const clockAt = her.clock;
      for (let i = 0; i < 3600; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      }
      clockRan = her.clock - clockAt;
      return {
        moved: +Math.hypot(her.x - from.x, her.y - from.y).toFixed(3),
        clockRan: +clockRan.toFixed(1),
        awake: her.awake,
      };
    });

    suite.ok(sat.awake, 'the colour is on her');
    suite.equal(sat.moved, 0, 'a minute of you standing over her and she sits tight');
    suite.atLeast(sat.clockRan, 50, 'but her clock runs, so she is breathing');

    // And out in the graphite she is a drawing: the clock stops with everything.
    const away = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.restart();
      const her = game.herd.animals.find((a) => a.kind === 'broody');
      game.teleport(her.x, her.y + 1200);
      const clockAt = her.clock;
      const from = { x: her.x, y: her.y };
      for (let i = 0; i < 600; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      }
      return {
        clockRan: +(her.clock - clockAt).toFixed(3),
        moved: +Math.hypot(her.x - from.x, her.y - from.y).toFixed(3),
        awake: her.awake,
      };
    });

    suite.equal(away.awake, false, 'walk away and she is out in the graphite');
    suite.equal(away.clockRan, 0, 'and her breath stops with everything else out there');
    suite.equal(away.moved, 0, 'a restart does not scatter her off the nest either');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
