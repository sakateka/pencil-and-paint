import { BUILD_ID } from './buildInfo';
import { rng } from './core/rng';
import { exposeForTests } from './debug';
import {
  detectLanguage,
  KEYS,
  LANGUAGES,
  list,
  missingKeys,
  setLanguage,
  t,
  translateDom,
  type Lang,
} from './i18n';
import { installDebugPanel } from './debugPanel';
import { purrStrength } from './entities/animals';
import { WALK_CYCLE } from './entities/player';
import { Game } from './game';
import { tickBoil } from './media/ink';
import { yieldToBrowser } from './core/schedule';
import { GRAIN } from './media/sprites';
import { Renderer } from './render/renderer';
import birdsongUrl from './assets/birdsong.mp3';
import pondUrl from './assets/pond.mp3';
import purrUrl from './assets/purr.mp3';
import { buzzPurr, hapticStatus } from './systems/haptics';
import { Sample } from './systems/sample';
import { Input } from './systems/input';
import { drawPerfOverlay, Performance } from './systems/perf';
import { latestDrawing, Studio } from './studio';
import { Ui } from './ui';
import { World } from './world/world';
import { northernSurfaceY, SURFACE } from './world/hills';

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

  /*
   * Language first, before anything is shown.
   *
   * The title card is on screen for the whole bake, so translating it in the
   * Ui — which is not built until the valley is — left it in English for the
   * one part of the session where somebody is definitely reading it.
   */
  setLanguage(detectLanguage());
  translateDom();

  const stamp = document.querySelector<HTMLElement>('#build');
  if (stamp) stamp.textContent = BUILD_ID;

  const startButton = document.querySelector<HTMLButtonElement>('#startBtn');
  const startLabel = startButton?.textContent ?? 'Start walking';

  await firstGesture(startButton);
  const tappedAt = performance.now();
  const tappedAtWall = Date.now();
  if (startButton) {
    startButton.setAttribute('aria-busy', 'true');
    startButton.textContent = t('intro.building', { n: 0 });
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
    startButton.textContent = t('intro.building', { n: Math.round(fraction * 100) });
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
  /*
   * Just do it. What it *was* is the game's business, not this function's.
   *
   * This used to play the purr whenever `interact` returned true, which is a
   * different question from whether a cat was involved — so casting a line at
   * the pond set a cat purring two hundred metres away.
   */
  const interact = () => void game.interact();

  /** Stand up and pack the camp away. Q, or the button beside the prompt. */
  const cancel = () => void game.cancel();

  const ui = new Ui({
    onStart: () => start(),
    onAction: () => interact(),
    onLeave: () => cancel(),
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
      // Here, where it is certainly a cat that was touched. Both are inside the
      // tap or keypress that caused it, so the browser allows the motor to run.
      purrsPlayed++;
      purrSound.play();
      buzzPurr();
      if (first) ui.note('note.firstPet');
    },
    onFishingStart: () => {
      ui.note('note.fire');
      pond.play();
    },
    onFishingEnd: (landed) => {
      ui.showCreel(landed);
      pond.stop();
    },
    onRestStart: (birds) => {
      ui.note(birds ? 'note.restBirds' : 'note.restQuiet');
      if (birds) birdsong.play();
    },
    onRestEnd: () => birdsong.stop(),
    onSitStart: (note) => ui.note(note),
    onSitEnd: (note) => ui.note(note),
    /*
     * Two minutes of sitting still. No chime and no fanfare — a noise would
     * make it an achievement, and it is meant to be something you notice.
     */
    onElephant: () => ui.note('note.elephant', 7000),
    onDraw: () => openStudio(),
    onClimb: (inside) => ui.note(inside ? 'note.climbedIn' : 'note.climbedDown'),
    onCatch: (total) => {
      // Up the same scale the pots used, so the valley keeps one voice.
      chime(total - 1);
      if (total === 1) ui.note('note.firstFish');
    },
  });

  /**
   * Put whatever was last kept onto the easel.
   *
   * Decoded once here and handed to the game, so the frame loop has an image to
   * blit rather than a data URL to parse.
   */
  function refreshEasel(): void {
    const data = latestDrawing();
    if (!data) {
      game.easelPicture = undefined;
      return;
    }
    const image = new Image();
    image.addEventListener('load', () => {
      game.easelPicture = image;
    });
    image.src = data;
  }

  const studio = new Studio((kept) => {
    if (kept) {
      refreshEasel();
      ui.note('note.drew');
    }
    // Give the walker back their keys once the board is closed. While it is
    // open they are somebody standing at an easel, not somebody walking.
    input.suspended = studio.open;
  });

  function openStudio(): void {
    studio.show(game.collectedHues, game.won);
    input.suspended = true;
  }

  // Whatever was kept last time is already on the easel when the world opens —
  // it was only put there on closing the board before, so a reload left the
  // easel showing the drawing somebody else abandoned.
  refreshEasel();

  const input = new Input(canvas, {
    onEngage: () => start(),
    onRestart: () => {
      game.restart();
      ui.reset();
      ui.setProgress(0, game.pots.length, game.litRadius);
    },
    onTogglePerf: () => setPerf(!showPerf),
    onInteract: () => interact(),
    onCancel: () => cancel(),
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
    input,
    renderOnce: () => renderer.render(game.scene),
    build: BUILD_ID,
    snapshot: () => {
      const p = perf.snapshot();
      const d = game.field.lastDirty;
      const c = world.canvasStats();
      const screen = renderer.width * renderer.height;
      const round = (n: number) => Math.round(n * 100) / 100;
      return {
        build: BUILD_ID,
        visible: document.visibilityState === 'visible',
        fps: round(p.fps),
        frameMs: round(p.frameMs),
        simMs: round(p.simMs),
        drawMs: round(p.drawMs),
        otherMs: round(p.otherMs),
        slow: `${p.slowFrames}/${p.windowFrames}`,
        path: renderer.lastFlooded ? 'flooded' : 'composite',
        won: game.won,
        pots: `${game.pots.filter((pot) => pot.found).length}/${game.pots.length}`,
        litRadius: Math.round(game.litRadius),
        maskRadius: Math.round(game.maskRadius),
        view: `${renderer.width}x${renderer.height}`,
        scale: renderer.scale,
        dpr: globalThis.devicePixelRatio || 1,
        zoom: round(game.camera.zoom),
        dirty: `${d.width}x${d.height}`,
        dirtyPctOfScreen: screen ? Math.round((d.width * d.height * 100) / screen) : 0,
        awake: game.herd.animals.reduce((n, a) => n + (a.awake ? 1 : 0), 0),
        canvases: c.tiles + c.sprites,
        canvasMb: c.mb,
        ...Object.fromEntries(Object.entries(renderer.stages).map(([k, v]) => [k, round(v)])),
      };
    },
    probe: (frames = 120) => {
      /*
       * Simulation and drawing timed separately, each as one batch. See the
       * note on `probe` in debug.ts for why batches rather than averages.
       */
      const step = () => game.advance(1 / 60, input);
      let t0 = performance.now();
      for (let i = 0; i < frames; i++) step();
      const simMs = (performance.now() - t0) / frames;
      t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        step();
        renderer.render(game.scene);
      }
      const bothMs = (performance.now() - t0) / frames;
      return {
        frames,
        simMs: Math.round(simMs * 1000) / 1000,
        drawMs: Math.round((bothMs - simMs) * 1000) / 1000,
        totalMs: Math.round(bothMs * 1000) / 1000,
      };
    },
    hillSurface: () => SURFACE,
    northernSurfaceY,
    rngEndState: () => rng.seed,
    longestBakeSliceMs: () => world.longestSliceMs,
    isPerfOn: () => showPerf,
    purrStrength,
    purrsPlayed: () => purrsPlayed,
    i18n: {
      keys: () => KEYS,
      languages: () => Object.keys(LANGUAGES),
      missing: (lang) => missingKeys(lang as Lang),
      setLanguage: (lang) => {
        setLanguage(lang as Lang);
        ui.retranslate();
      },
      say: (key, params) => t(key, params),
      list,
    },
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

    const simStart = performance.now();
    tickBoil(game.elapsed + dt);
    game.advance(dt, input);
    ui.setAction(game.interaction?.say ?? null);
    ui.setLeave(game.leaving);
    /*
     * The purr follows the walker: it fades as you leave her, comes back if you
     * turn around while she is still going, and stops of its own accord once
     * she settles — `purrLoudness` is zero for all three of those.
     */
    purrSound.level = game.purrLoudness;
    if (game.purrLoudness === 0) purrSound.stop();
    purrSound.update(dt);
    birdsong.update(dt);
    pond.update(dt);
    perf.recordSim(performance.now() - simStart);

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
        `purr ${purrSound.status()} · birds ${birdsong.status()} · pond ${pond.status()}`,
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
    if (audio.state === 'suspended') void audio.resume();
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
 * The cat, recorded rather than synthesised.
 *
 * There was a small orchestra here once: an oscillator carrying a harmonic
 * series, two more drifting its pitch, two wobbling its loudness, a fifth
 * chopping it at five hertz, a band-limited noise layer for breath, and a
 * hand-built envelope phrasing the whole thing into three swells. It was an
 * interesting piece of synthesis and it never once sounded like a cat.
 *
 * "Purr (10 sec loopable)" — public domain, via Wikimedia Commons. See
 * CREDITS.md.
 */
const purrSound = new Sample(purrUrl, 0.55, 0.9);

/**
 * And the birds, which were never anything but a recording.
 *
 * Halved once already: from across a field, birdsong is something you notice
 * rather than something you listen to.
 */
const birdsong = new Sample(birdsongUrl, 0.21, 1.4);

/**
 * The water, while you are sitting by it.
 *
 * A still pond, and it took three goes to get there. A pebble beach turned out
 * to be waves breaking. A shallow river turned out to sound exactly like rain —
 * broadband hiss is broadband hiss, whatever the filename says. What a calm
 * pond actually sounds like is barely water at all: birds, insects, a breeze,
 * and the odd small movement.
 *
 * Mixed at a twentieth, where the birds are eight times that — and rolled off
 * above 3.8kHz in the file itself, which is the other half of the job. A sound
 * gets its presence as much from its top end as from its level: turning it down
 * makes it quieter, taking the highs off makes it further away, and what this
 * wants to be is further away.
 *
 * Turned down three times before it stopped being noticeable. It plays for as
 * long as somebody sits with a rod, and ambience you notice is too loud.
 */
const pond = new Sample(pondUrl, 0.05, 2.6);

/**
 * How many purrs have been played.
 *
 * Only the test suite reads this, and it earns its place: a sound playing when
 * it should not is invisible to every other kind of assertion. Casting a line
 * at the pond once set the cat purring, and nothing but a count would have
 * caught it.
 */
let purrsPlayed = 0;


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
