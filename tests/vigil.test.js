import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The stump in the northern wood, and the elephant.
 *
 * Two minutes of sitting still is the only thing in this valley that costs
 * patience rather than walking, so the assertions are about the waiting: that
 * it is genuinely long, that standing up loses it, and that nothing turns up a
 * moment early.
 *
 * The clock is stepped rather than waited out — two minutes per run, five times
 * over, would be most of the suite's runtime spent watching a stump.
 */
export async function run(url) {
  const suite = new Suite('vigil');
  const game = await openGame(url);

  try {
    const there = await game.evaluate((pencil) => {
      const { game } = pencil;
      const v = game.vigil;
      const solid = game.world.colliders.filter(
        (c) => c.kind === 'circle' && Math.hypot(c.x - v.x, c.y - v.y) < 20,
      ).length;
      return {
        x: Math.round(v.x),
        y: Math.round(v.y),
        height: game.world.height,
        // Far enough from the water that the pond does not answer instead.
        fromPond: Math.round(Math.hypot(v.x - game.world.pond.x, v.y - game.world.pond.y)),
        gap: Math.round(Math.hypot(v.x - v.elephantX, v.y - v.elephantY)),
        solid,
      };
    });

    suite.ok(there.y < there.height * 0.55, 'the stump is in the north', `y ${there.y}`);
    suite.ok(there.solid > 0, 'and you cannot stand inside it');
    suite.ok(there.fromPond > 330, 'well clear of the pond', `${there.fromPond}px`);
    suite.ok(there.gap > 90 && there.gap < 260, 'with room in front of it', `${there.gap}px`);

    // Walking up to it offers a sit, before any pot has been found.
    const offered = await game.evaluate((pencil) => {
      const { game } = pencil;
      const v = game.vigil;
      game.teleport(v.x, v.y + 34);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { won: game.won, prompt: game.interaction, leaving: game.leaving };
    });

    suite.ok(!offered.won, 'with the pots still out there');
    suite.equal(offered.prompt?.kind, 'sit', 'the stump offers a sit anyway');
    suite.equal(offered.prompt?.say, 'prompt.sit', 'and says so');
    suite.equal(offered.leaving, null, 'with nothing to get up from yet');

    /*
     * Sit, and then most of the wait. Nothing may appear early: the whole point
     * is the length of it, and an elephant that turns up after twenty seconds
     * is a different feature entirely.
     */
    const waiting = await game.evaluate((pencil) => {
      const { game } = pencil;
      const v = game.vigil;
      const sat = game.interact();
      const from = { x: game.walker.x, y: game.walker.y };
      // Push hard the whole time: sitting still means sitting still.
      for (let i = 0; i < 60 * 110; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 1, y: 1 }) });
      }
      return {
        sat,
        sitting: v.sitting,
        elephant: v.elephant,
        seen: v.seen,
        clock: Math.round(v.clock),
        moved: +Math.hypot(game.walker.x - from.x, game.walker.y - from.y).toFixed(1),
        prompt: game.interaction,
        leaving: game.leaving,
      };
    });

    suite.ok(waiting.sat, 'you can sit down on it');
    suite.ok(waiting.sitting, 'and you are sitting');
    suite.equal(waiting.moved, 0, 'and cannot walk off while you are');
    suite.ok(waiting.clock >= 108, 'nearly two minutes in', `${waiting.clock}s`);
    suite.equal(waiting.elephant, 0, 'and there is still nothing there');
    suite.ok(!waiting.seen, 'nothing has been seen');
    suite.equal(waiting.prompt, null, 'nothing on offer while you sit');
    suite.equal(waiting.leaving, 'prompt.standUp', 'and the way out says get up');

    // The rest of the wait.
    const arrived = await game.evaluate((pencil) => {
      const { game } = pencil;
      for (let i = 0; i < 60 * 20; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      }
      pencil.renderOnce(); // something enormous must draw cleanly
      return { elephant: +game.vigil.elephant.toFixed(2), seen: game.vigil.seen };
    });

    suite.equal(arrived.elephant, 1, 'wait it out and it is there');
    suite.ok(arrived.seen, 'and it has been seen');

    // Stand up and it goes. It is here because you were still, not because you
    // earned it.
    const left = await game.evaluate((pencil) => {
      const { game } = pencil;
      dispatchEvent(new KeyboardEvent('keydown', { key: 'q', code: 'KeyQ', bubbles: true }));
      const standing = { sitting: game.vigil.sitting, clock: game.vigil.clock };
      for (let i = 0; i < 60 * 4; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const from = { x: game.walker.x, y: game.walker.y };
      for (let i = 0; i < 40; i++) game.advance(1 / 60, { direction: () => ({ x: 1, y: 0 }) });
      return {
        ...standing,
        elephant: game.vigil.elephant,
        moved: +Math.hypot(game.walker.x - from.x, game.walker.y - from.y).toFixed(1),
      };
    });

    suite.ok(!left.sitting, 'Q gets you up');
    suite.equal(left.clock, 0, 'and the wait starts over');
    suite.equal(left.elephant, 0, 'the elephant is gone');
    suite.ok(left.moved > 5, 'and you can walk again', `${left.moved}px`);

    // A new world has no elephant in it and no memory of one.
    const restarted = await game.evaluate((pencil) => {
      const { game } = pencil;
      const v = game.vigil;
      game.teleport(v.x, v.y + 34);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.interact();
      game.restart();
      return { sitting: v.sitting, clock: v.clock, elephant: v.elephant, seen: v.seen };
    });

    suite.ok(!restarted.sitting, 'a new world puts you back on your feet');
    suite.equal(restarted.clock, 0, 'with the wait reset');
    suite.equal(restarted.elephant, 0, 'and nothing standing in the trees');
    suite.ok(!restarted.seen, 'and no memory of having seen it');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
