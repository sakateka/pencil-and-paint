import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

/*
 * Which directory to serve, PENCIL_DIST or dist/.
 *
 * `npm test` never relies on either: run.js builds fresh into its own private
 * directory under tmp/ — two runs at once never see each other's files — and
 * passes that directory straight to `serve`. The default here is only a
 * fallback for callers (the benchmark, say) with no directory of their own.
 */
const ROOT = process.env.PENCIL_DIST
  ? `${process.env.PENCIL_DIST.replace(/\/?$/, '/')}`
  : new URL('../dist/', import.meta.url).pathname;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.webp': 'image/webp',
};

let browserPromise;

/**
 * The shared browser.
 *
 * `PENCIL_HEADED=1` launches it against a real display instead of headless,
 * which is the difference between a browser with a GPU process and one without.
 * Headless Chromium in some environments — this development box among them —
 * cannot create a WebGL context at all, and since the frame moved to WebGL that
 * means every suite times out waiting for the game to appear. A display it can
 * draw into is enough; it does not have to be a screen:
 *
 *   nix-shell -p xorg-server --run '
 *     Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp & XPID=$!
 *     sleep 3
 *     PENCIL_HEADED=1 DISPLAY=:99 npm test
 *     kill $XPID'
 *
 * Off by default, because on a workstation it would open four browser windows
 * on top of whatever you were doing.
 */
async function browser() {
  browserPromise ??= chromium.launch({ headless: !process.env.PENCIL_HEADED });
  return browserPromise;
}

/** Close the shared browser after the suite runner has finished. */
export async function closeBrowser() {
  const current = browserPromise;
  browserPromise = undefined;
  if (current) await (await current).close();
}

/** Serve a build directory the way a static host would. */
export async function serve(root = ROOT) {
  const server = createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    /*
     * A headed browser asks for a favicon and a headless one does not, so
     * `PENCIL_HEADED=1` turned a 404 into a console error in every suite and
     * failed the "no page errors" check thirteen times over. Answer it the way
     * a real host would rather than teach the check to ignore things.
     */
    if (path === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    const file = join(root, normalize(path === '/' ? '/index.html' : path));
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Open the game, wait for the world to finish baking, and begin play.
 *
 * Every console error and page exception is collected and asserted empty at the
 * end of each suite — a test that passes while the page throws is not a pass.
 */
export async function openGame(url, { viewport = { width: 1280, height: 800 }, start = true } = {}) {
  const context = await (await browser()).newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  /*
   * `?readback` asks the renderer to keep the drawing buffer, without which
   * nothing can read the finished frame back — the WebGL canvas is discarded
   * as soon as it has been handed to the compositor. It is off in play because
   * it costs the driver a full-screen copy every frame.
   */
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'readback');
  // Nothing heavy runs until the page is touched — see `firstGesture` in
  // main.ts — so the click comes first and the game appears after it.
  await page.waitForSelector('#startBtn');
  /*
   * `start: false` means the title card is left up, untouched.
   *
   * It used to click Start regardless and only skip a settle delay, which made
   * it impossible to test the one screen every player sees first — and hid a
   * real fault for a while: the language picker on the title card did nothing,
   * because the only thing listening to it was built after Start was pressed.
   */
  if (start) {
    await page.click('#startBtn');
    await page.waitForFunction(() => globalThis.pencil !== undefined, null, { timeout: 30000 });
    /*
     * And wait for the title card to actually go.
     *
     * It fades out over a quarter of a second, and the debug handle appears
     * before it has finished — so a screenshot taken the moment the game is
     * reachable can be a picture of the card. That is not hypothetical: it
     * turned a before-and-after comparison of a cow into a comparison of a
     * white rectangle, and the tool reported the difference without complaint.
     */
    await page.waitForFunction(
      () => {
        const intro = document.querySelector('#intro');
        return !intro || getComputedStyle(intro).visibility === 'hidden';
      },
      null,
      { timeout: 30000 },
    );
  }

  return {
    page,
    errors,
    /** Run a function inside the page with the debug handle passed in. */
    evaluate: (fn, arg) =>
      page.evaluate(
        ([body, a]) => new Function('pencil', 'arg', `return (${body})(pencil, arg)`)(globalThis.pencil, a),
        [fn.toString(), arg ?? null],
      ),
    close: () => context.close(),
  };
}

/** Advance the simulation deterministically, without waiting on real time. */
export const stepSimulation = `(pencil, arg) => {
  const { steps = 60, dt = 1 / 60 } = arg ?? {};
  for (let i = 0; i < steps; i++) pencil.game.advance(dt, { direction: () => arg.dir ?? { x: 0, y: 0 } });
  return null;
}`;

/** Wait for the page's own ink clock to cross a tick, without guessing a delay. */
export async function waitForBoil(page) {
  const previous = await page.evaluate(() => globalThis.pencil.boilTick());
  await page.waitForFunction(
    (before) => globalThis.pencil.boilTick() !== before,
    previous,
    { timeout: 2000 },
  );
}
