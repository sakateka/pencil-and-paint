import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

/*
 * Defaults to dist/, overridable via PENCIL_DIST.
 *
 * This checkout is shared by two accounts and `dist/` grants write only to its
 * owner, so whoever builds second cannot empty the other's output. Rather than
 * fight over it: `npm run build:tmp` and `npm run test:tmp` work entirely in
 * `tmp/dist`, leaving `dist/` to whoever runs plain `npm run build` — which is
 * also what `npm run preview` serves.
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

/** Serve `dist/` the way a static host would, so tests exercise the real build. */
export async function serve() {
  const server = createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const file = join(ROOT, normalize(path === '/' ? '/index.html' : path));
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
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await page.goto(url);
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
    await page.waitForTimeout(300);
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
    close: () => browser.close(),
  };
}

/** Advance the simulation deterministically, without waiting on real time. */
export const stepSimulation = `(pencil, arg) => {
  const { steps = 60, dt = 1 / 60 } = arg ?? {};
  for (let i = 0; i < steps; i++) pencil.game.advance(dt, { direction: () => arg.dir ?? { x: 0, y: 0 } });
  return null;
}`;
