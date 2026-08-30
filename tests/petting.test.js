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
        touched: game.pet(),
      };
    });

    suite.ok(away.found, 'there is a cat in the world');
    suite.atLeast(away.distance, 200, 'the walker starts nowhere near her');
    suite.equal(away.prompt, null, 'nothing is offered from across the valley');
    suite.ok(!away.petted, 'and nothing happens if you try anyway');
    suite.ok(!away.touched, 'touching her from here does nothing either');

    // Stand next to her.
    const near = await game.evaluate((pencil) => {
      const { game } = pencil;
      const cat = game.herd.animals.find((a) => a.kind === 'cat');
      game.teleport(cat.x + 24, cat.y + 14);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { awake: cat.awake, prompt: game.interaction, purr: cat.purr, pets: game.pets };
    });

    suite.ok(near.awake, 'standing beside her, the colour has reached her');
    suite.equal(
      near.prompt,
      null,
      'and nothing is offered: she answers a touch on herself, not a prompt',
    );
    suite.equal(near.purr, 0, 'she is not purring yet');
    suite.equal(near.pets, 0, 'and has not been petted');

    const stroked = await game.evaluate((pencil) => {
      const { game } = pencil;
      const cat = game.herd.animals.find((a) => a.kind === 'cat');
      const before = { x: cat.x, y: cat.y };
      const took = game.pet();
      pencil.renderOnce(); // a purring cat must draw without complaint
      const started = cat.purr;

      // A second of her enjoying it.
      for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const during = { purr: cat.purr, offer: game.interaction };
      pencil.renderOnce();

      // Three seconds in she is on the second murrr, and still going.
      for (let i = 0; i < 120; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const midway = cat.purr;

      // Six, and she has finished. Between those two the purr must end: any
      // longer and it outstays the stroke, which is what eleven seconds did.
      for (let i = 0; i < 180; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return {
        took,
        pets: game.pets,
        started,
        during,
        midway,
        after: cat.purr,
        moved: +Math.hypot(cat.x - before.x, cat.y - before.y).toFixed(4),
        state: cat.state,
      };
    });

    suite.ok(stroked.took, 'she can be petted from here');
    const purrs = await game.evaluate((pencil) => pencil.purrsPlayed());
    suite.equal(purrs, 1, 'and petting her does play a purr');
    suite.equal(stroked.pets, 1, 'the stroke is counted');
    suite.ok(
      stroked.started >= 4 && stroked.started <= 6,
      'which sets her purring, for three murrrs and no more',
      `${stroked.started}s`,
    );
    suite.ok(stroked.during.purr > 0, 'still purring a second later', `${stroked.during.purr}`);
    suite.ok(stroked.during.purr < stroked.started, 'but running down');
    suite.equal(stroked.during.offer, null, 'and still nothing is offered while she purrs');
    suite.ok(stroked.midway > 0, 'three seconds in she is still going', `${stroked.midway}`);
    suite.equal(stroked.after, 0, 'six seconds on, she has settled again');
    suite.equal(stroked.moved, 0, 'she never gets up');
    suite.equal(stroked.state, 'graze', 'and never starts wandering');

    /*
     * A purr is *murrr … murrr … murrr*, not one long note.
     *
     * Three swells of a couple of seconds, a rest between them, each rising and
     * falling without a corner anywhere in it. The sound and the cat are both
     * driven from this one curve, so pinning the curve pins both.
     */
    const shape = await game.evaluate((pencil) => {
      const step = 0.01;
      const samples = [];
      for (let age = 0; age <= 14; age += step) samples.push(pencil.purrStrength(age));

      const peaks = [];
      let biggestJump = 0;
      for (let i = 1; i < samples.length; i++) {
        biggestJump = Math.max(biggestJump, Math.abs(samples[i] - samples[i - 1]));
        if (samples[i] > 0.98 && samples[i] >= samples[i - 1] && samples[i] > (samples[i + 1] ?? 0)) {
          peaks.push(+(i * step).toFixed(2));
        }
      }
      const at = (age) => +pencil.purrStrength(age).toFixed(3);
      return {
        peaks,
        biggestJump: +biggestJump.toFixed(4),
        gaps: [at(1.575), at(3.375)],
        start: at(0),
        ended: at(5.2),
      };
    });

    suite.equal(shape.peaks.length, 3, 'three murrrs', shape.peaks.join(', '));
    suite.ok(
      // 1.35s of murrr and 0.45s of quiet: 1.8s peak to peak.
      shape.peaks.every((t, i) => Math.abs(t - (0.675 + i * 1.8)) < 0.15),
      'evenly spaced, murrr then rest then murrr',
      shape.peaks.join(', '),
    );
    suite.equal(shape.start, 0, 'each one starts from nothing');
    suite.equal(shape.gaps[0], 0, 'she is quiet between the first and second');
    suite.equal(shape.gaps[1], 0, 'and between the second and third');
    suite.equal(shape.ended, 0, 'and finished after the third');
    // A raised cosine over three seconds cannot move faster than this. A ramp
    // with a corner in it, or a step, would show up here as a jump.
    suite.ok(
      shape.biggestJump < 0.03,
      'and it goes up and down smoothly, with no edges',
      `largest step ${shape.biggestJump}`,
    );

    /*
     * What she actually sounds like — which is now a recording, not a graph.
     *
     * There was a page of assertions here that rendered the synthesised purr
     * offline and measured its swells, its harmonics and its edges. All of it
     * is gone with the synthesis, and none of it was wrong: the graph did
     * exactly what it was measured to do, and it still did not sound like a
     * cat. What is left to check is that the file arrives, and that it arrives
     * only when somebody has actually touched her.
     */
    await game.page.waitForFunction(
      () => performance.getEntriesByType('resource').some((e) => e.name.includes('purr')),
      null,
      { timeout: 15000 },
    );
    const fetched = await game.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((e) => e.name.includes('purr'))
        .map((e) => Math.round(e.startTime)),
    );
    suite.equal(fetched.length, 1, 'the purr is fetched once');
    suite.ok(fetched[0] > 0, 'and only once she was stroked, not at load', `${fetched[0]}ms in`);

    const sound = await game.evaluate(async () => {
      const audio = [...document.querySelectorAll('audio')].find((a) =>
        a.src.includes('purr'),
      );
      if (!audio) return { found: false };
      const response = await fetch(audio.src);
      const bytes = (await response.arrayBuffer()).byteLength;
      return {
        found: true,
        ok: response.ok,
        type: response.headers.get('content-type'),
        bytes,
        loops: audio.loop,
      };
    });

    suite.ok(sound.found, 'stroking her asks for it');
    suite.ok(sound.ok, 'and it is there', String(sound.type));
    suite.ok(
      !sound.loops,
      'one phrase per stroke — nothing loops, so nothing can click at a seam',
    );
    suite.ok(
      sound.bytes > 10000 && sound.bytes < 200000,
      'at a size worth downloading for a cat',
      `${Math.round(sound.bytes / 1024)}KB`,
    );

    /*
     * The way in is a touch on her, on the canvas — the same gesture that
     * wakes the owl — so click the real thing, at her screen position.
     */
    const touchable = await game.evaluate((pencil) => {
      const { game } = pencil;
      const cat = game.herd.animals.find((a) => a.kind === 'cat');
      game.teleport(cat.x + 24, cat.y + 14);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      pencil.renderOnce();
      return {
        x: game.camera.toScreenX(cat.x),
        y: game.camera.toScreenY(cat.y) - 10 * cat.scale * game.camera.zoom,
      };
    });

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
    await game.page.mouse.click(touchable.x, touchable.y);
    const after = await game.evaluate((pencil) => {
      const cat = pencil.game.herd.animals.find((a) => a.kind === 'cat');
      return { pets: pencil.game.pets, purr: cat.purr, x: pencil.game.walker.x, y: pencil.game.walker.y };
    });

    suite.equal(after.pets, before.pets + 1, 'touching her on the canvas pets her');
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
      'touching her does not walk the player anywhere',
    );

    /*
     * The same touch from across the meadow does nothing at all — the owl's
     * rule: a touch means being there.
     */
    const distant = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.teleport(1300, 1330);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      pencil.renderOnce();
      const cat = game.herd.animals.find((a) => a.kind === 'cat');
      return {
        x: game.camera.toScreenX(cat.x),
        y: game.camera.toScreenY(cat.y) - 10 * cat.scale * game.camera.zoom,
        pets: game.pets,
        purr: cat.purr,
      };
    });
    await game.page.mouse.click(distant.x, distant.y);
    const noStroke = await game.evaluate((pencil) => {
      const cat = pencil.game.herd.animals.find((a) => a.kind === 'cat');
      return { pets: pencil.game.pets, purr: cat.purr };
    });
    suite.equal(noStroke.pets, distant.pets, 'clicked from far off, nothing happens');
    suite.equal(noStroke.purr, 0, 'and she does not so much as stir');

    /*
     * The E key, on a keyboard that does not have an E where E goes.
     *
     * `e.key` is the character the layout produces, so on a Cyrillic keyboard
     * the key under your finger reports `у` — the game listens for the
     * physical key, not the letter. It just no longer reaches the cat: she
     * answers a touch on herself, not a key, and E beside her does nothing.
     */
    const layout = await game.evaluate((pencil) => {
      const cat = pencil.game.herd.animals.find((a) => a.kind === 'cat');
      pencil.game.teleport(cat.x + 24, cat.y + 14);
      pencil.game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const before = pencil.game.pets;
      for (const [key, code] of [['у', 'KeyE'], ['ц', 'KeyW'], ['ф', 'KeyA']]) {
        dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
        dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
      }
      return { petted: pencil.game.pets - before };
    });

    suite.equal(layout.petted, 0, 'the E key does not pet her any more, on any layout');

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
      // 4.28 left of 4.95 is 0.675s in: the peak of the first murrr, where she
      // is purring hardest and would bounce hardest if anything did.
      const purring = sample(4.28);
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

    /*
     * A purr is a phrase, not a loop.
     *
     * It used to follow the walker, faded through the browser's volume
     * controls — which stepped audibly, a fizz of clicks whenever the level
     * moved — and it looped, which clicked at the seam in every codec it was
     * tried as. Now the recording swells and settles itself, plays once per
     * stroke, and finishes wherever you have walked to by then; only she
     * herself settles, out of earshot.
     */
    await game.evaluate((pencil) => {
      const { game } = pencil;
      const cat = game.herd.animals.find((a) => a.kind === 'cat');
      game.teleport(cat.x + 24, cat.y + 14);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.pet();
    });
    const started = await game.page.waitForFunction(
      () => [...document.querySelectorAll('audio')].some((a) => a.src.includes('purr') && !a.paused),
      null,
      { timeout: 1000 },
    ).then(() => true).catch(() => false);
    const carried = await game.evaluate((pencil) => {
      const { game } = pencil;
      const cat = game.herd.animals.find((a) => a.kind === 'cat');
      game.teleport(cat.x + 400, cat.y);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return {
        stillPlaying: [...document.querySelectorAll('audio')].some(
          (a) => a.src.includes('purr') && !a.paused,
        ),
        settled: cat.purr,
      };
    });

    suite.ok(started, 'stroking her starts the phrase');
    suite.ok(carried.stillPlaying, 'and walking off does not cut it short');
    suite.equal(carried.settled, 0, 'though she herself settles once you are gone');

    // Walk away and the offer withdraws.
    const left = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.teleport(1300, 1330);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return game.interaction;
    });
    suite.equal(left, null, 'the prompt goes away when you do');
    // `state: 'hidden'` rather than matching `.hidden` and waiting for it to be
    // visible, which is a contradiction that only ever passed because the class
    // delays its visibility transition by 200ms and Playwright caught the fade.
    await game.page.waitForSelector('#action', { state: 'hidden', timeout: 5000 });
    suite.ok(true, 'and so does the button on screen');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
