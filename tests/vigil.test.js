import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The stump in the northern wood, and the elephant.
 *
 * Sitting still is the only thing in this valley that costs patience rather
 * than walking, so the assertions are about the waiting: that it is a real
 * wait, that standing up loses it, and that nothing turns up a moment early.
 *
 * The clock is stepped rather than waited out, so the suite does not spend its
 * runtime watching a stump.
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
        elephantY: Math.round(v.elephantY),
        solid,
      };
    });

    suite.ok(there.y < there.height * 0.2, 'the stump is at the head of the valley', `y ${there.y}`);
    suite.ok(there.solid > 0, 'and you cannot stand inside it');
    suite.ok(there.fromPond > 330, 'well clear of the pond', `${there.fromPond}px`);
    suite.ok(there.elephantY < -100, 'and the elephant stands high in the sky', `y ${there.elephantY}`);
    suite.ok(there.gap > 300 && there.gap < 560, 'across the sky from it', `${there.gap}px`);

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
     * Sit, and watch it come. The ten seconds are the arrival, not a wait in
     * front of one — a second in should already be more elephant than it was.
     */
    const waiting = await game.evaluate((pencil) => {
      const { game } = pencil;
      const v = game.vigil;
      const sat = game.interact();
      const from = { x: game.walker.x, y: game.walker.y };
      const run = (seconds) => {
        // Push hard the whole time: sitting still means sitting still.
        for (let i = 0; i < 60 * seconds; i++) {
          game.advance(1 / 60, { direction: () => ({ x: 1, y: 1 }) });
        }
        return +v.elephant.toFixed(2);
      };
      const early = run(2);
      const half = run(3);
      const nearly = run(3);
      return {
        sat,
        early,
        half,
        nearly,
        sitting: v.sitting,
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
    suite.ok(waiting.early > 0.1 && waiting.early < 0.4, 'it starts turning up at once', `${waiting.early}`);
    suite.ok(waiting.half > waiting.early, 'and keeps coming', `${waiting.early} → ${waiting.half}`);
    suite.ok(waiting.nearly > waiting.half, 'the whole time you sit', `${waiting.half} → ${waiting.nearly}`);
    suite.ok(waiting.nearly < 1, 'without being finished early', `${waiting.nearly}`);
    suite.ok(!waiting.seen, 'and it does not count as seen until it is all there');
    suite.equal(waiting.prompt, null, 'nothing on offer while you sit');
    suite.equal(waiting.leaving, 'prompt.standUp', 'and the way out says get up');

    // The last of it.
    const arrived = await game.evaluate((pencil) => {
      const { game } = pencil;
      for (let i = 0; i < 60 * 4; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      }
      pencil.renderOnce(); // something enormous must draw cleanly
      return { elephant: +game.vigil.elephant.toFixed(2), seen: game.vigil.seen };
    });

    suite.equal(arrived.elephant, 1, 'stay put and it is all there');
    suite.ok(arrived.seen, 'and it has been seen');

    // Stand up and it goes. It is here because you were still, not because you
    // earned it.
    const left = await game.evaluate((pencil) => {
      const { game } = pencil;
      dispatchEvent(new KeyboardEvent('keydown', { key: 'q', code: 'KeyQ', bubbles: true }));
      const standing = { sitting: game.vigil.sitting, clock: game.vigil.clock };
      // Part way through coming apart — it takes its time going, the same as
      // it took its time arriving.
      for (let i = 0; i < 60 * 3; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const halfGone = +game.vigil.elephant.toFixed(2);
      for (let i = 0; i < 60 * 6; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const from = { x: game.walker.x, y: game.walker.y };
      for (let i = 0; i < 40; i++) game.advance(1 / 60, { direction: () => ({ x: 1, y: 0 }) });
      return {
        ...standing,
        halfGone,
        elephant: game.vigil.elephant,
        moved: +Math.hypot(game.walker.x - from.x, game.walker.y - from.y).toFixed(1),
      };
    });

    suite.ok(!left.sitting, 'Q gets you up');
    suite.equal(left.clock, 0, 'and the wait starts over');
    suite.ok(
      left.halfGone > 0.1 && left.halfGone < 0.9,
      'it comes apart slowly rather than switching off',
      `${left.halfGone} three seconds after standing`,
    );
    suite.equal(left.elephant, 0, 'and is gone once it has');
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

    /*
     * Out in the graphite, the stump and whatever is standing by it must hold
     * perfectly still.
     *
     * Pencil strokes jitter against a boil counter that ticks seven times a
     * second, and anything drawn without freezing it twitches even though it is
     * a drawing on paper. It caught the owl first and then these. The wait is
     * real time: the boil is driven by the page's animation loop, so stepping
     * the simulation leaves it exactly where it was.
     */
    const sample = (pencil) => {
      const { game } = pencil;
      const ctx = document.querySelector('#game').getContext('2d');
      const sx = Math.round(game.camera.toScreenX(game.vigil.x) * pencil.renderer.scale);
      const sy = Math.round(game.camera.toScreenY(game.vigil.y) * pencil.renderer.scale);
      const R = 70;
      const data = ctx.getImageData(sx - R, sy - R * 1.4, R * 2, R * 2).data;
      let hash = 0;
      let opaque = 0;
      for (let i = 0; i < data.length; i++) hash = (hash * 31 + data[i]) | 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 200) opaque++;
      return { hash, opaque };
    };

    await game.evaluate((pencil) => {
      const { game } = pencil;
      const v = game.vigil;
      // Sat, so the elephant is there, then the view moved out of the colour.
      game.restart();
      game.teleport(v.x, v.y + 30);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.summonElephant();
      for (let i = 0; i < 60 * 8; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      // Far enough that it is graphite again, near enough to still be on screen.
      game.teleport(v.x - 330, v.y + 190);
      for (let i = 0; i < 120; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      pencil.renderOnce();
    });

    const firstFrame = await game.evaluate(sample);
    await game.page.waitForTimeout(450); // three boil ticks, wall clock
    const laterFrame = await game.evaluate(sample);

    suite.ok(
      firstFrame.opaque > 2000,
      'the sample is actually looking at the page',
      `${firstFrame.opaque} opaque pixels`,
    );
    suite.equal(laterFrame.hash, firstFrame.hash, 'in graphite nothing twitches');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
