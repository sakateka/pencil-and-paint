import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The hedgehog above the haystack.
 *
 * It will not come out for you. The whole of it is that lying back on the hay
 * and doing nothing is the one thing that brings it out — so the things worth
 * holding are the refusals: that walking up to the bush shows you nothing, that
 * the bench does not count, and that standing up sends it straight back.
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

    /*
     * The hay. It takes its time — a hedgehog that appeared the instant you lay
     * down would be a vending machine — so this checks it is still arriving
     * part way through rather than only that it arrives.
     */
    const hay = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.restart();
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
      const early = run(1);
      const later = run(1.2);
      const done = run(3);
      const moved = { x: Math.round(game.hedgehog.atX), y: Math.round(game.hedgehog.atY) };
      return { lay, early, later, done, moved, seen: game.hedgehog.seen, home: { x: game.hedgehog.x, y: game.hedgehog.y } };
    });

    suite.ok(hay.lay, 'you can lie back on the hay');
    suite.ok(hay.early > 0 && hay.early < 0.5, 'it starts to come out', `${hay.early}`);
    suite.ok(hay.later > hay.early, 'and keeps coming', `${hay.early} → ${hay.later}`);
    suite.equal(hay.done, 1, 'until it is all the way out');
    suite.ok(hay.seen, 'and that counts as having seen it');
    suite.ok(
      hay.moved.y > hay.home.y + 20,
      'it has left the bush, not appeared inside it',
      `${hay.moved.x},${hay.moved.y} from ${hay.home.x},${hay.home.y}`,
    );

    // And it does not stay for somebody who gets up.
    const gone = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.cancel();
      const half = (() => {
        for (let i = 0; i < 30; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        return +game.hedgehog.out.toFixed(2);
      })();
      for (let i = 0; i < 120; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { half, out: +game.hedgehog.out.toFixed(2) };
    });

    suite.ok(gone.half > 0 && gone.half < 1, 'getting up sends it back, not off', `${gone.half}`);
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
