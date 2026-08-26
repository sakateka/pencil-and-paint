import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * Finding pots widens the colour; finding all of them ends the game without
 * taking it away from you.
 */
export async function run(url) {
  const suite = new Suite('progression');
  const game = await openGame(url);

  try {
    const placement = await game.evaluate((pencil) => {
      const { game } = pencil;
      const gaps = [];
      for (let i = 0; i < game.pots.length; i++) {
        for (let j = i + 1; j < game.pots.length; j++) {
          gaps.push(Math.hypot(game.pots[i].x - game.pots[j].x, game.pots[i].y - game.pots[j].y));
        }
      }
      const clear = game.pots.every((p) =>
        game.world.colliders.every((c) =>
          c.kind === 'circle' ? Math.hypot(p.x - c.x, p.y - c.y) > c.r : true,
        ),
      );
      return {
        count: game.pots.length,
        closest: Math.round(Math.min(...gaps)),
        clear,
        xs: game.pots.map((p) => Math.round(p.x)),
      };
    });

    suite.equal(placement.count, 14, 'fourteen pots placed');
    suite.atLeast(placement.closest, 100, 'pots are spread out, not clumped');
    suite.ok(placement.clear, 'no pot is inside solid scenery');

    // Collect them one at a time and watch the colour grow.
    const run = await game.evaluate((pencil) => {
      const { game } = pencil;
      const reach = [game.litRadius];
      for (let i = 0; i < 14; i++) {
        const next = game.pots.find((p) => !p.found);
        if (!next) break;
        game.walker.x = next.x;
        game.walker.y = next.y + 6;
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        reach.push(game.litRadius);
      }
      return {
        found: game.found,
        won: game.won,
        grew: reach[reach.length - 1] - reach[0],
      };
    });

    suite.equal(run.found, 14, 'all fourteen can be collected');
    suite.ok(run.won, 'collecting them all ends the game');
    suite.atLeast(run.grew, 14 * 20 - 30, 'the colour reaches further for each one');

    // The ending must not take control away: you can still walk.
    const after = await game.evaluate((pencil) => {
      const { game } = pencil;
      const before = { x: game.walker.x, y: game.walker.y };
      for (let i = 0; i < 90; i++) game.advance(1 / 60, { direction: () => ({ x: -1, y: 0 }) });
      return {
        moved: Math.round(Math.hypot(game.walker.x - before.x, game.walker.y - before.y)),
        floodedRadius: Math.round(game.maskRadius),
      };
    });

    suite.atLeast(after.moved, 50, 'still walkable after winning');
    suite.atLeast(after.floodedRadius, 1000, 'the colour floods the whole page');

    // No blocking overlay: the finish is a note in the corner.
    //
    // The title card's `visibility` transition is delayed on purpose so it stays
    // visible while it fades, so wait for that to land rather than racing it.
    const settled = await game.page
      .waitForFunction(
        () => getComputedStyle(document.getElementById('intro')).visibility === 'hidden',
        null,
        { timeout: 3000 },
      )
      .then(() => true)
      .catch(() => false);
    const overlay = await game.page.evaluate(() => {
      const intro = getComputedStyle(document.getElementById('intro'));
      return { introVisibility: intro.visibility, introBackdrop: intro.backdropFilter };
    });
    suite.ok(settled, 'the title card finishes fading out');
    suite.equal(overlay.introVisibility, 'hidden', 'the title card leaves the paint path');
    suite.equal(overlay.introBackdrop, 'none', 'no full-screen backdrop-filter over the canvas');

    // Restarting reshuffles the pots.
    const restarted = await game.evaluate((pencil, previous) => {
      pencil.game.restart();
      return {
        xs: pencil.game.pots.map((p) => Math.round(p.x)),
        found: pencil.game.found,
        won: pencil.game.won,
        same: pencil.game.pots.map((p) => Math.round(p.x)).join() === previous.join(),
      };
    }, placement.xs);

    suite.equal(restarted.found, 0, 'restart resets the count');
    suite.ok(!restarted.won, 'restart clears the ending');
    suite.ok(!restarted.same, 'restart scatters the pots somewhere new');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
