import { BUILD_ID } from './buildInfo';
import { rng } from './core/rng';
import { exposeForTests } from './debug';
import { installDebugPanel } from './debugPanel';
import {
  MURR_COUNT,
  MURR_GAP,
  MURR_SECONDS,
  PURR_SECONDS,
  purrStrength,
} from './entities/animals';
import { WALK_CYCLE } from './entities/player';
import { Game } from './game';
import { tickBoil } from './media/ink';
import { yieldToBrowser } from './core/schedule';
import { GRAIN } from './media/sprites';
import { Renderer } from './render/renderer';
import { buzzPurr, hapticStatus } from './systems/haptics';
import { Input } from './systems/input';
import { drawPerfOverlay, Performance } from './systems/perf';
import { Ui } from './ui';
import { World } from './world/world';

/** Longest step the simulation will take, so a stall does not teleport anyone. */
const MAX_STEP = 0.05;

/**
 * Wait for the first real gesture.
 *
 * Firefox on Android freezes a tab that has not been interacted with. Measured
 * on a device: the load did 945ms of work spread over 100 seconds of wall clock
 * — `performance.now()` counts only time the page was allowed to run, and it
 * disagreed with `Date.now()` by 99 seconds. Nothing was slow; the page simply
 * was not being scheduled, which is also why tapping the button "unstuck" it.
 *
 * So no heavy work happens until someone touches the page. After that the tab
 * is foreground and awake, and the world builds in its own good time.
 */
function firstGesture(button: HTMLButtonElement | null): Promise<void> {
  return new Promise((resolve) => {
    const done = (e?: Event) => {
      // Tapping the corner controls should not start the game.
      if (e && (e.target as Element | null)?.closest?.('#corner')) return;
      button?.removeEventListener('click', done);
      removeEventListener('keydown', onKey);
      removeEventListener('pointerdown', done);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      done();
    };
    button?.addEventListener('click', done);
    addEventListener('keydown', onKey);
    addEventListener('pointerdown', done);
  });
}

/**
 * How long the page has spent hidden since it loaded.
 *
 * `wall` minus `ready` says the page was not running, but not why. Time spent
 * in another app looks identical to a browser freezing a visible tab, and the
 * two mean completely different things: one is someone reading their messages,
 * the other is a bug. This separates them.
 */
let hiddenMs = 0;
let hiddenSince = document.hidden ? performance.now() : 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenSince = performance.now();
  } else if (hiddenSince) {
    hiddenMs += performance.now() - hiddenSince;
    hiddenSince = 0;
  }
});

