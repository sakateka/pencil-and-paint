import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The fences, which are the one thing in the valley that tells a cow from you.
 *
 * A fence that stopped everybody would be a paddock you never see the inside
 * of; a fence that stopped nobody is a drawing of a fence. So there are two
 * halves to assert and they pull opposite ways: the stock is held, and you are
 * not. The third is that being held is not the same as being stuck — an animal
 * pressed into a rail has to be able to give up and graze, or the field is a
 * cage with a cow vibrating in the corner of it.
 */
export async function run(url) {
  const suite = new Suite('fences');
  const game = await openGame(url);

  try {
    const built = await game.evaluate((pencil) => {
      const { game } = pencil;
      const rails = game.world.stockColliders.filter((c) => c.kind === 'segment');
      const total = rails.reduce(
        (sum, c) => sum + Math.hypot(c.x2 - c.x1, c.y2 - c.y1),
        0,
      );
      return {
        rails: rails.length,
        walkerSees: game.world.colliders.filter((c) => c.kind === 'segment').length,
        extra: game.world.stockColliders.length - game.world.colliders.length,
        metres: Math.round(total),
      };
    });

    suite.atLeast(built.rails, 40, 'the fences are solid to the stock');
    suite.atLeast(built.metres, 2000, 'and that is the whole run of them, not one span');
    suite.equal(built.walkerSees, 0, 'and solid to nobody else', 'no rail is in the walker list');
    suite.equal(
      built.extra,
      built.rails,
      'the stock list is the walker list plus the rails, nothing else',
    );

    /*
     * Four gates, one per enclosure, each shutting the gap its run leaves.
     *
     * Found by length: a gate spans a gap the fence deliberately left, so it is
     * far longer than the 34-unit spacing the rails are cut into.
     */
    const gates = await game.evaluate((pencil) => {
      const long = pencil.game.world.stockColliders
        .filter((c) => c.kind === 'segment' && Math.hypot(c.x2 - c.x1, c.y2 - c.y1) > 45)
        .map((c) => ({
          x: Math.round((c.x1 + c.x2) / 2),
          y: Math.round((c.y1 + c.y2) / 2),
          span: Math.round(Math.hypot(c.x2 - c.x1, c.y2 - c.y1)),
        }));
      return long;
    });

    suite.equal(gates.length, 4, 'four gates hung, one per field', JSON.stringify(gates));

    /*
     * You climb in. Drive the walker at a paddock rail from outside and it has
     * to end up inside — this is the assertion that keeps a future fence from
     * quietly becoming a wall.
     */
    const climbed = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.collectAll();
      // Straight down at the paddock's bottom rail, from well below it.
      game.teleport(2300, 1120);
      for (let i = 0; i < 260; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: -1 }) });
      }
      return { x: Math.round(game.walker.x), y: Math.round(game.walker.y) };
    });

    suite.ok(
      climbed.y < 1000,
      'the walker climbs into the paddock',
      `ended at ${climbed.x},${climbed.y}`,
    );

    /*
     * And the stock does not climb out. Ten minutes of every animal wandering,
     * with the colour everywhere so they are all awake and the walker parked
     * out of the way, watching for anybody standing in a rail.
     *
     * Overlap rather than "left the field": an animal shoved through a rail
     * shows up here on the frame it is halfway through, which a bounds check at
     * the end would miss entirely.
     */
    const roam = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.collectAll();
      game.teleport(1300, 300);
      const rails = game.world.stockColliders.filter((c) => c.kind === 'segment');
      const walkers = game.herd.animals.filter(
        (a) => a.kind !== 'frog' && a.kind !== 'cat',
      );
      const from = walkers.map((a) => ({ x: a.x, y: a.y }));

      let worst = 0;
      let where = null;
      let stillest = Infinity;
      const moved = walkers.map(() => 0);

      for (let step = 0; step < 36000; step++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        walkers.forEach((a, i) => {
          moved[i] = Math.max(moved[i], Math.hypot(a.x - from[i].x, a.y - from[i].y));
          const radius = (a.kind === 'chick' ? 4 : 11) * a.scale;
          for (const c of rails) {
            const ex = c.x2 - c.x1;
            const ey = (c.y2 - c.y1) * 1.6;
            const lengthSq = ex * ex + ey * ey;
            const px = a.x;
            const py = a.y * 1.6;
            let t = lengthSq > 0.001 ? ((px - c.x1) * ex + (py - c.y1 * 1.6) * ey) / lengthSq : 0;
            t = Math.max(0, Math.min(1, t));
            const d = Math.hypot(px - (c.x1 + ex * t), py - (c.y1 * 1.6 + ey * t));
            const overlap = c.r + radius - d;
            if (overlap > worst) {
              worst = overlap;
              where = { kind: a.kind, x: Math.round(a.x), y: Math.round(a.y) };
            }
          }
        });
      }
      stillest = Math.min(...moved);
      return {
        worst: +worst.toFixed(2),
        where,
        stillest: +stillest.toFixed(1),
        counted: walkers.length,
      };
    });

    suite.atLeast(roam.counted, 20, 'the whole herd was watched');
    suite.atMost(roam.worst, 0.01, 'no animal is ever standing in a rail');
    suite.ok(
      roam.where === null || roam.worst <= 0.01,
      'nobody got through',
      JSON.stringify(roam.where),
    );
    // Held, not trapped: the one that wandered least still got somewhere.
    suite.ok(
      roam.stillest > 15,
      'and none of them is stuck against a fence',
      `the stillest moved ${roam.stillest}px`,
    );

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
