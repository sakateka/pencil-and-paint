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

/**
 * Frames worth keeping a full record of. Below the dropped-frame threshold on
 * purpose: a frame at 20ms has already missed vsync and is part of the stutter,
 * and by the time one is bad enough to count as dropped the interesting
 * question is what the ones before it were doing.
 */
const WATCH_FRAME_MS = 20;

/** How many bad frames to keep. Enough to see whether they agree with each other. */
const WORST_KEPT = 8;

/**
 * Quiet period after the game starts, before bad frames are kept.
 *
 * The first second of play bakes the sprites for whatever is on screen, and
 * those frames are tens of milliseconds each. They are a real cost but a
 * one-off one, and left in they simply win: eight warm-up frames would fill the
 * list and push out the twenty-five millisecond hitch during a walk that
 * somebody actually complained about.
 */
const WARM_UP_MS = 1500;

/**
 * One slow frame, kept whole.
 *
 * Averages cannot answer "why did it jerk just then", because the jerk is one
 * frame in a thousand and an average is what buries it. Every report gathered
 * for this game so far showed a healthy mean while the player was watching the
 * game stutter — one profile had exactly one frame over 20ms in 23 seconds, and
 * a `report()` showed 60.06fps and `slow 0/59` in a session whose own counter
 * said seven frames had already been dropped before the measurement started.
 * So the bad frames are kept as they happen, whenever they happen, and the
 * report hands them over regardless of what the last second and a half looked
 * like.
 */
export interface SlowFrame {
  /** Seconds since the page loaded, so several can be told apart. */
  at: number;
  frameMs: number;
  drawMs: number;
  simMs: number;
  /** Which render path ran, and over how much of the screen. */
  path: string;
  dirty: string;
  /** This frame's stage costs, unaveraged. */
  stages: Record<string, number>;
}

export interface PerfSnapshot {
  fps: number;
  frameMs: number;
  drawMs: number;
  /** Simulation: everything the frame does that is not drawing. */
  simMs: number;
  /**
   * Frame time that is neither ours to simulate nor ours to draw.
   *
   * The browser's own half of the frame — style, layout, compositing the canvas
   * up to the device pixel ratio, GC — and, at a healthy frame rate, mostly
   * just waiting for the next vsync. So read it together with `fps`:
   *
   *   60fps and `other` large   the page is idle. Nothing to fix.
   *   low fps and `other` large the main thread is finishing early and
   *                             something outside this codebase is setting the
   *                             pace. Optimising the renderer will do nothing.
   *   low fps and `draw` large  the renderer. This is the only case where the
   *                             drawing code is the answer.
   *
   * Written down because an evening went into the renderer on the strength of a
   * 13ms figure, while the frame was 35.9ms and the draw was 1.76ms of it.
   */
  otherMs: number;
  slowFrames: number;
  windowFrames: number;
  scale: number;
  maxScale: number;
  devicePixelRatio: number;
}

export class Performance {
  private frameAverage = 0;
  private drawAverage = 0;
  private simAverage = 0;
  private slowFrames = 0;
  private windowFrames = 0;

  readonly scale = RENDER_SCALE;

  /**
   * The worst frames of the whole session, worst first.
   *
   * Not a window. A stutter noticed at minute three is still in here at minute
   * ten, which is the entire point — the player reports it long after it
   * happened, and asking them to catch one inside a 90-frame probe has failed
   * every time it has been tried.
   */
  readonly worstFrames: SlowFrame[] = [];

  /** When bad frames start counting. See `WARM_UP_MS`. */
  private watchFrom = 0;

  /** Clear the counters; warm-up is not a measurement. */
  pardonWarmUp(): void {
    this.windowFrames = 0;
    this.slowFrames = 0;
    this.worstFrames.length = 0;
    this.watchFrom = performance.now() + WARM_UP_MS;
  }

  /** Keep this frame if it is among the worst seen. */
  considerFrame(frame: SlowFrame): void {
    if (frame.frameMs < WATCH_FRAME_MS) return;
    if (frame.at * 1000 < this.watchFrom) return;
    this.worstFrames.push(frame);
    this.worstFrames.sort((a, b) => b.frameMs - a.frameMs);
    if (this.worstFrames.length > WORST_KEPT) this.worstFrames.length = WORST_KEPT;
  }

  recordDraw(ms: number): void {
    this.drawAverage = this.drawAverage * 0.9 + ms * 0.1;
  }

  /** Everything the frame does apart from drawing: the world moving on. */
  recordSim(ms: number): void {
    this.simAverage = this.simAverage * 0.9 + ms * 0.1;
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
      simMs: this.simAverage,
      otherMs: Math.max(0, this.frameAverage - this.drawAverage - this.simAverage),
      slowFrames: this.slowFrames,
      windowFrames: this.windowFrames,
      scale: this.scale,
      maxScale: RENDER_SCALE,
      devicePixelRatio: globalThis.devicePixelRatio || 1,
    };
  }
}

