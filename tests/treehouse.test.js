import { Suite } from './assert.js';
import { openGame } from './harness.js';

const HOUSE = { x: 2180, y: 1712 };

/**
 * The house up the tree, out past the hammock.
 *
 * Going inside does not zoom, move the camera or change the angle — the hut
 * stays exactly where and what it was, and instead the near wall goes soft over
 * whoever is behind it and the window lights up. So what there is to assert is
 * the state: you are in, you cannot walk, the field cannot see you, and the way
 * out says the right thing.
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

    const below = await game.evaluate((pencil, at) => {
      const { game } = pencil;
      game.teleport(at.x, at.y + 40);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { prompt: game.interaction, leaving: game.leaving };
    }, HOUSE);

    suite.equal(below.prompt?.kind, 'climb', 'the ladder offers itself');
    suite.equal(below.prompt?.say, 'prompt.climb', 'and says so');
    suite.equal(below.leaving, null, 'with nothing to get out of yet');

    // Up the ladder.
    const inside = await game.evaluate((pencil) => {
      const { game } = pencil;
      const went = game.interact();
      const from = { x: game.walker.x, y: game.walker.y };
      for (let i = 0; i < 90; i++) game.advance(1 / 60, { direction: () => ({ x: -1, y: 1 }) });
      pencil.renderOnce(); // somebody seen through a wall must draw cleanly
      return {
        went,
        inside: game.treehouse.inside,
        shown: +game.treehouse.shown.toFixed(2),
        moved: +Math.hypot(game.walker.x - from.x, game.walker.y - from.y).toFixed(2),
        prompt: game.interaction,
        leaving: game.leaving,
      };
    });

    suite.ok(inside.went, 'you can climb it');
    suite.ok(inside.inside, 'and you are up there');
    suite.atLeast(inside.shown, 0.95, 'the wall has gone soft over you');
    suite.equal(inside.moved, 0, 'you cannot walk out of a treehouse');
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

    // A new world does not leave you up a tree.
    const restarted = await game.evaluate((pencil, at) => {
      const { game } = pencil;
      game.teleport(at.x, at.y + 40);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.interact();
      game.restart();
      return { inside: game.treehouse.inside, leaving: game.leaving };
    }, HOUSE);

    suite.ok(!restarted.inside, 'a new world puts you back on the ground');
    suite.equal(restarted.leaving, null, 'with nothing to climb down from');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
