import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * Anything the colour has not reached is a drawing, and drawings do not move.
 *
 * This is the game's central conceit, so it is worth asserting precisely: a
 * distant animal must not drift, and its private clock must not advance either
 * — otherwise its tail would still be swishing while it stood still, which
 * gives away that the world is running rather than drawn.
 */
export async function run(url) {
  const suite = new Suite('stillness');
  const game = await openGame(url);

  try {
    const frozen = await game.evaluate((pencil) => {
      const { game } = pencil;
      // Stand far away from the north-east pasture.
      game.walker.x = 1300;
      game.walker.y = 1330;
      const sheep = game.herd.animals.find((a) => a.kind === 'sheep' && !game.isAwakeAt(a.x, a.y, 8));
      if (!sheep) return null;

      const before = { x: sheep.x, y: sheep.y, clock: sheep.clock, walk: sheep.walkPhase };
      for (let i = 0; i < 180; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return {
        distance: Math.round(Math.hypot(sheep.x - game.walker.x, sheep.y - game.walker.y)),
        awake: sheep.awake,
        moved: +Math.hypot(sheep.x - before.x, sheep.y - before.y).toFixed(4),
        clockAdvanced: +(sheep.clock - before.clock).toFixed(4),
        walkAdvanced: +(sheep.walkPhase - before.walk).toFixed(4),
      };
    });

    suite.ok(frozen, 'found a sheep outside the colour');
    if (frozen) {
      suite.ok(!frozen.awake, 'distant sheep is asleep', `${frozen.distance}px away`);
      suite.equal(frozen.moved, 0, 'distant sheep does not move');
      suite.equal(frozen.clockAdvanced, 0, 'its clock does not advance');
      suite.equal(frozen.walkAdvanced, 0, 'its walk cycle does not advance');
    }

    // Walk the colour over to it, and it should come back to life.
    const woken = await game.evaluate((pencil) => {
      const { game } = pencil;
      const sheep = game.herd.animals.find((a) => a.kind === 'sheep');
      game.walker.x = sheep.x + 30;
      game.walker.y = sheep.y + 30;
      const before = { x: sheep.x, y: sheep.y, clock: sheep.clock };
      for (let i = 0; i < 180; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return {
        awake: sheep.awake,
        clockAdvanced: +(sheep.clock - before.clock).toFixed(2),
        moved: +Math.hypot(sheep.x - before.x, sheep.y - before.y).toFixed(2),
      };
    });

    suite.ok(woken.awake, 'a sheep the colour reaches wakes up');
    suite.atLeast(woken.clockAdvanced, 2.5, 'its clock runs at real time once awake');
    suite.atLeast(woken.moved, 1, 'it shies away from the walker');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
