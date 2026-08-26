/**
 * Keeps the frame rate honest by trading resolution for speed, and shows the
 * numbers on demand.
 */

/**
 * Capped at 1.25 deliberately. The world is a bitmap authored at 1x and it is by
 * far the biggest thing drawn each frame; rendering it at 2x device pixels costs
 * four times the fill rate and adds no detail at all, because it is a plain
 * upscale. Only the vector overlays gain, and not nearly enough to pay for it.
 */
const SCALES = [0.7, 0.85, 1, 1.25] as const;

/** Frames slower than this are counted as dropped (a 60Hz frame is 16.7ms). */
const SLOW_FRAME_MS = 26;

/** Frames per adaptation window. */
const WINDOW = 90;

/** Drop a notch if more than this many frames in a window were slow. */
const SLOW_BUDGET = 18;

export interface PerfSnapshot {
  fps: number;
  frameMs: number;
  drawMs: number;
  slowFrames: number;
  windowFrames: number;
  scale: number;
  maxScale: number;
  devicePixelRatio: number;
}

export class Performance {
  private index: number;
  private readonly ceiling: number;
  private readonly startIndex: number;

  private frameAverage = 0;
  private drawAverage = 0;
  private slowFrames = 0;
  private windowFrames = 0;
  private settleUntil = 0;
  private goodWindows = 0;

  constructor() {
    const dpr = globalThis.devicePixelRatio || 1;
    let ceiling = 0;
    while (ceiling + 1 < SCALES.length && SCALES[ceiling + 1] <= dpr) ceiling++;
    this.ceiling = ceiling;
    this.index = Math.min(2, ceiling);
    this.startIndex = this.index;
  }

  get scale(): number {
    return SCALES[Math.min(this.index, this.ceiling)];
  }

  /** Give the first seconds of play a pass; warm-up is not a slow machine. */
  pardonWarmUp(elapsed: number): void {
    this.windowFrames = 0;
    this.slowFrames = 0;
    this.settleUntil = elapsed + 2;
  }

  recordDraw(ms: number): void {
    this.drawAverage = this.drawAverage * 0.9 + ms * 0.1;
  }

  /**
   * Adapt on real frame time, not on how long the canvas calls took to return.
   * Canvas work is queued and finishes on the GPU later, so timing the calls
   * under-reports the true cost and misses GC pauses entirely — which is exactly
   * the kind of stutter you feel but a call-timer never sees.
   *
   * Returns true if the resolution changed and the canvases need resizing.
   */
  recordFrame(dtMs: number, elapsed: number): boolean {
    if (dtMs < 60) {
      // Anything longer is a tab-switch or a breakpoint, not a slow frame.
      this.frameAverage = this.frameAverage ? this.frameAverage * 0.92 + dtMs * 0.08 : dtMs;
      if (dtMs > SLOW_FRAME_MS) this.slowFrames++;
    }
    this.windowFrames++;

    if (elapsed < 4 || this.windowFrames < WINDOW || elapsed < this.settleUntil) return false;

    const slow = this.slowFrames;
    this.windowFrames = 0;
    this.slowFrames = 0;

    if (slow > SLOW_BUDGET && this.index > 0) {
      this.index--;
      this.settleUntil = elapsed + 4;
      this.goodWindows = 0;
      return true;
    }
    if (slow === 0 && this.index < this.startIndex) {
      // Recover from a transient dip, but never climb past where we began, so
      // it settles rather than hunting up and down.
      if (++this.goodWindows >= 2) {
        this.index++;
        this.settleUntil = elapsed + 6;
        this.goodWindows = 0;
        return true;
      }
    } else if (slow > 2) {
      this.goodWindows = 0;
    }
    return false;
  }

  snapshot(): PerfSnapshot {
    return {
      fps: this.frameAverage ? 1000 / this.frameAverage : 0,
      frameMs: this.frameAverage,
      drawMs: this.drawAverage,
      slowFrames: this.slowFrames,
      windowFrames: this.windowFrames,
      scale: this.scale,
      maxScale: SCALES[this.ceiling],
      devicePixelRatio: globalThis.devicePixelRatio || 1,
    };
  }
}

/** The readout behind the F key. If it ever stutters, this says why. */
export function drawPerfOverlay(
  ctx: CanvasRenderingContext2D,
  perf: PerfSnapshot,
  viewportWidth: number,
  viewportHeight: number,
  extra: readonly string[],
): void {
  const lines = [
    `fps ${perf.fps.toFixed(0)}   frame ${perf.frameMs.toFixed(1)}ms`,
    `draw ${perf.drawMs.toFixed(2)}ms   slow ${perf.slowFrames}/${perf.windowFrames}`,
    `scale ${perf.scale} (max ${perf.maxScale}, dpr ${perf.devicePixelRatio})`,
    ...extra,
  ];

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(perf.scale, perf.scale);
  ctx.font = '13px ui-monospace, Menlo, Consolas, monospace';
  ctx.textBaseline = 'top';

  let width = 0;
  for (const line of lines) width = Math.max(width, ctx.measureText(line).width);
  width = Math.ceil(width) + 20;
  const height = lines.length * 17 + 14;
  const x = 12;
  const y = viewportHeight - height - 12;

  ctx.fillStyle = 'rgba(20,18,15,.82)';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = '#d8f0c0';
  lines.forEach((line, i) => ctx.fillText(line, x + 10, y + 8 + i * 17));
  ctx.restore();
  void viewportWidth;
}
