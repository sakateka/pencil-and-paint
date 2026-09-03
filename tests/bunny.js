import { chromium, firefox } from 'playwright';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve } from './harness.js';

/**
 * The bunny test: one long walk, measured the way a player would feel it.
 *
 * Every other measurement here holds the walker still and reports an average,
 * and every one of them has said the game was healthy while somebody was
 * watching it stutter. An average over a fixed spot cannot find a fault that
 * arrives after minutes of play, because the fault is not in the frame — it is
 * in what the frame has accumulated by then.
 *
 * So this walks. A spiral in from the edge of the valley to the middle, which
 * crosses every kind of ground and drags the lit circle over most of the
 * scenery in the world, and then a tour of the paint pots, because finding one
 * throws a burst of particles and that is the moment a session has been seen to
 * drop onto the software path and stay there.
 *
 * What it reports is the distribution, not the mean: the count of frames that
 * missed vsync, when they happened, and what the renderer was doing in the
 * worst of them.
 *
 *   node tests/bunny.js                 # builds fresh, runs Firefox
 *   node tests/bunny.js tmp/dist a b    # A/Bs existing builds, in order
 *   BUNNY_BROWSER=chromium,firefox node tests/bunny.js
 */

const BROWSERS = (process.env.BUNNY_BROWSER ?? 'firefox').split(',');
const LAPS = Number(process.env.BUNNY_LAPS ?? 3);
const IDLE_S = Number(process.env.BUNNY_IDLE ?? 25);
const TIMEOUT_S = Number(process.env.BUNNY_TIMEOUT ?? 180);
const engines = { chromium, firefox };

function buildFresh() {
  const scratch = join(import.meta.dirname, '..', 'tmp');
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, 'bunny-'));
  const step = (name, ...args) => {
    const done = spawnSync('npm', ['exec', '--', name, ...args], { stdio: 'inherit' });
    if (done.status !== 0) {
      rmSync(dir, { recursive: true, force: true });
      console.error('build failed');
      process.exit(1);
    }
  };
  step('tsc', '--noEmit');
  step('vite', 'build', '--outDir', dir, '--emptyOutDir');
  return dir;
}

/**
 * The walk itself, as source, because it runs inside the page.
 *
 * Steering rather than teleporting: the walker is driven by the same direction
 * vector the keyboard produces, so the camera, the colliders and the walk cycle
 * all behave as they do in play. A teleported walk measures a slideshow.
 */