async function boot(): Promise<void> {
  /** The load timings, shown in the readout once the title card is gone. */
  let loadReport: string[] = [];
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('missing #game canvas');

  const stamp = document.querySelector<HTMLElement>('#build');
  if (stamp) stamp.textContent = BUILD_ID;

  const startButton = document.querySelector<HTMLButtonElement>('#startBtn');
  const startLabel = startButton?.textContent ?? 'Start walking';

  await firstGesture(startButton);
  const tappedAt = performance.now();
  const tappedAtWall = Date.now();
  if (startButton) {
    startButton.setAttribute('aria-busy', 'true');
    startButton.textContent = 'drawing the valley…';
  }
  // Let the label paint before the bake takes the thread.
  await yieldToBrowser();

  /*
   * Encoding the grain to a data URL is a canvas readback plus a PNG encode.
   * Kept here, after the gesture, rather than on the critical path to first
   * paint.
   */
  const grainStarted = performance.now();
  const grain = document.querySelector<HTMLElement>('#grain');
  if (grain) grain.style.backgroundImage = `url(${GRAIN.toDataURL()})`;
  const grainMs = performance.now() - grainStarted;

  const world = await World.generate((fraction) => {
    if (!startButton) return;
    startButton.textContent = `drawing the valley… ${Math.round(fraction * 100)}%`;
  });

  if (startButton) {
    startButton.removeAttribute('aria-busy');
    startButton.textContent = startLabel;
  }
  // Read this off the device: it says which phase of the bake was slow.
  /*
   * Keep the report across loads.
   *
   * A slow load is exactly the one that never gets far enough to show its own
   * numbers — reload to look and you measure the fast load instead. So each run
   * stores its report and displays the one before it, and the slow load leaves
   * evidence even if you never see it happen.
   */
  const remember = (line: string) => {
    try {
      const previous = localStorage.getItem('pencil:lastLoad');
      localStorage.setItem('pencil:lastLoad', line);
      return previous;
    } catch {
      return null; // private browsing, or storage disabled
    }
  };

  if (stamp) {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    const paint = performance
      .getEntriesByType('paint')
      .find((e) => e.name === 'first-contentful-paint');
    const ms = (v: number | undefined) => (v === undefined ? '?' : v.toFixed(0));
    // The document request, split into the phases the network stack reports. A
    // slow `net` means something very different depending on whether it went to
    // DNS, the TLS handshake, or the server thinking before the first byte.
    const netPhases = (n: PerformanceNavigationTiming): string => {
      const tls = n.secureConnectionStart ? n.connectEnd - n.secureConnectionStart : 0;
      const tcp = Math.max(0, n.connectEnd - n.connectStart - tls);
      return (
        `net dns ${ms(n.domainLookupEnd - n.domainLookupStart)}` +
        ` · tcp ${ms(tcp)} · tls ${ms(tls)}` +
        ` · ttfb ${ms(n.responseStart - n.requestStart)}` +
        ` · body ${ms(n.responseEnd - n.responseStart)}` +
        ` · wait ${ms(n.domainLookupStart - n.fetchStart)}`
      );
    };
    const thisLoad =
      `grain ${grainMs.toFixed(0)}ms · script ${ms(nav && nav.domContentLoadedEventStart - nav.responseEnd)}` +
      ` · net ${ms(nav?.responseEnd)} · paint ${ms(paint?.startTime)} · ready ${performance.now().toFixed(0)}` +
      ` · wall ${(Date.now() - performance.timeOrigin).toFixed(0)}` +
      ` · hidden ${(hiddenMs + (hiddenSince ? performance.now() - hiddenSince : 0)).toFixed(0)}` +
      /*
       * The gap between the tap and a playable world, in both clocks.
       *
       * They disagree when the page is suspended: the monotonic clock stops and
       * the wall clock does not. So `tap 80/15000` is fifteen seconds of the
       * browser refusing to run us, while `tap 15000/15000` is fifteen seconds
       * of our own work — a different bug entirely.
       */
      ` · tap ${(performance.now() - tappedAt).toFixed(0)}/${(Date.now() - tappedAtWall).toFixed(0)}` +
      (nav ? `\n${netPhases(nav)}` : '');
    const lastLoad = remember(thisLoad);
    const report = `${BUILD_ID}\n${world.bakeSummary}\n${thisLoad}` +
      (lastLoad ? `\nprevious load: ${lastLoad}` : '');
    stamp.textContent = report;

    /*
     * The report also goes into the readout behind the button, because the
     * title card is dismissed the moment the world is ready — a load time
     * written only there is never readable on the device that was slow.
     */
    loadReport = ['', ...report.split('\n')];
  }
  const renderer = new Renderer(canvas);
  const perf = new Performance();
  let showPerf = false;
  const statsButton = document.querySelector<HTMLButtonElement>('#stats');
  const hintPanel = document.querySelector<HTMLElement>('#hint');
  const setPerf = (on: boolean) => {
    showPerf = on;
    statsButton?.setAttribute('aria-pressed', String(on));
    // The hint sits exactly where the readout goes; on a phone they overlap.
    if (hintPanel) hintPanel.style.visibility = on ? 'hidden' : '';
  };
  statsButton?.addEventListener('click', () => setPerf(!showPerf));


  /** Reach out and touch whatever is here — the E key, or the on-screen prompt. */
  const interact = () => {
    if (!game.interact()) return;
    purr();
    // Both come from a tap or a keypress, so we are inside a user gesture and
    // the browser will actually allow the motor to run.
    buzzPurr();
  };

  const ui = new Ui({
    onStart: () => start(),
    onAction: () => interact(),
    onRestart: () => {
      game.restart();
      ui.reset();
      ui.setProgress(0, game.pots.length, game.litRadius);
      game.running = true;
    },
  });

  const game = new Game(world, {
    onPotFound: (found, total) => {
      ui.setProgress(found, total, game.litRadius);
      ui.setPotHint(found, total);
      chime(found - 1);
    },
    onComplete: (seconds) => ui.announceCompletion(seconds),
    onPet: (first) => {
      if (first) ui.note('she does not open her eyes — but she knows you are there');
    },
  });

  const input = new Input(canvas, {
    onEngage: () => start(),
    onRestart: () => {
      game.restart();
      ui.reset();
      ui.setProgress(0, game.pots.length, game.litRadius);
    },
    onTogglePerf: () => setPerf(!showPerf),
    onInteract: () => interact(),
  });

  function start(): void {
    if (!ui.dismissIntro()) return;
    game.running = true;
    // Building the world and baking the first sprites is a one-off cost and
    // must not be mistaken for a slow machine.
    perf.pardonWarmUp();
  }

  /** Cleared on `pagehide`, after which nothing may touch a canvas. */
  let running = true;

  function resize(): void {
    renderer.resize(innerWidth, innerHeight, perf.scale, game.field);
  }

  addEventListener('resize', () => {
    if (!running) return; // the canvases may already have been handed back
    resize();
    renderer.render(game.scene);
  });
  resize();
  ui.setProgress(0, game.pots.length, game.litRadius);

  installDebugPanel(game, {
    togglePerf: () => setPerf(!showPerf),
    isPerfOn: () => showPerf,
    restart: () => {
      game.restart();
      ui.reset();
      ui.setProgress(0, game.pots.length, game.litRadius);
      game.running = true;
    },
  });

  exposeForTests({
    game,
    walkCycle: WALK_CYCLE,
    renderer,
    perf,
    renderOnce: () => renderer.render(game.scene),
    rngEndState: () => rng.seed,
    longestBakeSliceMs: () => world.longestSliceMs,
    isPerfOn: () => showPerf,
    purrStrength,
  });

  /*
   * Give the canvases back before the page goes.
   *
   * `pagehide` rather than `unload`, which mobile browsers may never fire. On a
   * reload the new document can start building while the old one is still
   * resident, and two worlds of canvas at once is more than a phone will grant
   * — it works on the first load and shows a white screen on the second.
   */
  addEventListener('pagehide', () => {
    running = false;
    renderer.dispose(game.field);
    game.herd.dispose();
    world.dispose();
  });

  let last = performance.now();
  function frame(now: number): void {
    if (!running) return;
    const dt = Math.min(MAX_STEP, (now - last) / 1000);
    last = now;

    tickBoil(game.elapsed + dt);
    game.advance(dt, input);
    ui.setAction(game.interaction?.label ?? null);

    const drawStart = performance.now();
    renderer.render(game.scene);
    if (showPerf) {
      const awake = game.herd.animals.reduce((n, a) => n + (a.awake ? 1 : 0), 0);
      const s = renderer.stages;
      const ms = (v: number) => v.toFixed(1).padStart(4);
      drawPerfOverlay(renderer.context, perf.snapshot(), renderer.width, renderer.height, [
        `awake ${awake}/${game.herd.animals.length}   zoom ${game.camera.zoom.toFixed(2)}`,
        `world ${ms(s.worldBlit)}  live ${ms(s.live)}  mask ${ms(s.mask)}`,
        `comp  ${ms(s.composite)}  occl ${ms(s.occluders)}`,
        `bakes ${s.bakes}   canvases ${countCanvases(game)}`,
        hapticStatus(),
        ...loadReport,
      ]);
    }
    perf.recordDraw(performance.now() - drawStart);
    perf.recordFrame(dt * 1000);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  start();
}

/**
 * How many offscreen canvases are alive.
 *
 * Every cached sprite is a texture. Enough of them and the GPU starts evicting
 * and re-uploading the big world layers each frame, which shows up as draw cost
 * that does not fall when you drop the resolution.
 */
function countCanvases(game: Game): number {
  let n = 4; // the two world layers, the scratch canvas and the paper overlay
  n += 1; // the herd's sprite atlas
  n += game.pots.filter((p) => p.frozenSprite).length;
  return n;
}

/** A small kalimba note per pot, tuned up a pentatonic scale as you go. */
let audio: AudioContext | undefined;
function chime(index: number): void {
  try {
    audio ??= new AudioContext();
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
    const frequency = 261.6 * Math.pow(2, scale[index % scale.length] / 12);
    const now = audio.currentTime;
    for (const [harmonic, gain] of [
      [1, 0.18],
      [2, 0.06],
    ]) {
      const osc = audio.createOscillator();
      const envelope = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.value = frequency * harmonic;
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(gain, now + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
      osc.connect(envelope).connect(audio.destination);
      osc.start(now);
      osc.stop(now + 1.2);
    }
  } catch {
    // Audio is a nicety; a browser that refuses it should not stop the game.
  }
}

/**
 * A purr: *murrr … murrr … murrr*.
 *
 * Two things make it a cat rather than an oscillator. The first is the chop —
 * a low rumble whose loudness wobbles about twenty-five times a second, which
 * is roughly the rate a real purr runs at. The second is the phrasing: it is
 * not one long note but three swells of a few seconds each, quiet in between,
 * every one rising and falling on a raised cosine so it has no edges.
 *
 * The chop lives on its own gain node, in series with the phrasing rather than
 * added to it. Wired the other way — the wobble summed into the same parameter
 * that shapes the swell — it keeps modulating a gain of zero, so the quiet
 * seconds are not quiet at all and the whole thing is one continuous drone.
 */
function purr(): void {
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const rumble = audio.createOscillator();
    const depth = audio.createGain();
    const chop = audio.createGain();
    const envelope = audio.createGain();
    const muffle = audio.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.value = 58;
    muffle.type = 'lowpass';
    muffle.frequency.value = 280;

    rumble.type = 'sine';
    rumble.frequency.value = 25;
    depth.gain.value = 0.42;
    chop.gain.value = 0.58;
    rumble.connect(depth).connect(chop.gain);

    // One murrr, sampled finely enough that the curve itself is smooth.
    const swell = new Float32Array(96);
    for (let i = 0; i < swell.length; i++) {
      swell[i] = 0.085 * (0.5 - 0.5 * Math.cos((i / (swell.length - 1)) * Math.PI * 2));
    }
    envelope.gain.setValueAtTime(0, now);
    for (let i = 0; i < MURR_COUNT; i++) {
      envelope.gain.setValueCurveAtTime(swell, now + i * (MURR_SECONDS + MURR_GAP), MURR_SECONDS);
    }

    osc.connect(muffle).connect(chop).connect(envelope).connect(audio.destination);
    const until = now + PURR_SECONDS + 0.1;
    osc.start(now);
    rumble.start(now);
    osc.stop(until);
    rumble.stop(until);
  } catch {
    // As above.
  }
}

/**
 * A blank screen tells you nothing. If the world cannot be built — most likely
 * a phone refusing the canvas memory — say so on the page, where whoever is
 * holding the phone can actually read it.
 */
try {
  await boot();
} catch (error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const note = document.createElement('pre');
  note.style.cssText =
    'position:fixed;inset:12px;z-index:99;margin:0;padding:14px;overflow:auto;' +
    'background:rgba(20,18,15,.9);color:#f0c0c0;border-radius:8px;' +
    'font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap';
  note.textContent =
    `Pencil & Paint could not start.\n\n${message}\n\n` +
    `build ${BUILD_ID}\n` +
    `screen ${innerWidth}x${innerHeight} at dpr ${devicePixelRatio}\n` +
    `${navigator.userAgent}`;
  document.body.append(note);
  throw error;
}
