import { chromium, firefox } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serve } from './harness.js';

const FRAME_COUNT = Number(process.env.PERF_FRAMES ?? 180);
const OUTPUT = resolve(process.env.PERF_OUT ?? 'tmp/perf');
const requested = process.env.PERF_BROWSER ?? 'chromium,firefox';
const engines = { chromium, firefox };

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function summarise(samples) {
  const render = samples.map((sample) => sample.renderMs);
  const intervals = samples.slice(1).map((sample, index) => sample.startedAt - samples[index].startedAt);
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
  const stages = Object.fromEntries(
    Object.keys(samples.at(-1)?.stages ?? {}).map((stage) => [
      stage,
      +mean(samples.map((sample) => sample.stages[stage])).toFixed(3),
    ]),
  );
  return {
    frames: samples.length,
    renderMs: {
      mean: +mean(render).toFixed(3),
      p50: +percentile(render, 0.5).toFixed(3),
      p95: +percentile(render, 0.95).toFixed(3),
      max: +Math.max(...render).toFixed(3),
    },
    frameIntervalMs: {
      mean: +mean(intervals).toFixed(3),
      p50: +percentile(intervals, 0.5).toFixed(3),
      p95: +percentile(intervals, 0.95).toFixed(3),
      max: +Math.max(...intervals).toFixed(3),
      over20ms: intervals.filter((value) => value > 20).length,
      over26ms: intervals.filter((value) => value > 26).length,
    },
    stages,
  };
}

async function measure(page, setup) {
  return page.evaluate(
    async ({ count, setup }) => {
      const pencil = globalThis.pencil;
      const game = pencil.game;
      if (setup === 'meadow') {
        game.teleport(1500, 1000);
      } else if (setup === 'hills') {
        game.teleport(520, -12);
      } else if (setup === 'elephant') {
        game.summonElephant();
        game.vigil.elephant = 1;
        game.vigil.seen = true;
        game.teleport(game.vigil.elephantX, game.vigil.elephantY + 100);
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
      pencil.perf.pardonWarmUp();

      const renderer = pencil.renderer;
      const original = renderer.render;
      const samples = [];
      await new Promise((resolve) => {
        renderer.render = function profiledRender(scene) {
          const startedAt = performance.now();
          original.call(this, scene);
          samples.push({
            startedAt,
            renderMs: performance.now() - startedAt,
            stages: { ...renderer.stages },
          });
          if (samples.length >= count) {
            renderer.render = original;
            resolve();
          }
        };
      });

      const canvases = (globalThis.__perfCanvases ?? [])
        .map((reference) => reference.deref())
        .filter(Boolean)
        .filter((canvas) => canvas.width > 1 || canvas.height > 1)
        .map((canvas) => ({ width: canvas.width, height: canvas.height }));
      return {
        samples,
        perf: pencil.perf.snapshot(),
        camera: {
          x: game.camera.x,
          y: game.camera.y,
          viewX: game.camera.viewX,
          viewY: game.camera.viewY,
        },
        canvases: {
          count: canvases.length,
          pixels: canvases.reduce((sum, canvas) => sum + canvas.width * canvas.height, 0),
          sizes: canvases.sort((a, b) => b.width * b.height - a.width * a.height),
        },
      };
    },
    { count: FRAME_COUNT, setup },
  );
}

async function chromiumMetrics(session) {
  const [{ metrics }, heap, dom] = await Promise.all([
    session.send('Performance.getMetrics'),
    session.send('Runtime.getHeapUsage'),
    session.send('Memory.getDOMCounters'),
  ]);
  return {
    performance: Object.fromEntries(metrics.map(({ name, value }) => [name, value])),
    heap,
    dom,
  };
}

async function runBrowser(name, url) {
  const browserType = engines[name];
  if (!browserType) throw new Error(`Unknown browser: ${name}`);
  const browser = await browserType.launch();
  const version = browser.version();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    globalThis.__perfCanvases = [];
    const original = Document.prototype.createElement;
    Document.prototype.createElement = function trackedCreateElement(name, options) {
      const element = original.call(this, name, options);
      if (String(name).toLowerCase() === 'canvas') globalThis.__perfCanvases.push(new WeakRef(element));
      return element;
    };
  });
  await context.tracing.start({ screenshots: false, snapshots: true, sources: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  await page.goto(url);
  await page.click('#startBtn');
  await page.waitForFunction(() => globalThis.pencil !== undefined, null, { timeout: 30000 });
  await page.waitForTimeout(500);

  let session;
  if (name === 'chromium') {
    session = await context.newCDPSession(page);
    await session.send('Performance.enable');
    await session.send('Profiler.enable');
    await session.send('Profiler.setSamplingInterval', { interval: 100 });
    await session.send('Profiler.start');
  }

  const scenarios = {};
  for (const scenario of ['meadow', 'hills', 'elephant']) {
    const result = await measure(page, scenario);
    scenarios[scenario] = {
      ...summarise(result.samples),
      perf: result.perf,
      camera: result.camera,
      canvases: result.canvases,
    };
  }

  let engineMetrics;
  if (session) {
    const [{ profile }, metrics] = await Promise.all([
      session.send('Profiler.stop'),
      chromiumMetrics(session),
    ]);
    engineMetrics = metrics;
    await writeFile(resolve(OUTPUT, `${name}-cpu-profile.json`), JSON.stringify(profile));
  }

  await context.tracing.stop({ path: resolve(OUTPUT, `${name}-trace.zip`) });
  await browser.close();
  if (errors.length) throw new Error(`${name}: ${errors.join('\n')}`);
  return { browser: name, version, scenarios, engineMetrics };
}

await mkdir(OUTPUT, { recursive: true });
const server = await serve();
const result = {
  generatedAt: new Date().toISOString(),
  framesPerScenario: FRAME_COUNT,
  viewport: { width: 1280, height: 800 },
  browsers: {},
};

try {
  for (const name of requested.split(',').map((value) => value.trim()).filter(Boolean)) {
    process.stdout.write(`Benchmarking ${name}...\n`);
    result.browsers[name] = await runBrowser(name, server.url);
    process.stdout.write(`${name} complete\n`);
  }
} finally {
  await server.close();
}

await writeFile(resolve(OUTPUT, 'results.json'), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