/**
 * How long a number is allowed to stand still before it is replaced.
 *
 * The readout used to change every frame, which is sixty times a second: too
 * fast to read a digit, let alone compare one against the last. Ten times a
 * second is about as fast as an eye can take a number in, and it is slow enough
 * that the digits stay put long enough to be read.
 */
const METER_INTERVAL_MS = 100;

/**
 * Points kept per meter — one per interval, so this many tenths of a second.
 *
 * Sixty-four is six and a half seconds, which is long enough to hold the walk
 * that stuttered while still being narrow enough to draw beside a number.
 */
const METER_HISTORY = 64;

/** Pixels per point. Two is legible without making the graph wider than the numbers. */
const METER_POINT_W = 2;

/** Height of a graph, in pixels. Fits inside the 17px line spacing. */
const METER_GRAPH_H = 12;

/**
 * The graph line: one pixel wide, and the brightest thing on the panel.
 *
 * Cold on purpose. The text is a warm pale green, so a cyan line reads as a
 * separate layer rather than as more writing, and a shape is easier to catch
 * out of the corner of an eye than a digit is. Thin rather than filled for the
 * same reason: a bar chart twelve pixels tall is mostly ink, and its outline —
 * the only part carrying the measurement — is the part that gets lost.
 */
const METER_LINE = '#6ef2ff';

/** The newest point, so the eye can find "now" without counting. */
const METER_NOW = '#ffffff';

/**
 * One tracked number: two digits' worth of summary, and a graph of where it has
 * been.
 *
 * Both halves are needed and neither will do on its own. The digits are the
 * value you can actually read, and they are held still for a tenth of a second
 * to stay readable — but a number held still is a number that can hide the
 * frame it was held over. So every tenth of a second is also a point on the
 * graph, and the point is the *worst* value seen in it. A spike survives being
 * slowed down; it just moves from the digits into the picture beside them.
 *
 * Both columns describe exactly the span the graph draws — the worst of it and
 * the mean of it. A worst figure over a tenth of a second is a figure that
 * blinks past before it can be read, and one that names a hitch you can still
 * see in the line beside it is worth more than one that named a hitch which has
 * already scrolled away.
 */
export class Meter {
  /** Newest last. One entry per interval, holding that interval's worst. */
  readonly history: number[] = [];

  /**
   * The same intervals' means, kept alongside.
   *
   * The mean of the window is taken from these rather than from `history`,
   * which would be a mean of worsts — an average nothing ever measured, biased
   * upwards by exactly the spikes the other column is there to report.
   */
  private readonly means: number[] = [];

  private windowMax = 0;
  private windowSum = 0;
  private windowCount = 0;

  constructor(readonly label: string) {}

  /** Feed one measurement. Called once a frame; allocates nothing. */
  record(value: number): void {
    if (!Number.isFinite(value)) return;
    if (value > this.windowMax) this.windowMax = value;
    this.windowSum += value;
    this.windowCount++;
  }

  /** Back to nothing measured: no history, no half-finished interval. */
  reset(): void {
    this.history.length = 0;
    this.means.length = 0;
    this.windowMax = 0;
    this.windowSum = 0;
    this.windowCount = 0;
  }

  /** Close the interval: keep its worst and its mean, start the next. */
  roll(): void {
    this.history.push(this.windowMax);
    this.means.push(this.windowCount ? this.windowSum / this.windowCount : 0);
    if (this.history.length > METER_HISTORY) this.history.shift();
    if (this.means.length > METER_HISTORY) this.means.shift();
    this.windowMax = 0;
    this.windowSum = 0;
    this.windowCount = 0;
  }

  /** The worst value over the last `points` intervals — the span on the graph. */
  worstOver(points: number): number {
    let worst = 0;
    for (let i = Math.max(0, this.history.length - points); i < this.history.length; i++) {
      if (this.history[i] > worst) worst = this.history[i];
    }
    return worst;
  }

  /** The mean over the same span. Intervals hold a frame or six each, so they
   * count for one apiece and the arithmetic stays honest enough to read. */
  meanOver(points: number): number {
    const from = Math.max(0, this.means.length - points);
    if (from >= this.means.length) return 0;
    let sum = 0;
    for (let i = from; i < this.means.length; i++) sum += this.means[i];
    return sum / (this.means.length - from);
  }
}

