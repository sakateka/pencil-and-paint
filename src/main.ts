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
import { birdsongStatus, startBirdsong, stopBirdsong, updateBirdsong } from './systems/birdsong';
import { buzzPurr, hapticStatus } from './systems/haptics';
import { Input } from './systems/input';
import { drawPerfOverlay, Performance } from './systems/perf';
import { latestDrawing, Studio } from './studio';
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
      purr();
      buzzPurr();
      if (first) ui.note('note.firstPet');
    },
    onFishingStart: () => ui.note('note.fire'),
    onFishingEnd: (landed) => ui.showCreel(landed),
    onRestStart: (birds) => {
      ui.note(birds ? 'note.restBirds' : 'note.restQuiet');
      if (birds) startBirdsong();
    },
    onRestEnd: () => stopBirdsong(),
    onDraw: () => openStudio(),
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
    studio.show(game.collectedHues);
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
    rngEndState: () => rng.seed,
    longestBakeSliceMs: () => world.longestSliceMs,
    isPerfOn: () => showPerf,
    purrStrength,
    buildPurr,
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

    tickBoil(game.elapsed + dt);
    game.advance(dt, input);
    ui.setAction(game.interaction?.say ?? null);
    ui.setLeave(game.fishing.active || game.rest.resting);
    updateBirdsong(dt);
    // The purr follows the walker: it fades as you leave her and comes back if
    // you turn around while she is still going.
    setPurrLevel(game.purrLoudness);

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
        birdsongStatus(),
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
 * The chest resonance itself. Everything else is shaping on top of this.
 *
 * Real cats purr somewhere between 20 and 35 times a second, so this is free to
 * move within that range — and where it sits decides what a small speaker can
 * do with it. Every harmonic moves with it, so nudging the pitch up carries the
 * whole sound towards the range a phone can reproduce without touching the
 * harmonic ratios, which are what the voice actually is.
 *
 * Measured energy, by band:
 *
 *              100-300Hz   300-800Hz
 *     28Hz       0.0129      0.0016
 *     34Hz       0.0161      0.0029     <- here
 *     40Hz       0.0190      0.0045
 *
 * 34 is the cautious end of that: still squarely a cat, three semitones up, and
 * nearly twice the energy where a telephone lives. Put it back to 28 and the
 * voice is exactly the one tuned by ear on headphones.
 */
const PURR_FUNDAMENTAL = 34;

/** Loudest the purr ever gets. It is meant to be close and quiet, not loud. */
const PURR_PEAK = 0.09;

/**
 * How much purr is left between the swells.
 *
 * Not zero, which is the point. A cat does not stop and start three times; it
 * purrs continuously and the intensity rises three times. Silence in the gaps
 * turns one animal into three separate noises.
 */
const PURR_RESIDUAL = 0.13;

/**
 * The swells are not identical, because nothing alive repeats itself exactly.
 * Fixed rather than random: she should sound the same every time you stroke her.
 */
const SWELL_WEIGHT = [1, 1.05, 0.955];

/**
 * The purr's intensity across its whole length, in [PURR_RESIDUAL, ~1].
 *
 * Each swell is a raised cosine, but wider than the visible one so the body of
 * it is rounded and the tails very nearly meet — between two swells the level
 * dips to the residual for a moment rather than falling away to nothing.
 */
function purrShape(samples: number): Float32Array {
  const shape = new Float32Array(samples);
  const cycle = MURR_SECONDS + MURR_GAP;
  const half = MURR_SECONDS * 0.62;
  for (let i = 0; i < samples; i++) {
    const t = (i / (samples - 1)) * PURR_SECONDS;
    let level = PURR_RESIDUAL;
    for (let k = 0; k < MURR_COUNT; k++) {
      const distance = Math.abs(t - (k * cycle + MURR_SECONDS / 2));
      if (distance >= half) continue;
      level +=
        (1 - PURR_RESIDUAL) *
        SWELL_WEIGHT[k % SWELL_WEIGHT.length] *
        (0.5 + 0.5 * Math.cos((distance / half) * Math.PI));
    }
    shape[i] = level;
  }
  return shape;
}

