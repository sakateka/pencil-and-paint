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
    await page.goto(url);

    const build = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const started = performance.now();
          let last = performance.now();
          let longest = 0;
          let ticks = 0;
          const id = setInterval(() => {
            const now = performance.now();
            longest = Math.max(longest, now - last);
            last = now;
            ticks++;
            if (globalThis.pencil || now - started > 30000) {
              clearInterval(id);
              resolve({ ticks, longestStall: Math.round(longest), total: Math.round(now - started) });
            }
          }, 16);
        }),
    );

    // Measured against the build's own duration rather than a fixed tick count.
    // Were generation synchronous the single stall would be the whole build; if
    // it is sliced properly the worst one is a small part of it. That holds on a
    // fast machine and a slow one alike, where counting timer callbacks does not
    // — they coalesce, and the count depends on how long the build happened to
    // take.
    const budget = Math.max(60, build.total * 0.6);
    suite.atMost(
      build.longestStall,
      budget,
      'no slice blocks the page for anything like the whole build',
      `longest ${build.longestStall}ms of ${build.total}ms total`,
    );
    suite.atMost(build.longestStall, 400, 'and never for long in absolute terms');
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
