/**
 * Keeps the frame rate honest by trading resolution for speed, and shows the
 * numbers on demand.
 */

/**
 * The render scale is fixed at 1, and this is load-bearing.
 *
 * The world is a bitmap authored at 1x, and blitting it is the biggest thing in
 * the frame. Only a one-to-one blit is cheap: source pixel to canvas pixel, no
 * resampling, and the compositor handles any device-pixel scaling for free.
 * Measured at 1440x900 on a dpr-2 display, per world blit:
 *
 *   scale 0.5   0.97 ms
 *   scale 1     0.81 ms
 *   scale 1.5   8.88 ms
 *   scale 2    15.89 ms
 *
 * So there is nothing above 1 worth having — an upscale cannot invent detail
 * the bitmap does not hold, and it costs twenty times as much. And there is
 * nothing below 1 worth having either: half resolution is *slower* than full,
 * because it turns a copy into a resample.
 *
 * This used to be an adaptive ladder, which was worse than useless. Every rung
 * was slower than standing still, so a machine that dipped would drop a notch
 * to save time, lose more, and sink to the bottom — arriving at a quarter of
 * the linear resolution AND a slower frame. Warm-up frames were enough to start
 * it off. If the frame is too slow at 1:1, resolution is not the lever.
 */
const RENDER_SCALE = 1;

/** Frames slower than this are counted as dropped (a 60Hz frame is 16.7ms). */
const SLOW_FRAME_MS = 26;

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
  private frameAverage = 0;
  private drawAverage = 0;
  private slowFrames = 0;
  private windowFrames = 0;

  readonly scale = RENDER_SCALE;

  /** Clear the counters; warm-up is not a measurement. */
  pardonWarmUp(): void {
    this.windowFrames = 0;
    this.slowFrames = 0;
  }

  recordDraw(ms: number): void {
    this.drawAverage = this.drawAverage * 0.9 + ms * 0.1;
  }

  /**
   * Real frame time, not how long the canvas calls took to return — canvas work
   * is queued and finishes on the GPU later, so timing the calls under-reports
   * and misses GC pauses entirely.
   */
  recordFrame(dtMs: number): void {
    if (dtMs >= 60) return; // a tab-switch or a breakpoint, not a slow frame
    this.frameAverage = this.frameAverage ? this.frameAverage * 0.92 + dtMs * 0.08 : dtMs;
    if (dtMs > SLOW_FRAME_MS) this.slowFrames++;
    this.windowFrames++;
    if (this.windowFrames >= 600) {
      this.windowFrames = 0;
      this.slowFrames = 0;
    }
  }

  snapshot(): PerfSnapshot {
    return {
      fps: this.frameAverage ? 1000 / this.frameAverage : 0,
      frameMs: this.frameAverage,
      drawMs: this.drawAverage,
      slowFrames: this.slowFrames,
      windowFrames: this.windowFrames,
      scale: this.scale,
      maxScale: RENDER_SCALE,
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