/**
 * The meters, in the order they were first recorded.
 *
 * Fed every frame whether or not the readout is showing, because the moment
 * worth looking at is the one just before the key is pressed. That costs a
 * handful of additions per frame and — deliberately — not one allocation, so it
 * cannot itself become the hitch it is there to find.
 */
export class Meters {
  private readonly meters = new Map<string, Meter>();
  private nextRoll = 0;

  record(label: string, value: number): void {
    let meter = this.meters.get(label);
    if (!meter) {
      meter = new Meter(label);
      this.meters.set(label, meter);
    }
    meter.record(value);
  }

  /** Forget everything. Loading is not a measurement — see `pardonWarmUp`. */
  clear(): void {
    for (const meter of this.meters.values()) meter.reset();
    this.nextRoll = 0;
  }

  /** Roll every meter over if the interval is up. Call once a frame. */
  update(nowMs: number): void {
    if (!this.nextRoll) {
      this.nextRoll = nowMs + METER_INTERVAL_MS;
      return;
    }
    if (nowMs < this.nextRoll) return;
    /*
     * Set from now rather than stepped by one interval. After a tab-switch the
     * clock is minutes ahead, and stepping would spend hundreds of rolls
     * catching up — flushing every graph to zero to redraw a gap nobody saw.
     */
    this.nextRoll = nowMs + METER_INTERVAL_MS;
    for (const meter of this.meters.values()) meter.roll();
  }

  get list(): Meter[] {
    return [...this.meters.values()];
  }
}

/** A line of the readout: plain text, or a meter with its graph. */
export type PerfRow = string | Meter;

/**
 * A number in exactly six characters: three digits, a point, and two decimals.
 *
 * Fixed width is the whole point. A value that shrinks from 100.00 to 99.99
 * used to shorten its line and drag everything after it sideways, and a column
 * that moves while you read it cannot be compared against itself.
 */
function meterNumber(value: number): string {
  if (!Number.isFinite(value)) return '   ---';
  if (value < 0) return '  <0.0';
  // Bigger than the column can hold. Pinned rather than widened: losing the
  // exact figure of a wild outlier costs less than losing the alignment.
  if (value >= 999.995) return '999.99';
  return value.toFixed(2).padStart(6, ' ');
}

/** The readout behind the F key. If it ever stutters, this says why. */
export function drawPerfOverlay(
  ctx: CanvasRenderingContext2D,
  perf: PerfSnapshot,
  viewportWidth: number,
  viewportHeight: number,
  extra: readonly PerfRow[],
): void {
  /*
   * What to show is the caller's business now.
   *
   * This used to prepend four fixed lines of its own — fps, the frame split
   * three ways, the render scale, the device pixel ratio — and none of them
   * ever caught a stutter: the scale has been fixed at one for a year, and a
   * frame time that reads 16.7 is exactly what a stuttering session reads while
   * it stutters. Composing the readout in one place beats having half of it
   * decided here and half at the call site.
   */
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(perf.scale, perf.scale);
  ctx.font = '13px ui-monospace, Menlo, Consolas, monospace';
  ctx.textBaseline = 'top';

  // A phone is narrow and some of these lines are long, so they are folded
  // rather than run off the edge — a number you cannot see is not a readout.
  const limit = viewportWidth / perf.scale - 44;

  // Every label is padded to the longest one, so the two number columns — and
  // the graphs that start after them — line up down the whole readout.
  let labelWidth = 0;
  for (const row of extra) if (typeof row !== 'string') labelWidth = Math.max(labelWidth, row.label.length);

  /** Space between the last digit and the start of the graph. */
  const gap = 10;
  /*
   * Measured from the widest number a column can hold rather than from the
   * number in it now, so where the graph starts does not depend on what is
   * being reported. The same reason the digits are padded to six: a layout that
   * answers to the data is a layout that twitches.
   */
  const meterTextW = labelWidth
    ? ctx.measureText(`${'0'.repeat(labelWidth)} 999.99 999.99`).width
    : 0;
  // On a narrow screen the graphs give up their points one at a time, and are
  // dropped altogether before they would push the numbers off the edge.
  const points = meterTextW
    ? Math.max(0, Math.min(METER_HISTORY, Math.floor((limit - meterTextW - gap) / METER_POINT_W)))
    : 0;
  const graphW = points * METER_POINT_W;
  const graphX = meterTextW + gap;
  /*
   * What the numbers cover: the drawn span, so that a worst figure can always
   * be pointed at in the line beside it. With no room for a graph there is
   * nothing to agree with, and they fall back to the whole history.
   */
  const span = points || METER_HISTORY;

  const lines: { text: string; meter?: Meter; dim?: boolean }[] = [];
  let headed = false;
  for (const row of extra) {
    if (typeof row === 'string') {
      for (const line of fold(ctx, row, limit)) lines.push({ text: line });
      continue;
    }
    if (!headed) {
      headed = true;
      // Built from the same widths as the rows below it, so the headings cannot
      // drift out of line with the columns they name.
      lines.push({
        text: `${' '.repeat(labelWidth)}    max    avg  ${((span * METER_INTERVAL_MS) / 1000).toFixed(1)}s`,
        dim: true,
      });
    }
    lines.push({
      text: `${row.label.padEnd(labelWidth)} ${meterNumber(row.worstOver(span))} ${meterNumber(row.meanOver(span))}`,
      meter: row,
    });
  }

  let width = graphW ? graphX + graphW : 0;
  for (const line of lines) width = Math.max(width, ctx.measureText(line.text).width);
  width = Math.ceil(width) + 20;
  const height = lines.length * 17 + 14;
  const x = 12;
  const y = viewportHeight - height - 12;

  ctx.fillStyle = 'rgba(20,18,15,.82)';
  ctx.fillRect(x, y, width, height);
  lines.forEach((line, i) => {
    const top = y + 8 + i * 17;
    ctx.fillStyle = line.dim ? 'rgba(216,240,192,.45)' : '#d8f0c0';
    ctx.fillText(line.text, x + 10, top);
    if (line.meter && graphW) {
      drawMeterGraph(ctx, line.meter, x + 10 + graphX, top + 1, graphW, METER_GRAPH_H, points);
    }
  });
  ctx.restore();
}

