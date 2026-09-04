import { clamp, TAU } from '../core/math';
import { rr } from '../core/rng';
import { drawDisc } from '../media/sprites';

/**
 * Paint splashes when a pot is found, and drifting motes of colour that follow
 * the walker around. Both are pure decoration and both live only inside the
 * lit area, so they never give away what is out in the dark.
 */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  readonly maxLife: number;
  readonly radius: number;
  readonly colour: string;
  readonly gravity: number;
}

const MOTE_COLOURS = ['#fff6c9', '#ffd9a0', '#cfeeff', '#ffd4e6'] as const;

const HEART_COLOURS = ['#e0708a', '#ea8fa4', '#d95f7c'] as const;

/** One little heart, centred on `x, y`, `s` across. */
function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s);
  ctx.bezierCurveTo(x - s * 1.7, y - s * 0.35, x - s * 0.72, y - s * 1.5, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.72, y - s * 1.5, x + s * 1.7, y - s * 0.35, x, y + s);
  ctx.closePath();
}

/**
 * Compact in place. `arr = arr.filter(...)` throws away a fresh array every
 * frame for each of these lists — small, but it is per-frame garbage.
 */
function sweep<T>(arr: T[], alive: (item: T) => boolean): void {
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (alive(arr[i])) arr[n++] = arr[i];
  }
  arr.length = n;
}

export class Particles {
  private readonly splashes: Particle[] = [];
  private readonly motes: Particle[] = [];
  /** Rises from the cat when she is stroked. Nothing else makes these. */
  private readonly hearts: Particle[] = [];

  clear(): void {
    this.splashes.length = 0;
    this.motes.length = 0;
    this.hearts.length = 0;
  }

  /** Someone has been petted. */
  heartburst(x: number, y: number, count = 3): void {
    for (let i = 0; i < count; i++) {
      this.hearts.push({
        x: x + rr(-8, 8),
        // Above her back rather than inside it — she is drawn from y-16 up.
        y: y - 22,
        vx: rr(-9, 9),
        vy: rr(-34, -20),
        life: rr(1.1, 1.8),
        maxLife: 1.8,
        radius: rr(2.4, 4),
        colour: HEART_COLOURS[Math.floor(Math.random() * HEART_COLOURS.length)],
        gravity: 0,
      });
    }
  }

