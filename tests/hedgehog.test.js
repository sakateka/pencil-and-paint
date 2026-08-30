import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The hedgehog above the haystack.
 *
 * It will not come out for you. The whole of it is that lying back on the hay
 * and doing nothing is the one thing that brings it out — so the things worth
 * holding are the refusals: that walking up to the bush shows you nothing, that
 * the bench does not count, and that it waits before wandering into view.
 */
export async function run(url) {
  const suite = new Suite('hedgehog');
  const game = await openGame(url);

  try {
    const still = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.restart();
      const h = game.hedgehog;
      // Right up against the bush, for as long as anyone would stand there.
      game.teleport(h.x, h.y + 40);
      for (let i = 0; i < 60 * 8; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      }
      return { out: +h.out.toFixed(2), lit: h.lit, seen: h.seen };
    });

    suite.ok(still.lit, 'the colour reaches the bush when you stand at it');
    suite.equal(still.out, 0, 'but standing there shows you nothing');
    suite.equal(still.seen, false, 'and it has not been seen');

    const looks = await game.evaluate((pencil) => {
      const found = new Set();
      for (let i = 0; i < 40; i++) {
        pencil.game.restart();
        found.add(pencil.game.hedgehog.look);
      }
      return [...found].sort();
    });
    suite.equal(looks.join(), 'field,hybrid', 'new worlds randomly use both approved hedgehogs');

    const gated = await game.evaluate((pencil) => {
      const { game } = pencil;
      const samples = [];
      for (let found = 0; found <= 4; found++) {
        game.restart();
        for (let i = 0; i < found; i++) {
          const pot = game.pots.find((p) => !p.found);
          game.teleport(pot.x, pot.y + 6);
          game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        }
        const hay = game.perches.find((p) => p.pose === 'hay');
        game.teleport(hay.x, hay.y + 30);
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        game.interact();
        for (let i = 0; i < 60 * 6; i++) {
          game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        }
        samples.push({ found: game.found, lit: game.hedgehog.lit, out: game.hedgehog.out });
      }
      return samples;
    });
    suite.ok(gated.slice(0, 4).every((s) => !s.lit && s.out === 0), 'three pots cannot colour the raised bush');
    suite.ok(gated[4].lit && gated[4].out > 0, 'the fourth pot brings the hedgehog within reach');

    // The bench is a place to sit, not a place to be still enough.
    const bench = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.restart();
      const seat = game.perches.find((p) => p.pose === 'bench');
      game.teleport(seat.x, seat.y + 30);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const sat = game.interact();
      for (let i = 0; i < 60 * 8; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      }
      return { sat, resting: seat.resting, out: +game.hedgehog.out.toFixed(2) };
    });

    suite.ok(bench.sat && bench.resting, 'you can sit on the bench');
    suite.equal(bench.out, 0, 'and the hedgehog stays where it is');

    // The hay. Five full seconds of lying still are required before it moves.
    const hay = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.restart();
      for (let i = 0; i < 4; i++) {
        const pot = game.pots.find((p) => !p.found);
        game.teleport(pot.x, pot.y + 6);
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      }
      const perch = game.perches.find((p) => p.pose === 'hay');
      game.teleport(perch.x, perch.y + 30);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const lay = game.interact();
      const run = (seconds) => {
        for (let i = 0; i < Math.round(60 * seconds); i++) {
          game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        }
        return +game.hedgehog.out.toFixed(2);
      };
      const waiting = run(4.9);
      const started = run(0.2);
      let guard = 0;
      while (!game.hedgehog.seen && guard++ < 300) run(1 / 60);
      const arrived = {
        out: +game.hedgehog.out.toFixed(2),
        facing: game.hedgehog.facing,
        moved: { x: Math.round(game.hedgehog.atX), y: Math.round(game.hedgehog.atY) },
      };
      const heldFar = run(1);
      const heldFarMoving = game.hedgehog.moving;
      let farPauseFrames = 60;
      while (game.hedgehog.out === 1 && farPauseFrames++ < 360) run(1 / 60);
      const returning = run(0.5);
      const returningFacing = game.hedgehog.facing;
      let guardNear = 0;
      while (game.hedgehog.facing === 1 && guardNear++ < 300) run(1 / 60);
      const heldNear = run(1);
      const heldNearMoving = game.hedgehog.moving;
      const heldNearFacing = game.hedgehog.facing;
      const venturedAgain = run(5.1);
      return {
        lay,
        waiting,
        started,
        arrived,
        heldFar,
        heldFarMoving,
        farPause: farPauseFrames / 60,
        returning,
        returningFacing,
        heldNear,
        heldNearMoving,
        heldNearFacing,
        venturedAgain,
        seen: game.hedgehog.seen,
        home: { x: game.hedgehog.x, y: game.hedgehog.y },
      };
    });

    suite.ok(hay.lay, 'you can lie back on the hay');
    suite.equal(hay.waiting, 0, 'it stays hidden for the first five seconds');
    suite.ok(hay.started > 0 && hay.started < 0.1, 'then it starts to come out', `${hay.started}`);
    suite.equal(hay.arrived.out, 1, 'until it is all the way out');
    suite.equal(hay.arrived.facing, 1, 'and turns towards the bush instantly');
    suite.ok(hay.seen, 'and that counts as having seen it');
    suite.equal(hay.heldFar, 1, 'it stops at the far end instead of pacing constantly');
    suite.equal(hay.heldFarMoving, false, 'and stands still there');
    suite.ok(hay.farPause >= 2.5 && hay.farPause <= 5.1, 'like livestock, it pauses for a while', `${hay.farPause}s`);
    suite.ok(hay.returning < 1, 'it ambles back along its little path', `${hay.returning}`);
    suite.equal(hay.returningFacing, 1, 'and turns towards the bush instantly');
    suite.equal(hay.heldNear, 0.46, 'it stops again at the near end');
    suite.equal(hay.heldNearMoving, false, 'rather than immediately pacing back');
    suite.equal(hay.heldNearFacing, -1, 'with another instant turn');
    suite.ok(hay.venturedAgain > 0.46, 'then wanders out again', `${hay.venturedAgain}`);
    suite.ok(
      hay.arrived.moved.y > hay.home.y + 20,
      'it has left the bush, not appeared inside it',
      `${hay.arrived.moved.x},${hay.arrived.moved.y} from ${hay.home.x},${hay.home.y}`,
    );

    // And it does not stay for somebody who gets up.
    const gone = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.cancel();
      const before = game.hedgehog.out;
      const lingered = (() => {
        for (let i = 0; i < 30; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        return +game.hedgehog.out.toFixed(2);
      })();
      for (let i = 0; i < 120; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const retreating = +game.hedgehog.out.toFixed(2);
      for (let i = 0; i < 480; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { before: +before.toFixed(2), lingered, retreating, out: +game.hedgehog.out.toFixed(2) };
    });

    suite.equal(gone.lingered, gone.before, 'getting up does not frighten it away at once');
    suite.ok(gone.retreating < gone.lingered, 'then it walks back towards the bush', `${gone.retreating}`);
    suite.equal(gone.out, 0, 'and it is gone');

    // Out of the colour it is a drawing of a bush, and nothing happens in one.
    const dark = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.restart();
      game.teleport(400, 1500);
      for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { lit: game.hedgehog.lit, out: game.hedgehog.out };
    });

    suite.equal(dark.lit, false, 'away across the valley the bush is unlit');
    suite.equal(dark.out, 0, 'and nothing is happening in it');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
