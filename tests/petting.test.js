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
    // A phone's motor needs tens of milliseconds just to spin up: ask it for
    // less and it answers with silence, which looks exactly like a bug.
    suite.atLeast(
      Math.min(...buzzes[0].filter((_, i) => i % 2 === 0)),
      50,
      'every pulse is long enough for a motor to actually run',
    );
    suite.equal(
      +Math.hypot(after.x - before.x, after.y - before.y).toFixed(1),
      0,
      'tapping the prompt does not walk the player anywhere',
    );

    /*
     * A purring cat lies heavier, not lighter.
     *
     * The whole cat is drawn scaled vertically about the ground line, so a
     * deeper breath does not raise her chest — it raises her ears, and a
     * quicker one on top of that had her bouncing like something on a spring.
     * This measures the top of her against the sky and insists the purr does
     * not move it any more than sleeping does.
     */
    const bob = await game.evaluate((pencil) => {
      const { game, renderer } = pencil;
      const cat = game.herd.animals.find((a) => a.kind === 'cat');
      game.teleport(cat.x + 34, cat.y + 34);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.particles.clear(); // the darkest heart is nearly her colour
      const ctx = renderer.context;

      /*
       * The centroid of her coat, not its top edge.
       *
       * An edge lands on whichever pixel row it rounds to, so half a pixel of
       * real movement reads as either zero or one depending on where the camera
       * happens to sit — a first attempt at this measured a four-pixel bounce as
       * no movement at all. Anti-aliasing means the centre of mass moves
       * smoothly and by fractions, whatever the alignment.
       */
      const centreOfCat = () => {
        pencil.renderOnce();
        const x0 = Math.round((game.camera.toScreenX(cat.x) - 24) * renderer.scale);
        const y0 = Math.round((game.camera.toScreenY(cat.y) - 36) * renderer.scale);
        const w = Math.round(34 * renderer.scale);
        const h = Math.round(34 * renderer.scale);
        const { data } = ctx.getImageData(x0, y0, w, h);
        let mass = 0;
        let weighted = 0;
        for (let row = 0; row < h; row++) {
          for (let col = 0; col < w; col++) {
            const i = (row * w + col) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            // Her coat, told apart from grass and the cottage wall behind her.
            if (r > 150 && g > 90 && g < 175 && b < 125 && r - b > 55) {
              mass++;
              weighted += row;
            }
          }
        }
        return mass ? weighted / mass : NaN;
      };

      const sample = (purr) => {
        const out = [];
        for (let i = 0; i < 40; i++) {
          cat.clock = 10 + i * 0.05;
          cat.purr = purr;
          out.push(centreOfCat());
        }
        return out;
      };

      const asleep = sample(0);
      const purring = sample(3);
      const span = (a) => +(Math.max(...a) - Math.min(...a)).toFixed(2);
      return {
        seen: !asleep.some(Number.isNaN) && !purring.some(Number.isNaN),
        asleep: span(asleep),
        purring: span(purring),
      };
    });

    suite.ok(bob.seen, 'the cat is on screen in every sampled frame');
    suite.ok(bob.asleep < 1, 'a sleeping cat barely stirs', `${bob.asleep}px`);
    suite.ok(
      bob.purring <= bob.asleep + 0.4,
      'and a purring one stirs no more than that',
      `${bob.purring}px purring vs ${bob.asleep}px asleep`,
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
