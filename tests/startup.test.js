import { chromium } from 'playwright';
import { Suite } from './assert.js';
import { gameUrl } from './harness.js';

/**
 * Starting up must not lock the page.
 *
 * Baking the world hatches every blade of grass in a 2800x2000 world, twice.
 * On a phone that is seconds, and the title card is painted throughout — so
 * pressing Start during it is the obvious thing to do. Two things have to hold:
 * the main thread keeps yielding, and a press that lands early is honoured
 * rather than swallowed.
 */
export async function run(url) {
  const suite = new Suite('startup');
  const browser = await chromium.launch();

  try {
    // --- the page stays responsive while the world is built ---
    const page = await browser.newPage({ viewport: { width: 412, height: 892 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const loadStarted = Date.now();
    await page.goto(gameUrl(url));
    await page.waitForSelector('#startBtn');
    await page.click('#startBtn');

    await page.waitForFunction(() => globalThis.pencil !== undefined, null, { timeout: 60000 });

    /*
     * Asked of the generator, not of a timer.
     *
     * Watching setInterval from outside measures the gap between callbacks,
     * which on a loaded machine — a CI runner especially — is mostly the OS
     * declining to schedule us. That is not something this code can fix, and a
     * test that fails on it is measuring the weather. This is the longest
     * stretch of baking that ran without yielding: work we actually did.
     */
    const longestSlice = await page.evaluate(() => globalThis.pencil.longestBakeSliceMs());
    const wholeLoad = Date.now() - loadStarted;

    /*
     * Bounded against the load's own duration, because a slower machine spends
     * proportionally longer inside every chunk — a fixed millisecond limit just
     * encodes how fast the developer's laptop was. Measured under deliberate
     * CPU throttling: 38ms of a 184ms load at full speed, 147ms of 1024ms at
     * eight times slower. Both around a fifth. A bake that never yielded would
     * report the whole load, and fail at any speed.
     */
    const budget = Math.max(120, wholeLoad * 0.35);
    suite.atMost(
      Math.round(longestSlice),
      Math.round(budget),
      'no stretch of the bake runs without yielding for long',
      `longest slice ${longestSlice.toFixed(0)}ms of a ${wholeLoad}ms load`,
    );

    suite.equal(errors.length, 0, 'no page errors', errors.join(' | '));
    await page.close();

    // --- a press that lands during the build is remembered ---
    const early = await browser.newPage({ viewport: { width: 412, height: 892 } });
    await early.goto(gameUrl(url));
    await early.waitForSelector('#startBtn');
    // The button must not be `disabled`: a disabled button dispatches no click,
    // and the click is what starts the whole thing now.
    const disabled = await early.evaluate(
      () => document.querySelector('#startBtn').disabled,
    );
    suite.ok(!disabled, 'the start button stays clickable while loading');

    await early.click('#startBtn');
    await early.waitForFunction(() => globalThis.pencil !== undefined, null, { timeout: 30000 });
    await early.waitForFunction(
      () => globalThis.pencil.game.running && document.getElementById('intro').classList.contains('hidden'),
      null,
      { timeout: 1000 },
    );

    const after = await early.evaluate(() => ({
      running: globalThis.pencil.game.running,
      introHidden: document.getElementById('intro').classList.contains('hidden'),
    }));
    suite.ok(after.running, 'an early press starts the game once it is ready');
    suite.ok(after.introHidden, 'and the title card goes away');
    await early.close();

    /*
     * --- the load report: folded away, but reachable and copyable ---
     *
     * The build id stays out because it is the only way to tell from a phone
     * whether you are looking at current code or yesterday's cache. Everything
     * else is diagnostics and belongs behind a fold — and behind it, it has to
     * be takeable in one press, because the person who wants it is the person
     * who cannot select eight lines of 11px monospace with a thumb.
     */
    const context = await browser.newContext({ viewport: { width: 412, height: 892 } });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const card = await context.newPage();
    const cardErrors = [];
    card.on('pageerror', (e) => cardErrors.push(e.message));
    await card.goto(gameUrl(url));
    // Left on the title card on purpose — this is the one screen it lives on.
    await card.waitForSelector('#buildDetails:not(.hidden)', { timeout: 60000 });

    const shown = await card.evaluate(() => ({
      stamp: document.querySelector('#buildStamp').textContent,
      open: document.querySelector('#buildDetails').open,
      summary: document.querySelector('#buildDetails summary').textContent,
      report: document.querySelector('#buildReport').textContent,
      started: globalThis.pencil !== undefined,
    }));

    suite.ok(shown.stamp.length > 0, 'the build id is out on the card', shown.stamp);
    suite.equal(
      shown.stamp.includes('\n'),
      false,
      'and it is the only line out there',
      JSON.stringify(shown.stamp),
    );
    suite.equal(shown.open, false, 'the timings are folded away to begin with');
    suite.ok(shown.summary.length > 0, 'behind something that says what it is', shown.summary);
    suite.ok(shown.report.includes('bake'), 'the bake is in the report');
    suite.atLeast(shown.report.split('\n').length, 3, 'and so is the rest of the load');
    suite.equal(
      shown.report.includes(shown.stamp),
      false,
      'the id is not repeated inside it',
    );

    await card.click('#buildDetails summary');

    /*
     * Unfolding it must not start the game.
     *
     * Any pointerdown on the page is the first gesture, and the first gesture
     * takes the card away — so before this was spared, the report was the one
     * panel on the card that could not be read: reaching for it dismissed the
     * thing it was written on.
     */
    const afterOpening = await card.evaluate(() => ({
      open: document.querySelector('#buildDetails').open,
      introUp: !document.getElementById('intro').classList.contains('hidden'),
      started: globalThis.pencil !== undefined,
    }));
    suite.ok(afterOpening.open, 'the fold opens when you press it');
    suite.ok(afterOpening.introUp, 'and the title card is still there');
    suite.ok(!afterOpening.started, 'reading the report does not start the game');

    await card.click('#buildCopy');
    suite.ok(
      await card.evaluate(() => !document.getElementById('intro').classList.contains('hidden')),
      'nor does copying it',
    );
    const copied = await card.evaluate(() => navigator.clipboard.readText());
    suite.ok(
      copied.startsWith(shown.stamp),
      'what it copies leads with the build id',
      copied.slice(0, 40),
    );
    suite.ok(
      copied.includes('bake') && copied.length > shown.stamp.length + 20,
      'and carries the whole report with it',
      `${copied.length} characters`,
    );
    suite.equal(cardErrors.length, 0, 'no page errors on the card', cardErrors.join(' | '));
    await context.close();
  } finally {
    await browser.close();
  }

  return suite;
}
