import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The owl, up a tree in the north.
 *
 * It does exactly one thing and this is all about that one thing: it watches
 * you. Everything else in the valley either ignores the walker or runs from
 * them, so the head coming round to follow you is the whole character of it,
 * and a test that only checked it existed would be checking nothing.
 */
export async function run(url) {
  const suite = new Suite('owl');
  const game = await openGame(url);

  try {
    const there = await game.evaluate((pencil) => {
      const { game } = pencil;
      const owl = game.owl;
      // The trunk it is sitting in: a round collider below it and about level.
      const trunk = game.world.colliders.filter(
        (c) => c.kind === 'circle' && Math.abs(c.x - owl.x) < 45 && c.y > owl.y + 20,
      ).length;
      return {
        x: Math.round(owl.x),
        y: Math.round(owl.y),
        scale: +owl.scale.toFixed(2),
        height: game.world.height,
        trunk,
      };
    });

    suite.ok(there.trunk > 0, 'it is up a tree, not standing in a field');
    suite.ok(there.y < there.height * 0.5, 'in the northern half', `y ${there.y}`);
    suite.ok(there.scale >= 0.95, 'big enough to have a face', `${there.scale}`);

    // From across the valley it is a drawing, and drawings hold still.
    const far = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.teleport(game.owl.x + 900, game.owl.y + 600);
      for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const clock = game.owl.clock;
      for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      pencil.renderOnce(); // an owl in graphite must draw cleanly too
      return { awake: game.owl.awake, ran: +(game.owl.clock - clock).toFixed(3) };
    });

    suite.ok(!far.awake, 'from across the valley it is asleep');
    suite.equal(far.ran, 0, 'and its clock does not advance');

    /*
     * The head turn. Stand to one side and then the other: it should end up
     * looking at you both times, which is a different assertion from it merely
     * moving — a head that swung about on its own would pass that.
     */
    const watched = await game.evaluate((pencil) => {
      const { game } = pencil;
      const owl = game.owl;
      const settle = (dx) => {
        game.teleport(owl.x + dx, owl.y + 120);
        for (let i = 0; i < 180; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        return { look: +owl.look.toFixed(2), awake: owl.awake };
      };
      const right = settle(90);
      const left = settle(-90);
      const rightAgain = settle(90);
      return { right, left, rightAgain };
    });

    suite.ok(watched.right.awake, 'up close the colour reaches it');
    suite.ok(watched.right.look > 0.7, 'stand to its right and it looks right', `${watched.right.look}`);
    suite.ok(watched.left.look < -0.7, 'stand to its left and it looks left', `${watched.left.look}`);
    suite.ok(
      watched.rightAgain.look > 0.7,
      'and it follows you back again',
      `${watched.rightAgain.look}`,
    );

    // Far enough off and it stops paying attention, rather than staring across
    // the whole valley.
    const ignored = await game.evaluate((pencil) => {
      const { game } = pencil;
      const owl = game.owl;
      // Awake — the colour is flooded — but well outside its notice.
      game.collectAll();
      game.teleport(owl.x + 420, owl.y + 60);
      for (let i = 0; i < 240; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const first = owl.look;
      let moved = 0;
      for (let i = 0; i < 1800; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        moved = Math.max(moved, Math.abs(owl.look - first));
      }
      return { awake: owl.awake, moved: +moved.toFixed(2) };
    });

    suite.ok(ignored.awake, 'with every pot found it is awake wherever you are');
    suite.ok(
      ignored.moved > 0.5,
      'but out of range it looks about on its own',
      `${ignored.moved}`,
    );

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
