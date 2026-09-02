import { BUILD_ID } from './buildInfo';
import { rng } from './core/rng';
import { exposeForTests } from './debug';
import {
  detectLanguage,
  KEYS,
  LANGUAGES,
  list,
  missingKeys,
  onLanguageChange,
  setLanguage,
  t,
  translateDom,
  type Lang,
} from './i18n';
import { installDebugPanel } from './debugPanel';
import { purrStrength } from './entities/animals';
import { WALK_CYCLE } from './entities/player';
import { Game } from './game';
import { boilTick, tickBoil } from './media/ink';
import { yieldToBrowser } from './core/schedule';
import { Renderer } from './render/renderer';
import birdsongUrl from './assets/birdsong.mp3';
import cuckooIntroUrl from './assets/cuckoo-intro.mp3';
import pondUrl from './assets/pond.mp3';
import purrUrl from './assets/purr.mp3';
import owlHootUrl from './assets/owl-great-horned.mp3';
import { buzzPurr, hapticStatus } from './systems/haptics';
import { Sample } from './systems/sample';
import { CuckooAmbience } from './systems/cuckoo';
import { Input } from './systems/input';
import { drawPerfOverlay, Performance } from './systems/perf';
import { PAINTINGS } from './assets/paintings/index';
import { Closer } from './closer';
import { latestDrawing, Studio } from './studio';
import { Ui } from './ui';
import { World } from './world/world';
import { northernSurfaceY, SURFACE } from './world/hills';

/**
 * Wait for a moment the browser is not busy.
 *
 * `requestIdleCallback` where it exists, a short timer where it does not —
 * Safari has never shipped it. The timeout on the idle request matters: without
 * one, a page that never goes idle never runs the callback at all.
 */
function whenIdle(timeout = 2000): Promise<void> {
  return new Promise((resolve) => {
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
      .requestIdleCallback;
    if (idle) idle(() => resolve(), { timeout });
    else setTimeout(resolve, 120);
  });
}

/**
 * Bring in the paintings once the last pot is found.
 *
 * The collection appears on the easel at the end, and its images were fetched
 * when it opened — which is the one moment somebody is waiting to look at them.
 *
 * Everything about this is deliberately unhurried. It starts after the colour
 * has finished flooding the page, because that sweep is the one animation in
 * the game nobody should see stutter. It takes one image at a time, waiting for
 * an idle moment before each. And it decodes off the main thread, which is the
 * whole difference between preparing an image and dropping a frame.
 */
let paintingsFetched = false;
async function fetchPaintings(): Promise<void> {
  if (paintingsFetched) return;
  paintingsFetched = true;
  await new Promise((resolve) => setTimeout(resolve, FLOOD_SETTLE_MS));
  for (const painting of PAINTINGS) {
    for (const url of [painting.thumb, painting.full]) {
      await whenIdle();
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      // A painting that will not load is the easel's problem, later, and not
      // worth breaking the ending over.
      await image.decode().catch(() => undefined);
    }
  }
}