/**
 * Body noise: the sound of an animal breathing, not of an oscillator.
 *
 * Generated once and kept. Seeded rather than `Math.random` for two reasons —
 * she should sound the same every time, and the world's own generator must not
 * be touched, since the tests fingerprint where it ends up. The one-pole filter
 * takes the hiss off before it is ever heard; what is left is body, not air.
 */
let purrNoise: AudioBuffer | undefined;
function bodyNoise(ctx: BaseAudioContext): AudioBuffer {
  // Keyed on the rate: a buffer made for the live context is the wrong length
  // for an offline one rendering at a different rate.
  if (purrNoise?.sampleRate === ctx.sampleRate) return purrNoise;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x9e3779b9;
  let smoothed = 0;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    smoothed += (seed / 2147483648 - 1 - smoothed) * 0.06;
    data[i] = smoothed * 3;
  }
  purrNoise = buffer;
  return buffer;
}

/** The purr currently sounding, faded out if she is stroked again. */
let purring: GainNode | undefined;

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
 * A purr: *prrrrrrrr*.
 *
 * Not a voice — a cat purring is a chest vibrating, and it is built here as
 * one. A 28Hz fundamental with a weak second harmonic and a trace of a third,
 * which is below what a phone can reproduce at all; what you hear on a small
 * speaker is the harmonics and the flutter, and what you hear on headphones is
 * the rumble underneath them.
 *
 * Four things keep it from sounding synthetic:
 *
 *   - it never stops. The three swells ride on a residual that carries through
 *     the gaps, so it is one animal getting more pleased three times.
 *   - the pitch drifts a few percent, slowly, from two detuned oscillators that
 *     never line up; the loudness wanders by a similar amount on two more.
 *   - a shallow 5Hz flutter, the motor underneath the purr. Shallow is the
 *     whole point: any deeper and it is a tremolo pedal.
 *   - the same flutter opens the filter a little, so she is fractionally
 *     brighter at the top of each pulse — richer when she means it.
 */
