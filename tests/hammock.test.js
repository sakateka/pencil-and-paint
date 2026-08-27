import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The hammock, and the one thing in the valley that is not a reward.
 *
 * You can lie in it from the first minute — the point of a hammock is that you
 * have stopped, and making that something to earn would be a joke at its own
 * expense. What the pots gate is the birds: an unfinished valley is a drawing,
 * and drawings are silent.
 */
export async function run(url) {
  const suite = new Suite('hammock');
  const game = await openGame(url);

  try {
    const where = await game.evaluate((pencil) => {
      const { game } = pencil;
      return {
        far: game.interaction,
        won: game.won,
        // Two trees and the cloth are baked into the world, so the only trace
        // in the simulation is what you cannot walk through.
        anchors: game.world.colliders.filter(
          (c) => c.kind === 'circle' && Math.hypot(c.x - 1780, c.y - 1700) < 120,
        ).length,
        easel: game.world.colliders.filter(
          (c) => c.kind === 'circle' && Math.hypot(c.x - 1902, c.y - 1782) < 20,
        ).length,
      };
    });

    suite.equal(where.far, null, 'nothing on offer out in the field');
    suite.ok(!where.won, 'and the valley is unfinished');
    suite.atLeast(where.anchors, 2, 'the hammock is slung between two solid things');
    suite.equal(where.easel, 1, 'and somebody left an easel standing beside it');

    // Walk up to it with the pots still scattered.
    const offered = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.teleport(1780, 1760);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { prompt: game.interaction, won: game.won };
    });

    suite.equal(offered.prompt?.kind, 'rest', 'the hammock offers itself straight away');
    suite.equal(offered.prompt?.say, 'prompt.rest', 'and says so');
    suite.ok(!offered.won, 'with the pots still out there');

    /*
     * Lie down unfinished: no birds, and none arrive however long you wait.
     */
    const quiet = await game.evaluate((pencil) => {
      const { game } = pencil;
      const lay = game.interact();
      for (let i = 0; i < 60 * 20; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      pencil.renderOnce(); // an occupied hammock must draw without complaint
      return {
        lay,
        resting: game.rest.resting,
        birds: game.rest.birds,
        present: game.rest.present.length,
        settled: +game.rest.settled.toFixed(2),
        prompt: game.interaction?.say,
      };
    });

    suite.ok(quiet.lay, 'you can get into it');
    suite.ok(quiet.resting, 'and stay there');
    suite.atLeast(quiet.settled, 0.95, 'the cloth takes your weight');
    suite.ok(!quiet.birds, 'but the birds do not come to an unfinished valley');
    suite.equal(quiet.present, 0, 'not one of them, after twenty seconds');
    suite.equal(quiet.prompt, undefined, 'with nothing on offer but lying there');

    // Nor can you wander off while lying in it.
    const rooted = await game.evaluate((pencil) => {
      const { game } = pencil;
      const from = { x: game.walker.x, y: game.walker.y };
      for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: -1, y: 1 }) });
      return {
        moved: +Math.hypot(game.walker.x - from.x, game.walker.y - from.y).toFixed(2),
        resting: game.rest.resting,
      };
    });
    suite.equal(rooted.moved, 0, 'you do not drift out of a hammock');
    suite.ok(rooted.resting, 'nor get shoved out of one');

    // The way out is the same one the riverbank uses.
    await game.page.waitForSelector('#leave:not(.hidden)', { timeout: 5000 });
    const up = await game.evaluate((pencil) => {
      dispatchEvent(new KeyboardEvent('keydown', { key: 'й', code: 'KeyQ', bubbles: true }));
      const { game } = pencil;
      const from = { x: game.walker.x, y: game.walker.y };
      for (let i = 0; i < 30; i++) game.advance(1 / 60, { direction: () => ({ x: 1, y: 0 }) });
      return {
        resting: game.rest.resting,
        moved: +Math.hypot(game.walker.x - from.x, game.walker.y - from.y).toFixed(1),
      };
    });
    suite.ok(!up.resting, 'Q gets you out');
    suite.ok(up.moved > 5, 'and you can walk again', `${up.moved}px`);

    /*
     * Finish the valley, and lie down again. Now they come — but not at once:
     * they arrive one at a time, which is what birds do when you settle.
     */
    const withBirds = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.collectAll();
      game.teleport(1780, 1760);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.interact();
      const step = (seconds) => {
        for (let i = 0; i < 60 * seconds; i++) {
          game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        }
        return game.rest.present.length;
      };
      const atOnce = game.rest.present.length;
      const early = step(2);
      const later = step(6);
      pencil.renderOnce(); // birds must draw without complaint too
      return { birds: game.rest.birds, atOnce, early, later, won: game.won };
    });

    suite.ok(withBirds.won, 'every pot found');
    suite.ok(withBirds.birds, 'and now the birds are out');
    suite.equal(withBirds.atOnce, 0, 'though none the instant you lie down');
    suite.ok(withBirds.early > 0, 'one or two after a moment', `${withBirds.early}`);
    suite.ok(
      withBirds.later > withBirds.early,
      'and more as you stay still',
      `${withBirds.early} then ${withBirds.later}`,
    );

    /*
     * The sound is a real recording, so unlike everything else here it is a
     * file that has to arrive. Check it is served, is the size it should be,
     * and is not on the critical path.
     */
    /*
     * Wait for the request itself, not for the element that makes it.
     *
     * The element exists the instant somebody lies down; the resource timing
     * entry appears when the network is done with it. Waiting on the first and
     * then reading the second is a race, and it lost about one run in three.
     */
    await game.page.waitForFunction(
      () => performance.getEntriesByType('resource').some((e) => e.name.includes('birdsong')),
      null,
      { timeout: 15000 },
    );
    // Read before fetching anything here: the check below is itself a request,
    // and would otherwise be counted as a second download of the recording.
    const lazy = await game.evaluate(
      () =>
        performance
          .getEntriesByType('resource')
          .filter((e) => e.name.includes('birdsong'))
          .map((e) => Math.round(e.startTime)),
    );
    suite.equal(lazy.length, 1, 'fetched once, not on every lie-down');
    suite.ok(lazy[0] > 0, 'and only when it was wanted, not at load', `${lazy[0]}ms in`);

    const audio = await game.evaluate(async () => {
      const src = [...document.querySelectorAll('audio')].map((a) => a.src);
      const url = src[0];
      if (!url) return { found: false };
      const response = await fetch(url);
      const bytes = (await response.arrayBuffer()).byteLength;
      return { found: true, ok: response.ok, type: response.headers.get('content-type'), bytes };
    });

    suite.ok(audio.found, 'lying down asks for the birdsong');
    suite.ok(audio.ok, 'and it is there', String(audio.type));
    suite.ok(
      audio.bytes > 20000 && audio.bytes < 400000,
      'at a size worth downloading for a hammock',
      `${Math.round(audio.bytes / 1024)}KB`,
    );

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
