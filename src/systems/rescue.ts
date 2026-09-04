/**
 * Getting the acceleration back, without asking anybody to open about:config.
 *
 * Firefox draws this game on the GPU until it decides not to. It keeps a cache
 * of the paths and textures a canvas uses, watches how often that cache misses,
 * and if misses dominate for ten frames it hands the canvas to the software
 * rasteriser — permanently. Not for a moment, not until things calm down: for
 * the life of that canvas. A player sees a game that ran at 60fps quietly become
 * a game that runs at 30 and never recovers, usually while they were standing
 * still doing nothing at all.
 *
 * The prevention is everywhere else in this codebase — baked sprites instead of
 * fresh paths, see `render/colorField.ts` and `media/sprites.ts`. This is the
 * other half: noticing that it happened anyway, and getting out of it. The
 * decision is per canvas and is forgotten when the canvas is, so a fresh one
 * starts accelerated again. Rebuilding it costs a frame.
 *
 * The alternative was what the player was actually doing: editing
 * `gfx.canvas.accelerated.cache-size` in about:config, which is not something a
 * cosy game about painting a valley may ask of anyone.
 */

/** Frames in the rolling window. About a second and a half at 60fps. */
const WINDOW = 90;

/**
 * A median above this is not a 60Hz frame any more.
 *
 * The median, not the mean and not the worst: one 40ms frame is a hiccup and
 * happens on healthy machines, while the fallback moves *every* frame at once —
 * the reports that started this all had 30ms as the new normal. So the question
 * is what a typical frame looks like now, and half the window being over 21ms
 * cannot happen at 60fps.
 */
const SOFT_MS = 21;

/** Below this the canvas is drawing at frame rate and there is nothing to do. */
const CALM_MS = 18.5;

/** How long after a rebuild before the window means anything again. */
const SETTLE_MS = 2500;

/** Quiet at startup: the first seconds bake sprites and are slow on purpose. */
const WARM_UP_MS = 6000;

/**
 * How many times to try before living with it.
 *
 * A machine that is simply too slow to draw this game will trip the same test
 * for ever, and rebuilding the canvas at it once a second would be its own
 * stutter. Four attempts is enough for the fallback — which in every report so
 * far arrived once and stayed — and few enough to be unnoticeable if the
 * diagnosis is wrong.
 */
const MAX_ATTEMPTS = 4;

/** Anything longer than this is a tab-switch or a breakpoint, not a frame. */
const NOT_A_FRAME_MS = 100;

/** How often the window is actually sorted. Once every this many frames. */
const CHECK_EVERY = 30;

export class Rescue {
  private readonly window: number[] = [];
  private sinceCheck = 0;
  private quietUntil: number;

  /** How many times the canvas has been rebuilt this session. */
  attempts = 0;

  /** When the last rebuild happened, in seconds since load. Zero for never. */
  lastAt = 0;

  /** The median frame time the last check saw. For the readout. */
  median = 0;

  constructor(
    private readonly rebuild: () => void,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.quietUntil = this.now() + WARM_UP_MS;
  }

  /** Start the quiet period again — the world has just been rebuilt or restarted. */
  pardonWarmUp(): void {
    this.window.length = 0;
    this.quietUntil = this.now() + WARM_UP_MS;
  }

  /** One frame's time, in milliseconds, exactly as the loop measured it. */
  frame(ms: number): void {
    if (ms > NOT_A_FRAME_MS) return;
    this.window.push(ms);
    if (this.window.length > WINDOW) this.window.shift();
    if (++this.sinceCheck < CHECK_EVERY) return;
    this.sinceCheck = 0;
    this.check();
  }

  private check(): void {
    if (this.window.length < WINDOW) return;
    const sorted = [...this.window].sort((a, b) => a - b);
    this.median = sorted[sorted.length >> 1];
    if (this.median < CALM_MS) return;
    if (this.median < SOFT_MS) return;
    const now = this.now();
    if (now < this.quietUntil) return;
    if (this.attempts >= MAX_ATTEMPTS) return;
    this.attempts++;
    this.lastAt = Math.round(now) / 1000;
    this.window.length = 0;
    this.quietUntil = now + SETTLE_MS;
    this.rebuild();
  }

  /** Rebuild now, whatever the numbers say. For the debug console. */
  force(): void {
    this.attempts++;
    this.lastAt = Math.round(this.now()) / 1000;
    this.window.length = 0;
    this.quietUntil = this.now() + SETTLE_MS;
    this.rebuild();
  }

  /** One line for the performance overlay. */
  status(): string {
    const median = this.median ? `${this.median.toFixed(1)}ms` : '—';
    if (!this.attempts) return `canvas original · median ${median}`;
    return `canvas rebuilt ${this.attempts}x (last ${this.lastAt.toFixed(0)}s) · median ${median}`;
  }
}