const WALK = `async ({ laps, idleS, timeoutS }) => {
  const pencil = globalThis.pencil;
  const { game, perf } = pencil;
  const CENTRE_X = 1400;
  const CENTRE_Y = 1000;

  // Where the walker is aiming right now. The spiral moves it; the walker
  // chases it. Overriding advance is the only seam into the real loop: the
  // input object itself belongs to main.ts and is not handed out.
  let target = { x: CENTRE_X, y: CENTRE_Y };
  const advance = game.advance.bind(game);
  game.advance = (dt) =>
    advance(dt, {
      direction: () => {
        const dx = target.x - game.walker.x;
        const dy = target.y - game.walker.y;
        const d = Math.hypot(dx, dy);
        return d < 4 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d };
      },
    });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = [];
  let last = performance.now();
  let stop = false;
  /*
   * Timed off the frame timestamp, not off the clock inside the callback.
   * main.ts's loop takes the timestamp rAF hands it, and measuring the other
   * way puts callback scheduling jitter on top: the first run of this test
   * counted 65 frames over 20ms while the game's own record of the same walk
   * held none at all, which is a disagreement about clocks and not about the
   * game.
   */
  const tick = (now) => {
    frames.push(now - last);
    last = now;
    if (!stop) requestAnimationFrame(tick);
  };

  game.teleport(CENTRE_X + 1150, CENTRE_Y);
  await wait(1200);
  perf.pardonWarmUp();
  frames.length = 0;
  last = performance.now();
  requestAnimationFrame(tick);

  const startedAt = performance.now();
  const outOfTime = () => performance.now() - startedAt > timeoutS * 1000;
  const marks = [];
  const mark = (what) => marks.push({ what, at: +((performance.now() - startedAt) / 1000).toFixed(1), frames: frames.length });

  /*
   * Each phase's frames, kept apart.
   *
   * A single median over the whole walk cannot show the thing this test is
   * looking for. The fault does not make one frame slow, it makes every frame
   * after some moment slow — the session drops onto the software path and does
   * not climb back — so what gives it away is the same walk costing more after
   * an interruption than before it. Comparing "pots" against "spiral" asks
   * exactly that question, and "idle" is where the drop has been seen to
   * happen: standing still, with almost nothing being drawn.
   */
  const phases = [];
  const phase = (name) => {
    if (phases.length) phases[phases.length - 1].to = frames.length;
    phases.push({ name, from: frames.length, to: frames.length });
  };

  /*
   * The spiral. The aim point runs ahead around an ellipse whose radii shrink
   * a little every step, so the walk is a continuous curve inwards rather than
   * a set of laps with corners in it — corners are where a walker stops, and a
   * walker that stops is not testing anything.
   */
  phase('spiral');
  const STEPS = laps * 48;
  for (let i = 0; i < STEPS && !outOfTime(); i++) {
    const k = i / STEPS;
    const angle = k * laps * Math.PI * 2;
    const rx = 1150 * (1 - k) + 70 * k;
    const ry = 820 * (1 - k) + 50 * k;
    target = {
      x: CENTRE_X + Math.cos(angle) * rx,
      y: CENTRE_Y + Math.sin(angle) * ry,
    };
    // Long enough for the walker to make real ground towards each aim point.
    await wait(260);
  }
  mark('spiral done');

  /*
   * Stand still and do nothing, on purpose.
   *
   * The one state nobody thought to measure, and the one where the drop onto
   * the software path has been seen to happen: while the walker is idle the
   * frame draws a handful of things, so the few operations that are new each
   * frame make up most of what the browser is asked to do, and a browser that
   * judges its own cache by the proportion of work it recognises has very
   * little to go on. Long enough to cross a ten-second buffer-drop timer twice.
   */
  phase('idle');
  target = { x: game.walker.x, y: game.walker.y };
  const idleUntil = performance.now() + idleS * 1000;
  while (performance.now() < idleUntil && !outOfTime()) await wait(250);
  mark('idle done');

  phase('pots');
  /*
   * Then the pots, nearest first. Each one found is a burst of particles, and
   * the point of walking to all fourteen is to throw fourteen of them at a
   * session that has already been running for a couple of minutes.
   */
  let found = game.pots.filter((p) => p.found).length;
  while (found < game.pots.length && !outOfTime()) {
    const left = game.pots.filter((p) => !p.found);
    let nearest = left[0];
    let best = Infinity;
    for (const p of left) {
      const d = Math.hypot(p.x - game.walker.x, p.y - game.walker.y);
      if (d < best) { best = d; nearest = p; }
    }
    target = { x: nearest.x, y: nearest.y };

    // Give it a bounded run at each pot: scenery can stand in the way, and a
    // walk that cannot reach one must not hang the whole test.
    const give_up = performance.now() + 12000;
    while (!nearest.found && performance.now() < give_up && !outOfTime()) await wait(120);
    if (nearest.found) mark('pot ' + (found + 1));
    if (!nearest.found) { nearest.found = true; mark('pot skipped'); }
    found = game.pots.filter((p) => p.found).length;
  }
  mark('pots done');

  await wait(400);
  stop = true;
  phase('end');
  game.advance = advance;

  const stats = (values) => {
    const s = [...values].sort((a, b) => a - b);
    const q = (f) => +(s[Math.floor(s.length * f)] ?? 0).toFixed(1);
    return {
      frames: s.length,
      median: q(0.5),
      p95: q(0.95),
      max: +(s[s.length - 1] ?? 0).toFixed(1),
      over20: s.filter((f) => f > 20).length,
      over33: s.filter((f) => f > 33).length,
    };
  };

  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q) => +(sorted[Math.floor(sorted.length * q)] ?? 0).toFixed(1);
  return {
    phases: phases
      .filter((p) => p.to > p.from)
      .map((p) => ({ name: p.name, ...stats(frames.slice(p.from, p.to)) })),
    seconds: +((performance.now() - startedAt) / 1000).toFixed(1),
    frames: frames.length,
    median: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: +(sorted[sorted.length - 1] ?? 0).toFixed(1),
    over20: frames.filter((f) => f > 20).length,
    over33: frames.filter((f) => f > 33).length,
    over50: frames.filter((f) => f > 50).length,
    potsFound: game.pots.filter((p) => p.found).length,
    canvasesMade: globalThis.__bunnyCanvases ?? 0,
    marks,
    report: JSON.parse(await pencil.report(60)),
  };
}`;