/** Long enough for the ending's colour sweep to finish before anything else starts. */
const FLOOD_SETTLE_MS = 4000;

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
      `script ${ms(nav && nav.domContentLoadedEventStart - nav.responseEnd)}` +
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
      cuckoo.stop();
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
    onComplete: (seconds) => {
      ui.announceCompletion(seconds);
      void fetchPaintings();
    },
    onPet: (first) => {
      // Here, where it is certainly a cat that was touched. Both are inside the
      // tap or keypress that caused it, so the browser allows the motor to run.
      purrsPlayed++;
      playPurr();
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
    onSitStart: (note) => {
      ui.note(note);
      if (note === 'note.lainHay' && game.won) cuckoo.play();
    },
    onSitEnd: (note) => {
      ui.note(note);
      if (note === 'note.leftHay') cuckoo.stop();
    },
    /*
     * Two minutes of sitting still. No chime and no fanfare — a noise would
     * make it an achievement, and it is meant to be something you notice.
     */
    onElephant: () => ui.note('note.elephant', 7000),
    onHedgehog: () => ui.note('note.hedgehog', 6000),
    onDraw: () => openStudio(),
    onLookCloser: (subject) => {
      closer.show(subject);
      input.suspended = true;
    },
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

  /*
   * Leaning in on something takes the walker's keys the same way the drawing
   * board does, and hands them back on the way out. Q and Escape already close
   * whatever is open, so nothing else is needed to get out of it.
   */
  const closer = new Closer(() => {
    input.suspended = false;
  });
  onLanguageChange(() => closer.retranslate());

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
      cuckoo.stop();
      game.restart();
      ui.reset();
      ui.setProgress(0, game.pots.length, game.litRadius);
    },
    onTogglePerf: () => setPerf(!showPerf),
    onInteract: () => interact(),
    onCancel: () => cancel(),
  });

  let owlHoot: HTMLAudioElement | undefined;
  canvas.addEventListener('click', (event) => {
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * renderer.width;
    const y = ((event.clientY - box.top) / box.height) * renderer.height;
    const size = game.owl.scale * game.camera.zoom;
    const dx = (x - game.camera.toScreenX(game.owl.x)) / (18 * size);
    const dy = (y - (game.camera.toScreenY(game.owl.y) - 16 * size)) / (22 * size);
    if (!game.won || !game.owlInReach() || dx * dx + dy * dy > 1 || !game.owl.hoot()) return;

    if (!owlHoot) {
      owlHoot = new Audio(owlHootUrl);
      owlHoot.preload = 'auto';
      owlHoot.volume = 0.85;
      owlHoot.dataset.sound = 'owl-hoot';
      owlHoot.dataset.level = String(owlHoot.volume);
      owlHoot.style.display = 'none';
      document.body.append(owlHoot);
    }
    owlHoot.currentTime = 0;
    void owlHoot.play().catch(() => undefined);
  });

  /*
   * The cat, touched on the canvas the way the owl is.
   *
   * She used to answer the E key, like everything else that is within reach —
   * but petting is the one moment in the valley where touch is the whole
   * point, and a keypress is not a stroke. The click has to land on her (an
   * ellipse around her sleeping shape, generous as the owl's) and the walker
   * has to be close enough to reach her, which the game is asked, not
   * measured here. Everything else — the purr, the hearts, the buzz — follows
   * from `pet`, the way it always did.
   */
  canvas.addEventListener('click', (event) => {
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * renderer.width;
    const y = ((event.clientY - box.top) / box.height) * renderer.height;
    const cat = game.catInReach();
    if (!cat) return;
    const size = cat.scale * game.camera.zoom;
    const dx = (x - game.camera.toScreenX(cat.x)) / (19 * size);
    const dy = (y - (game.camera.toScreenY(cat.y) - 10 * size)) / (16 * size);
    if (dx * dx + dy * dy > 1) return;
    game.pet();
  });

  function start(): void {
    if (!ui.dismissIntro()) return;
    game.running = true;
    // Building the world and baking the first sprites is a one-off cost and
    // must not be mistaken for a slow machine.
    perf.pardonWarmUp();
    void fetchSounds();
  }

  /**
   * Fetch the small recordings once the valley is up.
   *
   * Not at load — see the note in `systems/sample.ts` about keeping a hundred
   * kilobytes off the critical path for sounds most sessions never hear. But
   * fetching them the moment they are *wanted* means the first purr, the first
   * birdsong and the first pond each stutter, and each of those is a moment
   * something is happening.
   *
   * One at a time, and only when the browser has nothing better to do: four at
   * once compete for the same connection at exactly the point the page is
   * trying to become responsive, and the world bake is still finishing.
   */
  async function fetchSounds(): Promise<void> {
    for (const sample of [birdsong, pond, cuckoo]) {
      await whenIdle();
      if (!running) return;
      await sample.preload();
    }
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
    cuckoo,
    boilTick,
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
    report: async (frames = 90) => {
      /*
       * Watched, not driven: the page's own loop is the only place a frame can
       * be measured honestly, so the report simply waits for some to happen.
       * Nothing here steps the world, so asking is free of side effects.
       */
      const watched: Record<string, number> = (await globalThis.pencil?.probe(frames)) ?? {};
      const p = perf.snapshot();
      const drawMs = watched.drawMs ?? p.drawMs;
      const simMs = watched.simMs ?? p.simMs;
      const frameMs = watched.frameMs ?? p.frameMs;
      const fps = watched.fps ?? p.fps;
      const snap = globalThis.pencil?.snapshot() ?? {};
      /*
       * Which third of the frame is at fault, stated rather than implied. The
       * rules are the ones written out over `otherMs` in systems/perf.ts.
       */
      const verdict =
        fps > 50
          ? 'healthy — a large `other` here is idle time, not work'
          : drawMs > frameMs * 0.4
            ? 'the renderer: drawing is most of a slow frame'
            : simMs > frameMs * 0.4
              ? 'the simulation: game.advance is most of a slow frame'
              : 'NOT this codebase — the main thread finishes early and something '
                + 'outside it sets the pace (compositing, vsync, the tab)';

      const nav = navigator as Navigator & { deviceMemory?: number };
      return JSON.stringify(
        {
          build: BUILD_ID,
          at: new Date().toISOString(),
          verdict,
          env: {
            ua: navigator.userAgent,
            dpr: globalThis.devicePixelRatio || 1,
            viewport: `${renderer.width}x${renderer.height}`,
            screen: `${screen.width}x${screen.height}`,
            cores: nav.hardwareConcurrency ?? null,
            memoryGb: nav.deviceMemory ?? null,
            visible: document.visibilityState === 'visible',
          },
          frame: snap,
          watched,
          bake: {
            summary: world.bakeSummary,
            longestSliceMs: world.longestSliceMs,
            rngEnd: rng.seed,
          },
        },
        null,
        1,
      );
    },
    probe: (frames = 120) =>
      new Promise((resolve) => {
        // Real frames through the page's own loop. See debug.ts for why.
        const started = performance.now();
        const from = { ...perf.snapshot() };
        let seen = 0;
        const tick = (): void => {
          seen++;
          if (seen < frames) {
            requestAnimationFrame(tick);
            return;
          }
          const wall = performance.now() - started;
          const to = perf.snapshot();
          const r3 = (n: number) => Math.round(n * 1000) / 1000;
          resolve({
            frames: seen,
            seconds: r3(wall / 1000),
            fps: r3((seen * 1000) / wall),
            frameMs: r3(wall / seen),
            simMs: r3(to.simMs),
            drawMs: r3(to.drawMs),
            otherMs: r3(Math.max(0, wall / seen - to.simMs - to.drawMs)),
            slowFramesBefore: from.slowFrames,
            slowFramesAfter: to.slowFrames,
          });
        };
        requestAnimationFrame(tick);
      }),
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
    // Test clocks (and a resumed tab) can move performance.now() backwards;
    // never let that rewind the simulation.
    const dt = Math.min(MAX_STEP, Math.max(0, (now - last) / 1000));
    last = now;

    const simStart = performance.now();
    tickBoil(game.elapsed + dt);
    game.advance(dt, input);
    ui.setAction(game.interaction?.say ?? null);
    ui.setLeave(game.leaving);
    birdsong.update(dt);
    pond.update(dt);
    cuckoo.update(dt);
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
        `purr ${purr ? (purr.paused ? 'idle' : `playing ${purr.volume.toFixed(2)}`) : 'unloaded'} · birds ${birdsong.status()} · pond ${pond.status()}`,
        `cuckoo ${cuckoo.status()}`,
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
 *
 * One phrase per stroke, four seconds of it, and the file is the whole story:
 * its swell and its settle are recorded into it, it does not loop, and nothing
 * is faded through the browser. That last part is not for want of trying —
 * moving a sound's volume fifty times a second stepped audibly, a fizz of
 * clicks whenever the level changed, and a loop clicked at its seam in every
 * codec it was tried as. A purr is a phrase: it starts when she is stroked,
 * plays itself out, and finishes wherever the walker has got to by then.
 */
let purr: HTMLAudioElement | undefined;
function playPurr(): void {
  if (!purr) {
    purr = new Audio(purrUrl);
    purr.preload = 'auto';
    purr.volume = 0.55;
    purr.dataset.sound = 'purr.mp3';
    purr.dataset.level = String(purr.volume);
    purr.style.display = 'none';
    document.body.append(purr);
  }
  // From the top each time: every stroke is a new murrr, not a resume of the
  // last one.
  purr.currentTime = 0;
  void purr.play().catch(() => undefined);
}

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
 * The forest heard from the haystack once every colour has been found.
 *
 * Only its first eighteen seconds live in the game. The matching three-minute
 * recording is streamed from Freesound after somebody lies down, then takes
 * over during a five-second crossfade and loops when it eventually runs out.
 */
const cuckoo = new CuckooAmbience(
  cuckooIntroUrl,
  'https://cdn.freesound.org/previews/866/866207_5828667-hq.mp3',
  0.05,
  2.6,
  { startAt: 116, level: 0.7 },
);

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
