import { chromium } from 'playwright';
import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The development panel exists only when the page is served locally.
 *
 * The shortcuts behind it are harmless — it is a game about walking — but a
 * debug menu on the published site reads as something left behind by accident,
 * so the absence is worth pinning down rather than trusting to a code path.
 */
export async function run(url) {
  const suite = new Suite('dev panel');
  const game = await openGame(url);

  try {
    const local = await game.page.evaluate(() => ({
      hostname: location.hostname,
      present: !!document.getElementById('devpanel'),
      hidden: document.getElementById('devpanel')?.hidden,
    }));
    suite.ok(local.present, 'present when served locally', local.hostname);
    suite.equal(local.hidden, true, 'starts hidden');

    await game.page.keyboard.press('`');
    await game.page.waitForFunction(() => !document.getElementById('devpanel').hidden, null, {
      timeout: 1000,
    });
    const opened = await game.page.evaluate(() => !document.getElementById('devpanel').hidden);
    suite.ok(opened, 'backquote opens it');

    // No button may spill outside the panel.
    const overflowing = await game.page.evaluate(() => {
      const panel = document.getElementById('devpanel');
      const right = panel.getBoundingClientRect().right;
      return [...panel.querySelectorAll('button')].filter(
        (el) => el.getBoundingClientRect().right > right - 1,
      ).length;
    });
    suite.equal(overflowing, 0, 'every button fits inside the panel');

    // Collecting everything must land in the same state as playing it out.
    const collected = await game.evaluate((pencil) => {
      pencil.game.collectAll();
      return {
        found: pencil.game.found,
        total: pencil.game.pots.length,
        won: pencil.game.won,
        unfound: pencil.game.pots.filter((p) => !p.found).length,
        hud: document.getElementById('found').textContent,
      };
    });
    suite.equal(collected.found, collected.total, 'collect all finds every pot');
    suite.equal(collected.unfound, 0, 'no pot is left behind');
    suite.ok(collected.won, 'collect all ends the game');
    suite.equal(collected.hud, String(collected.total), 'the counter agrees');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }

  // And now the same build under a hostname that is not local.
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  try {
    await page.route('**/*', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const upstream = await fetch(url.replace(/\/$/, '') + path);
      await route.fulfill({
        status: upstream.status,
        headers: { 'content-type': upstream.headers.get('content-type') ?? 'text/html' },
        body: Buffer.from(await upstream.arrayBuffer()),
      });
    });
    await page.goto('https://pencil.example.com/');
    await page.waitForSelector('#startBtn');
    await page.click('#startBtn');
    await page.waitForFunction(() => globalThis.pencil !== undefined, null, { timeout: 30000 });
    await page.keyboard.press('`');

    const remote = await page.evaluate(() => ({
      hostname: location.hostname,
      panel: !!document.getElementById('devpanel'),
      styles: [...document.querySelectorAll('style')].some((s) =>
        s.textContent.includes('#devpanel'),
      ),
      playable: globalThis.pencil.game.pots.length,
    }));
    suite.ok(!remote.panel, 'absent when served from a real host', remote.hostname);
    suite.ok(!remote.styles, 'its styles are never injected either');
    suite.equal(remote.playable, 14, 'the game itself is unaffected');
  } finally {
    await browser.close();
  }

  return suite;
}
