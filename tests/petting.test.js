import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The cat by the cottage door is the one thing in the valley you can touch.
 *
 * Everything else here runs from you or sits still to be found; petting is the
 * first interaction that answers back, so what is asserted is the whole shape
 * of it: the prompt only offers itself within reach, the stroke lands, she
 * purrs for a few seconds and then settles — and she never gets up.
 */
export async function run(url) {
  const suite = new Suite('petting');
  const game = await openGame(url);

  try {
    const away = await game.evaluate((pencil) => {
      const { game } = pencil;
      const cat = game.herd.animals.find((a) => a.kind === 'cat');
      return {
        found: !!cat,
        distance: cat ? Math.round(Math.hypot(cat.x - game.walker.x, cat.y - game.walker.y)) : 0,
        prompt: game.interaction,
        petted: game.interact(),
      };
    });

    suite.ok(away.found, 'there is a cat in the world');
    suite.atLeast(away.distance, 200, 'the walker starts nowhere near her');
    suite.equal(away.prompt, null, 'nothing is offered from across the valley');
    suite.ok(!away.petted, 'and nothing happens if you try anyway');

    // Stand next to her.
    const near = await game.evaluate((pencil) => {
      const { game } = pencil;
      const cat = game.herd.animals.find((a) => a.kind === 'cat');
      game.teleport(cat.x + 24, cat.y + 14);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { awake: cat.awake, prompt: game.interaction, purr: cat.purr, pets: game.pets };
    });

    suite.ok(near.awake, 'standing beside her, the colour has reached her');
    suite.equal(near.prompt?.kind, 'pet', 'the prompt offers itself');
    suite.equal(near.prompt?.label, 'pet the cat', 'and says what it is');
    suite.equal(near.purr, 0, 'she is not purring yet');
    suite.equal(near.pets, 0, 'and has not been petted');

    const stroked = await game.evaluate((pencil) => {
      const { game } = pencil;
      const cat = game.herd.animals.find((a) => a.kind === 'cat');
      const before = { x: cat.x, y: cat.y };
      const took = game.interact();
      pencil.renderOnce(); // a purring cat must draw without complaint
      const started = cat.purr;

      // A second of her enjoying it.
      for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const during = { purr: cat.purr, label: game.interaction?.label };
      pencil.renderOnce();

      // And four more, by which time she has settled.
      for (let i = 0; i < 240; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return {
        took,
        pets: game.pets,
        started,
        during,
        after: cat.purr,
        moved: +Math.hypot(cat.x - before.x, cat.y - before.y).toFixed(4),
        state: cat.state,
      };
    });

    suite.ok(stroked.took, 'she can be petted from here');
    suite.equal(stroked.pets, 1, 'the stroke is counted');
    suite.atLeast(stroked.started, 3, 'which sets her purring');
    suite.ok(stroked.during.purr > 0, 'still purring a second later', `${stroked.during.purr}`);
    suite.ok(stroked.during.purr < stroked.started, 'but running down');
    suite.equal(stroked.during.label, 'she is purring', 'and the prompt says so');
    suite.equal(stroked.after, 0, 'five seconds on, she has settled again');
    suite.equal(stroked.moved, 0, 'she never gets up');
    suite.equal(stroked.state, 'graze', 'and never starts wandering');

    // The on-screen prompt is the phone's only way in, so click the real thing.
    await game.page.waitForSelector('#action:not(.hidden)', { timeout: 5000 });

    // A phone should buzz for it. There is no motor in a headless browser, so
    // what is asserted is that the call is made and what it asks for.
    await game.page.evaluate(() => {
      globalThis.buzzes = [];
      navigator.vibrate = (pattern) => {
        globalThis.buzzes.push(pattern);
        return true;
      };
    });

    const before = await game.evaluate((pencil) => ({
      pets: pencil.game.pets,
      x: pencil.game.walker.x,
      y: pencil.game.walker.y,
    }));
    await game.page.click('#action');
    const after = await game.evaluate((pencil) => {
      const cat = pencil.game.herd.animals.find((a) => a.kind === 'cat');
      return { pets: pencil.game.pets, purr: cat.purr, x: pencil.game.walker.x, y: pencil.game.walker.y };
    });

    suite.equal(after.pets, before.pets + 1, 'tapping the prompt pets her too');
    suite.ok(after.purr > 0, 'and she purrs for it');

    const buzzes = await game.page.evaluate(() => globalThis.buzzes);
    suite.equal(buzzes.length, 1, 'the phone buzzes once for the stroke');
    suite.ok(
      Array.isArray(buzzes[0]) && buzzes[0].length > 1,
      'as a pattern of pulses, not one flat buzz',
      JSON.stringify(buzzes[0]),
    );
    suite.ok(
      buzzes[0].reduce((a, b) => a + b, 0) < 800,
      'and it is over quickly',
      `${buzzes[0].reduce((a, b) => a + b, 0)}ms`,
    );
    suite.equal(
      +Math.hypot(after.x - before.x, after.y - before.y).toFixed(1),
      0,
      'tapping the prompt does not walk the player anywhere',
    );

    // Walk away and the offer withdraws.
    const left = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.teleport(1300, 1330);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return game.interaction;
    });
    suite.equal(left, null, 'the prompt goes away when you do');
    await game.page.waitForSelector('#action.hidden', { timeout: 5000 });
    suite.ok(true, 'and so does the button on screen');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
