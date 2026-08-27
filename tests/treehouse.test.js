import { Suite } from './assert.js';
import { openGame } from './harness.js';

const HOUSE = { x: 2180, y: 1712 };

/**
 * The house up the tree, out past the hammock.
 *
 * Going inside does not zoom, move the camera or change the angle — the hut
 * stays exactly where and what it was. The wall stays a wall, too: inside, the
 * same keys walk you along the one room, and the only place you can be seen
 * from the field is the window you happen to be crossing.
 *
 * None of which is visible to a test, so what is asserted is the state behind
 * it: you are in, you move along the room and not out of it, the body on the
 * ground stays at the foot of the ladder, and the way out says the right thing.
 */
export async function run(url) {
  const suite = new Suite('treehouse');
  const game = await openGame(url);

  try {
    const there = await game.evaluate((pencil, at) => {
      const { game } = pencil;
      return {
        far: game.interaction,
        solid: game.world.colliders.filter(
          (c) => c.kind === 'circle' && Math.hypot(c.x - at.x, c.y - at.y) < 30,
        ).length,
        // Far enough out that the walk there is worth something.
        fromHammock: Math.round(Math.hypot(at.x - 1780, at.y - 1700)),
      };
    }, HOUSE);

    suite.equal(there.far, null, 'nothing on offer from across the valley');
    suite.equal(there.solid, 1, 'the trunk is something you cannot walk through');
    suite.ok(there.fromHammock > 300, 'and it is a walk from the hammock', `${there.fromHammock}px`);

    /*
     * Shut until the valley is finished, the same as the pond. Both are things
     * to do once there is nothing left to find; only the hammock is open from
     * the start, because stopping should not have to be earned.
     */
    const early = await game.evaluate((pencil, at) => {
      const { game } = pencil;
      game.teleport(at.x, at.y + 40);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { won: game.won, prompt: game.interaction, climbed: game.interact() };
    }, HOUSE);

    suite.ok(!early.won, 'with the pots still out there');
    suite.equal(early.prompt, null, 'the ladder offers nothing');
    suite.ok(!early.climbed, 'and will not be climbed anyway');

    const below = await game.evaluate((pencil, at) => {
      const { game } = pencil;
      game.collectAll();
      game.teleport(at.x, at.y + 40);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { prompt: game.interaction, leaving: game.leaving };
    }, HOUSE);

    suite.equal(below.prompt?.kind, 'climb', 'once every pot is in, the ladder offers itself');
    suite.equal(below.prompt?.say, 'prompt.climb', 'and says so');
    suite.equal(below.leaving, null, 'with nothing to get out of yet');

    // Up the ladder.
    const inside = await game.evaluate((pencil) => {
      const { game } = pencil;
      const went = game.interact();
      const from = { x: game.walker.x, y: game.walker.y };
      const startedAt = game.treehouse.offset;
      // Push right for a good while: inside, the same keys walk the room.
      for (let i = 0; i < 120; i++) game.advance(1 / 60, { direction: () => ({ x: 1, y: 1 }) });
      const walkedRight = game.treehouse.offset;
      for (let i = 0; i < 600; i++) game.advance(1 / 60, { direction: () => ({ x: 1, y: 0 }) });
      const pinned = game.treehouse.offset;
      pencil.renderOnce(); // somebody seen through a window must draw cleanly
      return {
        went,
        inside: game.treehouse.inside,
        startedAt: +startedAt.toFixed(1),
        walkedRight: +walkedRight.toFixed(1),
        pinned: +pinned.toFixed(1),
        facing: game.treehouse.facing,
        moved: +Math.hypot(game.walker.x - from.x, game.walker.y - from.y).toFixed(2),
        prompt: game.interaction,
        leaving: game.leaving,
      };
    });

    suite.ok(inside.went, 'you can climb it');
    suite.ok(inside.inside, 'and you are up there');
    suite.ok(inside.startedAt < 0, 'you come in at the ladder end', `${inside.startedAt}`);
    suite.ok(
      inside.walkedRight > inside.startedAt,
      'and can walk about the room',
      `${inside.startedAt} to ${inside.walkedRight}`,
    );
    suite.equal(inside.facing, 1, 'facing the way you went');
    suite.ok(inside.pinned < 40, 'but not out through the far wall', `${inside.pinned}`);
    suite.equal(inside.moved, 0, 'and the body on the ground stays at the ladder');
    suite.equal(inside.prompt, null, 'nothing on offer while you are in it');
    suite.equal(inside.leaving, 'prompt.climbDown', 'and the way out says climb down');

    // The button says so too, rather than "pack up".
    await game.page.waitForSelector('#leave:not(.hidden)', { timeout: 5000 });
    const label = await game.page.$eval('#leaveLabel', (el) => el.textContent);
    suite.equal(label, 'climb down', 'which is what the button says');

    // And down again.
    const down = await game.evaluate((pencil) => {
      dispatchEvent(new KeyboardEvent('keydown', { key: 'й', code: 'KeyQ', bubbles: true }));
      const { game } = pencil;
      const from = { x: game.walker.x, y: game.walker.y };
      for (let i = 0; i < 30; i++) game.advance(1 / 60, { direction: () => ({ x: 1, y: 0 }) });
      return {
        inside: game.treehouse.inside,
        moved: +Math.hypot(game.walker.x - from.x, game.walker.y - from.y).toFixed(1),
      };
    });

    suite.ok(!down.inside, 'Q brings you down');
    suite.ok(down.moved > 5, 'and you can walk again', `${down.moved}px`);

    // A new world does not leave you up a tree, and shuts the ladder again.
    const restarted = await game.evaluate((pencil, at) => {
      const { game } = pencil;
      game.teleport(at.x, at.y + 40);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.interact();
      game.restart();
      game.teleport(at.x, at.y + 40);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { inside: game.treehouse.inside, leaving: game.leaving, prompt: game.interaction };
    }, HOUSE);

    suite.ok(!restarted.inside, 'a new world puts you back on the ground');
    suite.equal(restarted.leaving, null, 'with nothing to climb down from');
    suite.equal(restarted.prompt, null, 'and the ladder is shut again until the pots are in');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