async function walk(name, root) {
  const server = await serve(root);
  const browser = await engines[name].launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // Canvas allocations are the currency of the churn this test exists to
  // catch, so they are counted from before the page has run a line.
  await context.addInitScript(() => {
    globalThis.__bunnyCanvases = 0;
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function counted(tag, options) {
      if (String(tag).toLowerCase() === 'canvas') globalThis.__bunnyCanvases++;
      return create.call(this, tag, options);
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await page.goto(server.url);
  await page.waitForSelector('#startBtn');
  await page.click('#startBtn');
  await page.waitForFunction(() => globalThis.pencil !== undefined, null, { timeout: 30000 });

  const out = await page.evaluate(
    ([body, arg]) => new Function('arg', `return (${body})(arg)`)(arg),
    [WALK, { laps: LAPS, idleS: IDLE_S, timeoutS: TIMEOUT_S }],
  );

  await browser.close();
  await server.close();
  return { ...out, errors };
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) dirs.push(process.env.PENCIL_DIST ?? buildFresh());

for (const name of BROWSERS) {
  for (const dir of dirs) {
    const r = await walk(name, dir);
    console.log(`\n===== ${name}  ${dir}`);
    console.log(
      `${r.seconds}s  ${r.frames} frames  pots ${r.potsFound}/14  canvases made ${r.canvasesMade}`,
    );
    console.log(
      `median ${r.median}ms  p95 ${r.p95}  p99 ${r.p99}  max ${r.max}   ` +
        `missed vsync: ${r.over20} over 20ms, ${r.over33} over 33ms, ${r.over50} over 50ms`,
    );
    for (const p of r.phases) {
      console.log(
        `  ${p.name.padEnd(7)} ${String(p.frames).padStart(5)} frames  median ${p.median}ms  ` +
          `p95 ${p.p95}  max ${p.max}  over20 ${p.over20}  over33 ${p.over33}`,
      );
    }
    console.log(`verdict: ${r.report.verdict}`);
    if (r.report.worstFrames.length) {
      console.log(`worst frames (${r.report.worstFrames.length}):`);
      for (const f of r.report.worstFrames) {
        const parts = Object.entries(f.stages)
          .filter(([, v]) => v > 0.2)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k} ${(+v).toFixed(1)}`)
          .join('  ');
        console.log(
          `  ${f.at.toFixed(1)}s  frame ${f.frameMs.toFixed(1)}ms  draw ${f.drawMs.toFixed(1)}  ` +
            `[${f.path} ${f.dirty}]  ${parts}`,
        );
      }
    } else {
      console.log('worst frames: none over 20ms');
    }
    console.log('timeline:', r.marks.map((m) => `${m.what} @${m.at}s`).join(', '));
    if (r.errors.length) console.log('errors:', r.errors);
  }
}
