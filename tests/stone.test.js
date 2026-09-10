import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The black stone: the one thing in the valley that catches the light.
 *
 * What matters about it is not how it looks but when it is allowed to do
 * anything. Out in the graphite the valley is an unfinished drawing, and an
 * unfinished drawing does not twinkle — so the wink is gated on the whole
 * stone being inside the colour, not on the point it stands on. A stone
 * flashing with half of itself still in pencil is the one thing this world
 * does not do.
 */
export async function run(url) {
  const suite = new Suite('stone');
  const game = await openGame(url);

  try {
    const placed = await game.evaluate((pencil) => {
      const { game } = pencil;
      const spawn = { x: 1300, y: 1330 };
      return {
        x: Math.round(game.world.secret.x),
        y: Math.round(game.world.secret.y),
        fromSpawn: Math.round(Math.hypot(game.world.secret.x - spawn.x, game.world.secret.y - spawn.y)),
        // Solid: the collider went up with it.
        solid: game.world.colliders.some(
          (c) =>
            c.kind === 'circle' &&
            Math.abs(c.x - game.world.secret.x) < 1 &&
            Math.abs(c.y - (game.world.secret.y - 1.5)) < 1,
        ),
        lit: game.secret.lit,
        glint: game.secret.glint,
      };
    });

    suite.ok(placed.fromSpawn > 500, 'it is not lying at your feet at the spawn', `${placed.fromSpawn}px away`);
    suite.ok(placed.solid, 'you cannot walk through it', `at ${placed.x},${placed.y}`);
    suite.equal(placed.lit, false, 'it starts out in the graphite');
    suite.equal(placed.glint, 0, 'and it is not winking out there');

    /*
     * Stand right beside it in the graphite — near enough for the colour to
     * touch it, not near enough to cover it — and it still must not wink.
     * `isWhollyLit` is the whole difference and this is what asks for it.
     */
    const halfLit = await game.evaluate((pencil) => {
      const { game } = pencil;
      const stone = game.world.secret;
      /*
       * Stood so the stone's centre is inside the colour and its edge is not.
       *
       * The colour is measured from a point fourteen units above the walker, so
       * standing `d` south of the stone puts it `d + 14` from the middle of the
       * light. Wanted: more than `maskRadius - SECRET_REACH` (or the whole
       * stone would be lit) and less than `maskRadius` (or none of it would be).
       */
      game.teleport(stone.x, stone.y + (game.maskRadius - 24));
      let awoke = false;
      let winked = 0;
      for (let i = 0; i < 900; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        if (game.isAwakeAt(stone.x, stone.y, 0)) awoke = true;
        winked = Math.max(winked, game.secret.glint);
      }
      return { awoke, winked: +winked.toFixed(3), lit: game.secret.lit };
    });

    suite.ok(halfLit.awoke, 'the colour reaches the stone from there');
    suite.equal(halfLit.lit, false, 'but it is not wholly in the colour');
    suite.equal(halfLit.winked, 0, 'so it does not wink with one edge in pencil');

    // And with the colour right over it, it winks — and keeps winking.
    const lit = await game.evaluate((pencil) => {
      const { game } = pencil;
      const stone = game.world.secret;
      game.collectAll();
      game.teleport(stone.x, stone.y + 40);
      let peak = 0;
      let winks = 0;
      let wasDark = true;
      for (let i = 0; i < 3600; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        peak = Math.max(peak, game.secret.glint);
        if (wasDark && game.secret.glint > 0.5) {
          winks += 1;
          wasDark = false;
        } else if (game.secret.glint === 0) {
          wasDark = true;
        }
      }
      return { peak: +peak.toFixed(2), winks, lit: game.secret.lit };
    });

    suite.ok(lit.lit, 'the colour covers the whole of it');
    suite.atLeast(lit.peak, 0.9, 'and it catches the light properly');
    suite.atLeast(lit.winks, 8, 'more than once a minute, and not once and done');
    suite.atMost(lit.winks, 30, 'but it is a wink, not a blinking beacon');

    /*
     * Walk away and it goes quiet again.
     *
     * After a restart, because `collectAll` above floods the whole map with
     * colour and nothing anywhere is in the graphite any more — walking away
     * from a finished world does not take the colour off anything.
     */
    const left = await game.evaluate((pencil) => {
      const { game } = pencil;
      const stone = game.world.secret;
      game.restart();
      game.teleport(stone.x, stone.y + 1200);
      let winked = 0;
      for (let i = 0; i < 600; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        winked = Math.max(winked, game.secret.glint);
      }
      return { winked, lit: game.secret.lit };
    });

    suite.equal(left.lit, false, 'walk away and it is a drawing again');
    suite.equal(left.winked, 0, 'and it stops dead, like everything out there');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