  /** A pot has been found. */
  burst(x: number, y: number, colour: string, count = 26): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const speed = 40 + Math.random() * 150;
      this.splashes.push({
        x,
        y: y - 8,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 60,
        life: 0.8 + Math.random() * 0.7,
        maxLife: 1.5,
        radius: 1.6 + Math.random() * 3.2,
        colour,
        gravity: 190,
      });
    }
  }

  private spawnMote(x: number, y: number, radius: number): void {
    const a = Math.random() * TAU;
    const d = Math.random() * radius * 0.85;
    this.motes.push({
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      vx: rr(-8, 8),
      vy: rr(-16, -4),
      life: rr(1.6, 3.4),
      maxLife: 3.4,
      radius: rr(0.9, 2.2),
      colour: MOTE_COLOURS[Math.floor(Math.random() * MOTE_COLOURS.length)],
      gravity: 0,
    });
  }

  update(dt: number, elapsed: number, walkerX: number, walkerY: number, litRadius: number, walkerSpeed: number): void {
    for (const p of this.splashes) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.6 * dt;
    }
    sweep(this.splashes, (p) => p.life > 0);

    if (Math.random() < (walkerSpeed > 20 ? 0.55 : 0.22)) {
      this.spawnMote(walkerX, walkerY, litRadius);
    }
    for (const m of this.motes) {
      m.life -= dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vx += Math.sin(elapsed * 1.3 + m.y * 0.01) * 6 * dt;
    }
    sweep(this.motes, (m) => m.life > 0);

    for (const h of this.hearts) {
      h.life -= dt;
      // Wobbles as it climbs, and slows to a stop rather than sailing off.
      h.x += (h.vx + Math.sin(elapsed * 3 + h.maxLife * h.radius) * 9) * dt;
      h.y += h.vy * dt;
      h.vy *= 1 - 0.9 * dt;
    }
    sweep(this.hearts, (h) => h.life > 0);
  }

  /**
   * Every round particle to be shown, with the alpha it is to be shown at.
   *
   * Yielded rather than drawn, because a mote is a disc of one colour at a
   * position and a size — which is a sprite, and putting fifty sprites on the
   * GPU costs nothing at all. Drawn into a canvas instead, they were the single
   * most expensive thing in the frame: the motes drift out to the edge of the
   * light, so the canvas holding them had to be as wide as the colour is, and
   * it was re-uploaded twelve times a second. Measured at 66MB a second, which
   * was more than everything else in the frame put together.
   *
   * `draw` below still exists and still draws the same picture; it is what the
   * hearts use, and what anything wanting the whole lot in one context uses.
   */
  *discs(
    walkerX: number,
    walkerY: number,
    litRadius: number,
    flooded: boolean,
  ): Generator<{ x: number; y: number; radius: number; colour: string; alpha: number }> {
    for (const m of this.motes) {
      const fade = clamp(m.life / m.maxLife, 0, 1) * 0.9;
      const nearness = flooded
        ? 1
        : clamp(1 - Math.hypot(m.x - walkerX, m.y - walkerY) / (litRadius * 0.95), 0, 1);
      yield { x: m.x, y: m.y, radius: m.radius, colour: m.colour, alpha: fade * nearness };
    }
    for (const p of this.splashes) {
      yield {
        x: p.x,
        y: p.y,
        radius: p.radius,
        colour: p.colour,
        alpha: clamp(p.life / p.maxLife, 0, 1),
      };
    }
  }

  /** Is there a heart in the air? They are drawn by hand and are usually not. */
  get hasHearts(): boolean {
    return this.hearts.length > 0;
  }

  /** The box the hearts occupy, in world units. Only valid if there are any. */
  heartBounds(): { x: number; y: number; size: number } {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const h of this.hearts) {
      x0 = Math.min(x0, h.x - h.radius * 2);
      y0 = Math.min(y0, h.y - h.radius * 2);
      x1 = Math.max(x1, h.x + h.radius * 2);
      y1 = Math.max(y1, h.y + h.radius * 2);
    }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, size: Math.max(x1 - x0, y1 - y0) + 16 };
  }

  /** Motes fade out towards the edge of the light; splashes do not. */
  draw(
    ctx: CanvasRenderingContext2D,
    walkerX: number,
    walkerY: number,
    litRadius: number,
    flooded: boolean,
  ): void {
    for (const d of this.discs(walkerX, walkerY, litRadius, flooded)) {
      ctx.globalAlpha = d.alpha;
      drawDisc(ctx, d.colour, d.x, d.y, d.radius);
    }
    this.drawHearts(ctx);
    ctx.globalAlpha = 1;
  }

  /**
   * The hearts, which rise from the cat when she is stroked.
   *
   * Kept on a canvas rather than made into sprites like the discs: a heart is a
   * pair of bezier curves whose shape changes as it swells, so it is a drawing
   * rather than a stamp. There are three of them, they last a second, and they
   * happen when somebody pets a cat — this is not a hot path.
   */
  drawHearts(ctx: CanvasRenderingContext2D): void {
    // Hearts swell as they appear and fade as they go, so the burst has a shape
    // rather than three dots switching on.
    for (const h of this.hearts) {
      const left = clamp(h.life / h.maxLife, 0, 1);
      ctx.globalAlpha = Math.min(1, left * 2.4) * 0.9;
      ctx.fillStyle = h.colour;
      heartPath(ctx, h.x, h.y, h.radius * (0.6 + 0.4 * Math.min(1, (1 - left) * 5)));
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