export function buildPurr(ctx: BaseAudioContext, destination: AudioNode, now: number): GainNode {
  const until = now + PURR_SECONDS + 0.2;

  const chest = ctx.createOscillator();
  /*
   * One oscillator for the whole harmonic series, so it drifts as a unit and
   * stays locked in phase — separate oscillators beat against each other.
   *
   * The upper harmonics are what make it *rrrr* rather than *mmmm*. Twenty-eight
   * times a second is below the pitch the ear will hear as a note, so what it
   * hears instead is each individual pulse — and how rough that roll sounds
   * depends entirely on how sharp the pulses are. Three harmonics gave a smooth
   * hum; nine give it a roll, and cost nothing in level, since the wave is
   * normalised.
   *
   * These nine numbers were found by ear and they are easy to overshoot. As a
   * rough measure of roughness — the rms distance the waveform travels sample
   * to sample, against its own size, where a bare sine would score 0.011:
   *
   *     0.017  three harmonics and a bit: warm, not quite a roll
   *     0.020  these
   *     0.033  a long harmonic tail: too rough
   *     0.050  the same with a resonance at 430Hz: sounds like a bottle
   *
   * Everything above about 0.025 stopped sounding like a cat.
   */
  chest.setPeriodicWave(
    ctx.createPeriodicWave(
      new Float32Array(10),
      new Float32Array([0, 1, 0.45, 0.26, 0.17, 0.12, 0.09, 0.068, 0.05, 0.038]),
    ),
  );
  chest.frequency.value = PURR_FUNDAMENTAL;

  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.Q.value = 0.7;

  const flutter = ctx.createGain();
  flutter.gain.value = 0.86;
  const shimmer = ctx.createGain();
  shimmer.gain.value = 1;
  const swell = ctx.createGain();
  const master = ctx.createGain();
  master.gain.value = 1;

  /** A slow oscillator wired into someone else's parameter. */
  const modulate = (rate: number, depth: number, target: AudioParam) => {
    const lfo = ctx.createOscillator();
    const amount = ctx.createGain();
    lfo.frequency.value = rate;
    amount.gain.value = depth;
    lfo.connect(amount).connect(target);
    lfo.start(now);
    lfo.stop(until);
    return lfo;
  };

  // Pitch drift: two rates that do not divide into each other, so the sum
  // never settles into a pattern the ear can follow. About ±3% all told.
  modulate(0.13, PURR_FUNDAMENTAL * 0.02, chest.frequency);
  modulate(0.31, PURR_FUNDAMENTAL * 0.012, chest.frequency);
  // Loudness wander, ±7.5%.
  modulate(0.7, 0.045, shimmer.gain);
  modulate(1.9, 0.03, shimmer.gain);
  // The motor: 5.2Hz, 14% deep, and a touch of the same rhythm on the filter.
  const motor = modulate(5.2, 0.14, flutter.gain);
  const colour = ctx.createGain();
  colour.gain.value = 26;
  motor.connect(colour).connect(body.frequency);

  const shape = purrShape(1024);
  const level = new Float32Array(shape.length);
  const brightness = new Float32Array(shape.length);
  for (let i = 0; i < shape.length; i++) {
    const t = (i / (shape.length - 1)) * PURR_SECONDS;
    // No click at either end: in over a moment, out over half a second.
    const fade = Math.min(1, t / 0.12, (PURR_SECONDS - t) / 0.5);
    level[i] = PURR_PEAK * shape[i] * fade;
    // Dull and distant at the residual, open at the peak. The cutoff has to
    // clear the upper harmonics at the top of a swell or the roll is filtered
    // straight back off again, which is what 330 was doing.
    brightness[i] = 105 + 415 * ((shape[i] - PURR_RESIDUAL) / (1 - PURR_RESIDUAL));
  }
  swell.gain.setValueAtTime(0, now);
  swell.gain.setValueCurveAtTime(level, now, PURR_SECONDS);
  body.frequency.setValueCurveAtTime(brightness, now, PURR_SECONDS);

  // Breath and body, a good 25dB under everything else, and joined after the
  // flutter so it is not chopped along with the purr.
  const breath = ctx.createBufferSource();
  breath.buffer = bodyNoise(ctx);
  breath.loop = true;
  const breathHigh = ctx.createBiquadFilter();
  breathHigh.type = 'highpass';
  breathHigh.frequency.value = 80;
  const breathLow = ctx.createBiquadFilter();
  breathLow.type = 'lowpass';
  breathLow.frequency.value = 400;
  const breathLevel = ctx.createGain();
  breathLevel.gain.value = 0.055;
  breath.connect(breathHigh).connect(breathLow).connect(breathLevel).connect(swell);
  breath.start(now);
  breath.stop(until);

  chest.connect(body).connect(flutter).connect(shimmer).connect(swell);
  swell.connect(master).connect(destination);
  chest.start(now);
  chest.stop(until);

  chest.onended = () => {
    if (purring === master) purring = undefined;
    master.disconnect();
  };
  return master;
}

/** The level the purr was last set to, so a still walker is not re-scheduling. */
let purrLevel = 1;

/**
 * How loud she is from where you are standing.
 *
 * Called every frame while a purr is sounding. `setTargetAtTime` rather than a
 * plain assignment: stepping a gain sixty times a second is sixty tiny
 * discontinuities, which is audible as a crackle on exactly the kind of quiet
 * low sound this is.
 */
function setPurrLevel(level: number): void {
  if (!purring || !audio) return;
  if (Math.abs(level - purrLevel) < 0.02) return;
  purrLevel = level;
  purring.gain.setTargetAtTime(level, audio.currentTime, 0.09);
}

/** Play one, replacing whichever is already sounding. */
function purr(): void {
  try {
    audio ??= new AudioContext();
    /*
     * A context can be suspended and stay that way.
     *
     * Mobile browsers start one suspended unless it was created inside a
     * gesture, and suspend a running one when the page goes to the background.
     * Either way it never resumes on its own, so every node after it renders
     * into nothing — the graph is perfect and the phone is silent.
     */
    if (audio.state === 'suspended') void audio.resume();
    const now = audio.currentTime;

    // Stroking her again restarts the purr rather than stacking a second one
    // on top of the first, which doubles the volume and beats against itself.
    if (purring) {
      const old = purring;
      old.gain.cancelScheduledValues(now);
      old.gain.setValueAtTime(old.gain.value, now);
      old.gain.linearRampToValueAtTime(0, now + 0.18);
    }
    purring = buildPurr(audio, audio.destination, now);
    purrLevel = 1;
    purrsPlayed++;
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
