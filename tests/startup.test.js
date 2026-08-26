import { chromium } from 'playwright';
import { Suite } from './assert.js';

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
    await page.goto(url);

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
    await early.goto(url);
    await early.waitForSelector('#startBtn');
    // The button must not be `disabled`: a disabled button dispatches no click,
    // so the very press this is meant to catch would never be seen.
    const disabled = await early.evaluate(
      () => document.querySelector('#startBtn').disabled,
    );
    suite.ok(!disabled, 'the start button stays clickable while loading');

    await early.click('#startBtn');
    await early.waitForFunction(() => globalThis.pencil !== undefined, null, { timeout: 30000 });
    await early.waitForTimeout(500);

    const after = await early.evaluate(() => ({
      running: globalThis.pencil.game.running,
      introHidden: document.getElementById('intro').classList.contains('hidden'),
    }));
    suite.ok(after.running, 'an early press starts the game once it is ready');
    suite.ok(after.introHidden, 'and the title card goes away');
    await early.close();
  } finally {
    await browser.close();
  }

  return suite;
}