/**
 * One meter's history, newest at the right.
 *
 * Each graph is scaled to its own tallest point, so heights are worth comparing
 * along a row and worth nothing between rows — a full-height bar means "the
 * worst this line has been lately", not "bad". Zero is always the floor, so a
 * spike to twice the usual figure looks twice as tall, which is the shape the
 * eye is here to catch.
 */
function drawMeterGraph(
  ctx: CanvasRenderingContext2D,
  meter: Meter,
  x: number,
  y: number,
  w: number,
  h: number,
  points: number,
): void {
  const history = meter.history;
  const shown = Math.min(points, history.length);
  const from = history.length - shown;

  let peak = 0;
  for (let i = from; i < history.length; i++) peak = Math.max(peak, history[i]);

  // The floor of the graph, drawn the whole way across: it shows how much room
  // the line has to fill, and where zero is on a meter that has left it.
  ctx.fillStyle = 'rgba(216,240,192,.12)';
  ctx.fillRect(x, y + h - 1, w, 1);
  if (shown < 1) return;

  /*
   * Halves throughout: a one-pixel stroke is centred on its path, so a line at
   * a whole coordinate straddles two rows of pixels and comes out two rows of
   * grey. On the half it lands inside one row and stays the colour it was set.
   */
  const right = x + w - 0.5;
  const floor = y + h - 0.5;
  // A pixel of headroom at the top, so the tallest point is a peak with air
  // above it rather than something clipped by the row of text overhead.
  const span = h - 2;
  /*
   * A meter that never left zero is drawn flat along the floor rather than not
   * drawn at all. `upload`, `new` and `bakes` are meant to read zero for ever,
   * and a lit line saying "measured, and it was nothing" is the good news; an
   * empty row would look the same as a meter that had stopped reporting.
   */
  const scale = peak > 0 ? span / peak : 0;
  const pointX = (i: number) => right - (shown - 1 - i) * METER_POINT_W;
  const pointY = (value: number) => floor - value * scale;

  if (shown > 1) {
    ctx.beginPath();
    ctx.moveTo(pointX(0), pointY(history[from]));
    for (let i = 1; i < shown; i++) ctx.lineTo(pointX(i), pointY(history[from + i]));
    ctx.strokeStyle = METER_LINE;
    ctx.lineWidth = 1;
    /*
     * Mitred, not rounded. A round join is a half-pixel disc dropped on every
     * vertex, and on a flat run they landed as a row of eighty-percent pixels
     * between full ones — a straight line that came out dotted, at two pixels a
     * point, which is exactly the spacing of the data. A graph must not draw a
     * pattern the measurements do not have.
     */
    ctx.lineJoin = 'miter';
    ctx.stroke();
  }

  ctx.fillStyle = METER_NOW;
  ctx.fillRect(Math.round(right) - 1, Math.round(pointY(history[history.length - 1])) - 1, 2, 2);
}

/** Breaks a line at spaces so it fits, keeping continuations indented. */
function fold(ctx: CanvasRenderingContext2D, line: string, limit: number): string[] {
  if (ctx.measureText(line).width <= limit) return [line];
  const out: string[] = [];
  let current = '';
  for (const word of line.split(' ')) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > limit) {
      out.push(current);
      current = `  ${word}`;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}
