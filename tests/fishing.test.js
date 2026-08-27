import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * Fishing at the pond: the one thing here you have to earn.
 *
 * It opens only once the last pot is found, so the first thing asserted is that
 * it stays shut until then — an ending you can reach at the start is not an
 * ending. After that it is a quiet loop: cast, wait, answer the bite or don't,
 * cast again. And the camp belongs to you rather than to the valley, so it
 * follows you in the only way it can — by packing itself up when you go.
 */
export async function run(url) {
  const suite = new Suite('fishing');
  const game = await openGame(url);

  try {
    // Stand at the water's edge with the valley still unfinished.
    const early = await game.evaluate((pencil) => {
      const { game } = pencil;
      const pond = game.world.pond;
      game.teleport(pond.x, pond.y + pond.ry + 22);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { won: game.won, prompt: game.interaction, cast: game.interact() };
    });

    suite.ok(!early.won, 'the valley is not finished yet');
    suite.equal(early.prompt, null, 'so the pond offers nothing');
    suite.ok(!early.cast, 'and there is no fishing to be had');

    // Finish it, and come back.
    const offered = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.collectAll();
      const pond = game.world.pond;
      game.teleport(pond.x, pond.y + pond.ry + 22);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { won: game.won, prompt: game.interaction };
    });

    suite.ok(offered.won, 'every pot found');
    suite.equal(offered.prompt?.kind, 'fish', 'now the pond offers something');
    suite.equal(offered.prompt?.say, 'prompt.fish', 'and says what');

    // Away from the water it is still nothing, won or not.
    const inland = await game.evaluate((pencil) => {
      pencil.game.teleport(1900, 1500);
      pencil.game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return pencil.game.interaction;
    });
    suite.equal(inland, null, 'and only at the water, not anywhere in the valley');

    /*
     * Pitch camp by pressing the button, not by calling into the game.
     *
     * This matters more than it looks. `game.interact()` skips the dispatch in
     * main.ts that decides which sounds to play, and that dispatch is where the
     * bug lived that purred a cat every time you cast a line. A test that calls
     * the game directly cannot see it at all.
     */
    await game.evaluate((pencil) => {
      const pond = pencil.game.world.pond;
      pencil.game.teleport(pond.x, pond.y + pond.ry + 22);
    });
    await game.page.waitForSelector('#action:not(.hidden)', { timeout: 5000 });
    await game.page.click('#action');

    const camp = await game.evaluate((pencil) => {
      const { game } = pencil;
      const pond = game.world.pond;
      const started = game.fishing.active;
      const f = game.fishing;
      const inside = (e, x, y, pad) =>
        ((x - e.x) / (e.rx + pad)) ** 2 + ((y - e.y) / (e.ry + pad)) ** 2 < 1;
      // The blue part, not the pond's own ellipse, which is the reedy bank.
      const water = { x: pond.x + 6, y: pond.y + 4, rx: pond.rx * 0.74, ry: pond.ry * 0.7 };
      return {
        started,
        phase: f.phase,
        say: game.interaction?.say,
        floatOnWater: inside(water, f.floatX, f.floatY, -6),
        tentOnLand: !inside(pond, f.tentX, f.tentY, 0),
        fireOnLand: !inside(pond, f.fireX, f.fireY, 0),
        tentClear: Math.round(Math.hypot(f.tentX - game.walker.x, f.tentY - game.walker.y)),
      };
    });

    suite.ok(camp.started, 'camp is pitched');
    suite.equal(camp.phase, 'waiting', 'and the line goes straight out');
    suite.equal(camp.say, 'prompt.wait', 'the prompt says to wait');
    suite.ok(camp.floatOnWater, 'the float lands on the blue water, not in the reeds');
    suite.ok(camp.tentOnLand, 'the tent is pitched on dry ground');
    suite.ok(camp.fireOnLand, 'and so is the fire');
    suite.ok(camp.tentClear > 20 && camp.tentClear < 90, 'the tent is beside you, not on you',
      `${camp.tentClear}px`);

    /*
     * Fishing must not set the cat purring.
     *
     * The E key means "do whatever is here", and the sound used to be played by
     * whatever asked — so casting a line at the pond purred a cat that was two
     * hundred metres away by the cottage. Nothing but a count of the sound
     * catches this: every other bit of state looks perfectly correct.
     */
    const quiet = await game.evaluate((pencil) => {
      const cat = pencil.game.herd.animals.find((a) => a.kind === 'cat');
      return { purrs: pencil.purrsPlayed(), catPurr: cat.purr };
    });
    suite.equal(quiet.purrs, 0, 'pitching camp and casting purrs no cats');
    suite.equal(quiet.catPurr, 0, 'and leaves the one by the cottage asleep');

    /*
     * Sitting by water should sound like it, for as long as you sit there —
     * so this one is half a minute of real shoreline rather than a few seconds
     * on a loop, which announces itself the second time round.
     */
    /*
     * Wait for the metadata, not just the request: `duration` is NaN until the
     * browser has read the header, and reading it any earlier is a race that
     * loses about one run in three.
     */
    await game.page.waitForFunction(
      () =>
        [...document.querySelectorAll('audio')].some(
          (a) => a.src.includes('pond') && a.readyState >= 1,
        ),
      null,
      { timeout: 15000 },
    );
    const water = await game.evaluate(async () => {
      const audio = [...document.querySelectorAll('audio')].find((a) => a.src.includes('pond'));
      if (!audio) return { found: false };
      const response = await fetch(audio.src);
      // Decode it and check it does not surge: a pond that swells and crashes
      // is a beach, which is what the first attempt at this turned out to be.
      const bytes = await response.arrayBuffer();
      const offline = new OfflineAudioContext(1, 8000 * 4, 8000);
      const decoded = await offline.decodeAudioData(bytes.slice(0));
      const pcm = decoded.getChannelData(0);
      const rate = decoded.sampleRate;
      const levels = [];
      for (let s = 0; s + rate * 2 < pcm.length; s += rate * 2) {
        let sum = 0;
        for (let i = 0; i < rate * 2; i++) sum += pcm[s + i] ** 2;
        levels.push(Math.sqrt(sum / (rate * 2)));
      }
      return {
        found: true,
        ok: response.ok,
        bytes: bytes.byteLength,
        seconds: decoded.duration,
        loops: audio.loop,
        steadiness: +(Math.max(...levels) / Math.min(...levels)).toFixed(2),
      };
    });

    suite.ok(water.found, 'casting a line starts the water');
    suite.ok(water.ok, 'and the recording is there');
    suite.ok(water.loops, 'looping, so a long sit does not run out');
    /*
     * Steady rather than long. The birdsong has to run for a while because a
     * repeated call gives the loop away; running water has no landmark in it,
     * so what matters here is that it holds one level and never surges.
     */
    suite.atLeast(Math.round(water.seconds), 12, 'long enough to settle into');
    suite.ok(water.steadiness < 1.6, 'and calm — no waves breaking', `${water.steadiness}x`);

    // Striking before the bite is not punished.
    const early2 = await game.evaluate((pencil) => {
      const before = pencil.game.fishing.phase;
      const landed = pencil.game.interact();
      return { landed, before, after: pencil.game.fishing.phase };
    });
    suite.ok(!early2.landed, 'striking early lands nothing');
    suite.equal(early2.after, 'waiting', 'but costs nothing either');

    // Wait for the bite, and answer it.
    const landed = await game.evaluate((pencil) => {
      const { game } = pencil;
      // Up to twenty seconds of waiting: the bite comes between five and fifteen.
      let sawBite = false;
      for (let i = 0; i < 20 * 60 && !sawBite; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        if (game.fishing.phase === 'bite') sawBite = true;
      }
      return { sawBite, say: game.interaction?.say };
    });
    // Again through the button: landing a fish must not purr a cat either.
    await game.page.click('#action');
    const after = await game.evaluate((pencil) => {
      pencil.renderOnce(); // the camp and a leaping fish must draw without complaint
      return { caught: pencil.game.fishing.caught, phase: pencil.game.fishing.phase };
    });

    suite.ok(landed.sawBite, 'a bite comes if you wait');
    suite.equal(landed.say, 'prompt.now', 'and the prompt says so');
    suite.equal(after.caught, 1, 'answering it lands a fish, and it is counted');
    suite.equal(after.phase, 'caught', 'and shown for a moment');

    const stillQuiet = await game.evaluate((pencil) => pencil.purrsPlayed());
    suite.equal(stillQuiet, 0, 'and landing one purrs no cats either');

    /*
     * The fish comes out of the water *after* the rod comes up, not with it.
     *
     * Sampled off the real canvas, in a box above the walker's head, looking
     * for the fish's own pale blue. Camp is pitched on the north bank for this,
     * so what is behind that box is grass rather than pond — the water is very
     * nearly the same colour as the fish, and a detector cannot tell them apart.
     */
    const sequence = await game.evaluate((pencil) => {
      const { game, renderer } = pencil;
      const pond = game.world.pond;
      game.cancel();
      game.teleport(pond.x, pond.y - pond.ry - 26);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.interact();
      for (let i = 0; i < 20 * 60; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        if (game.fishing.phase === 'bite') break;
      }
      game.interact();
      // Pin the kind: the pond holds seven things in seven colours, and a
      // detector has to know which one it is looking for. A roach is pale
      // silver, which nothing else on a green bank comes close to.
      game.fishing.hooked = 'roach';
      game.particles.clear(); // the splash is nearly the fish's colour

      const ctx = renderer.context;
      const fishPixels = () => {
        pencil.renderOnce();
        const x0 = Math.round((game.camera.toScreenX(game.walker.x) - 34) * renderer.scale);
        const y0 = Math.round((game.camera.toScreenY(game.walker.y) - 96) * renderer.scale);
        const w = Math.round(68 * renderer.scale);
        const h = Math.round(60 * renderer.scale);
        const { data } = ctx.getImageData(x0, y0, w, h);
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (r > 170 && r < 226 && g > 185 && g < 236 && b > 195 && b < 246 && b > g && g > r) n++;
        }
        return n;
      };

      // Wind the catch forward and look at each stage.
      const at = (want) => {
        while (game.fishing.catchProgress < want && game.fishing.phase === 'caught') {
          game.advance(1 / 240, { direction: () => ({ x: 0, y: 0 }) });
        }
        return fishPixels();
      };
      return { start: at(0.02), pulling: at(0.25), leaping: at(0.6), phase: game.fishing.phase };
    });

    suite.equal(sequence.phase, 'caught', 'still landing it while we look');
    suite.equal(sequence.start, 0, 'no fish at the instant it is hooked');
    suite.equal(sequence.pulling, 0, 'none while the rod is still coming up');
    suite.atLeast(sequence.leaping, 30, 'and there it is, once the rod is up');

    // It goes back out on its own.
    const again = await game.evaluate((pencil) => {
      const { game } = pencil;
      for (let i = 0; i < 200; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return game.fishing.phase;
    });
    suite.equal(again, 'waiting', 'then the line goes back out by itself');

    // Miss one.
    const missed = await game.evaluate((pencil) => {
      const { game } = pencil;
      const before = game.fishing.caught;
      for (let i = 0; i < 20 * 60; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        if (game.fishing.phase === 'bite') break;
      }
      // Say nothing and let it go.
      for (let i = 0; i < 130; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return {
        phase: game.fishing.phase,
        say: game.interaction?.say,
        caught: game.fishing.caught,
        before,
      };
    });

    suite.equal(missed.phase, 'missed', 'ignore a bite and it gets away');
    suite.equal(missed.say, 'prompt.gotAway', 'and it says so');
    suite.equal(missed.caught, missed.before, 'with nothing added to the tally');

    /*
     * You are sitting down, so you do not walk.
     *
     * Pushed hard in every direction for a second: the walker must not have
     * shifted, and must not still be drifting when the input stops.
     */
    const rooted = await game.evaluate((pencil) => {
      const { game } = pencil;
      const from = { x: game.walker.x, y: game.walker.y };
      for (let i = 0; i < 60; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 1, y: -1 }) });
      }
      return {
        fishing: game.fishing.active,
        moved: +Math.hypot(game.walker.x - from.x, game.walker.y - from.y).toFixed(2),
        speed: +Math.hypot(game.walker.vx, game.walker.vy).toFixed(2),
      };
    });

    suite.ok(rooted.fishing, 'still fishing after a second of shoving');
    suite.equal(rooted.moved, 0, 'and the walker has not moved an inch');
    suite.equal(rooted.speed, 0, 'nor is drifting');

    /*
     * Q is the way out — and on a phone, the button beside the prompt is, since
     * there is no Q there and no walking away either.
     */
    await game.page.waitForSelector('#leave:not(.hidden)', { timeout: 5000 });
    const walkedAgain = await game.evaluate((pencil) => {
      dispatchEvent(new KeyboardEvent('keydown', { key: 'й', code: 'KeyQ', bubbles: true }));
      const { game } = pencil;
      const from = { x: game.walker.x, y: game.walker.y };
      for (let i = 0; i < 30; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 1, y: 0 }) });
      }
      return {
        fishing: game.fishing.active,
        moved: +Math.hypot(game.walker.x - from.x, game.walker.y - from.y).toFixed(1),
      };
    });

    suite.ok(!walkedAgain.fishing, 'Q packs up the camp, on any keyboard layout');
    suite.ok(walkedAgain.moved > 5, 'and you can walk again', `${walkedAgain.moved}px`);
    await game.page.waitForSelector('#leave', { state: 'hidden', timeout: 5000 });
    suite.ok(true, 'the way out goes away with the camp');

    // Cast again, and put it down with the button this time.
    await game.evaluate((pencil) => {
      const pond = pencil.game.world.pond;
      pencil.game.teleport(pond.x, pond.y + pond.ry + 22);
    });
    await game.page.waitForSelector('#action:not(.hidden)', { timeout: 5000 });
    await game.page.click('#action');
    await game.page.waitForSelector('#leave:not(.hidden)', { timeout: 5000 });
    await game.page.click('#leave');
    const tapped = await game.evaluate((pencil) => pencil.game.fishing.active);
    suite.ok(!tapped, 'and the button does the same, for a phone');

    /*
     * What the pond gave up, once the camp is down.
     *
     * The tally is kept for the whole playthrough rather than the session, so
     * an afternoon of fishing reads as an afternoon and not as four separate
     * sittings.
     */
    const creel = await game.page.$eval('#creel', (el) => ({
      showing: !el.classList.contains('hidden'),
      text: el.querySelector('#creelList').textContent,
    }));
    const expected = await game.evaluate((pencil) =>
      pencil.i18n.list(
        pencil.game.fishing.landed.map(({ kind, count }) =>
          pencil.i18n.say(`creel.${kind}`, { n: count }),
        ),
      ),
    );
    suite.ok(creel.showing, 'packing up shows what you caught');
    suite.equal(creel.text, expected, 'and it says the same as the ledger', creel.text);
    suite.ok(creel.text.length > 0, 'which is not empty after a good run');

    /*
     * Seven things live in this pond, and each is drawn its own way.
     *
     * Rendered rather than merely counted: a kind with a typo in its drawing
     * throws, and a switch that quietly falls through draws nothing at all.
     */
    const drawn = await game.evaluate((pencil) => {
      const { game } = pencil;
      const keep = { caught: game.fishing.caught, tally: { ...game.fishing.tally } };
      const kinds = ['roach', 'crucian', 'carp', 'catfish', 'boot', 'shoe', 'treasure'];
      const inked = [];
      for (const kind of kinds) {
        const f = game.fishing;
        f.phase = 'bite';
        f.strike();
        f.hooked = kind;
        while (f.catchProgress < 0.6 && f.phase === 'caught') {
          game.advance(1 / 240, { direction: () => ({ x: 0, y: 0 }) });
        }
        game.particles.clear();
        pencil.renderOnce();
        inked.push(f.labelKey);
      }
      game.fishing.caught = keep.caught;
      game.fishing.tally = keep.tally;
      return { inked, kinds: kinds.length };
    });

    suite.equal(drawn.inked.length, 7, 'all seven draw without complaint');
    suite.equal(
      new Set(drawn.inked).size,
      7,
      'and each one says what it is',
      drawn.inked.join(' / '),
    );

    /*
     * The odds. Four casts in five are a fish, and the gold thing is rare
     * without being a rumour.
     */
    const odds = await game.evaluate((pencil) => {
      const { game } = pencil;
      const keep = { caught: game.fishing.caught, tally: { ...game.fishing.tally } };
      const counts = {};
      const runs = 20000;
      for (let i = 0; i < runs; i++) {
        game.fishing.phase = 'bite';
        game.fishing.strike();
        counts[game.fishing.hooked] = (counts[game.fishing.hooked] ?? 0) + 1;
      }
      const fish = ['roach', 'crucian', 'carp', 'catfish'].reduce((n, k) => n + (counts[k] ?? 0), 0);
      game.fishing.caught = keep.caught;
      game.fishing.tally = keep.tally;
      return { counts, fishShare: fish / runs, treasure: (counts.treasure ?? 0) / runs, runs };
    });

    suite.ok(
      odds.fishShare > 0.82 && odds.fishShare < 0.94,
      'most of what comes up has fins',
      `${(odds.fishShare * 100).toFixed(1)}%`,
    );
    suite.ok(
      odds.treasure > 0.004 && odds.treasure < 0.02,
      'and the gold thing is about one cast in a hundred',
      `${(odds.treasure * 100).toFixed(2)}%`,
    );
    suite.equal(
      Object.keys(odds.counts).length,
      7,
      'nothing in the pond is unreachable',
      Object.keys(odds.counts).join(', '),
    );

    // Walk away: the camp packs itself up.
    const left = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.teleport(game.fishing.campX + 200, game.fishing.campY + 90);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { active: game.fishing.active, phase: game.fishing.phase, caught: game.fishing.caught };
    });

    suite.ok(!left.active, 'walking away packs up the camp');
    suite.equal(left.phase, 'off', 'and puts the rod down');
    suite.equal(left.caught, missed.caught, 'the fish you caught are still yours');

    // A fresh game closes it again.
    const restarted = await game.evaluate((pencil) => {
      pencil.game.restart();
      return { won: pencil.game.won, caught: pencil.game.fishing.caught, active: pencil.game.fishing.active };
    });
    suite.ok(!restarted.won, 'a new world is unfinished again');
    suite.ok(missed.caught >= 2, 'more than one landed over the run', `${missed.caught}`);
    suite.equal(restarted.caught, 0, 'and the tally starts over');
    suite.ok(!restarted.active, 'with no camp standing');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
