import { createSurface, type Surface } from '../core/canvas';
import { TAU } from '../core/math';
import { drawTrailBlob } from '../media/sprites';
import type { Camera } from './camera';

/**
 * The shape of the colour: a soft, breathing blob around the walker, plus a
 * short tail of where they have just been.
 *
 * This is rendered into its own canvas and then used as an alpha mask — the
 * coloured world is drawn, `destination-in` punches it through this, and what
 * survives is laid over the pencil drawing.
 */

/** The region of the screen the colour touches this frame. */
export interface DirtyRect {
  x: number;
  y: number;
  width: number;
  height: number;
  empty: boolean;
}

interface TrailPoint {
  x: number;
  y: number;
  life: number;
}

/** How many trail points to keep. Each one is a blob drawn into the mask. */
const MAX_TRAIL = 12;
const TRAIL_INTERVAL = 0.085;
const TRAIL_FADE = 0.85;

/** Points around the blob's rim. Enough to look organic, few enough to be cheap. */
const RIM_SEGMENTS = 54;

/** The wobble that keeps the edge from looking like a spotlight. */
function rimScale(angle: number, t: number): number {
  return (
    1 +
    Math.sin(angle * 3 + t * 0.7) * 0.055 +
    Math.sin(angle * 5 - t * 0.45) * 0.035 +
    Math.sin(angle * 8 + t * 0.25) * 0.018
  );
}

export class ColorField {
  readonly surface: Surface;
  private trail: TrailPoint[] = [];
  private sampleTimer = 0;
  private readonly dirty: DirtyRect = { x: 0, y: 0, width: 0, height: 0, empty: true };

  constructor() {
    this.surface = createSurface(1, 1);
  }

  resize(width: number, height: number): void {
    this.surface.canvas.width = Math.max(1, Math.round(width));
    this.surface.canvas.height = Math.max(1, Math.round(height));
  }

  clearTrail(): void {
    this.trail.length = 0;
    this.sampleTimer = 0;
  }

  /** Drop a mark where the walker is, if they are moving and it is time. */
  recordTrail(dt: number, x: number, y: number, speed: number): void {
    this.sampleTimer += dt;
    if (this.sampleTimer > TRAIL_INTERVAL && speed > 30) {
      this.sampleTimer = 0;
      this.trail.push({ x, y, life: 1 });
      if (this.trail.length > MAX_TRAIL) this.trail.shift();
    }
    for (const p of this.trail) p.life -= dt * TRAIL_FADE;
    let n = 0;
    for (const p of this.trail) if (p.life > 0) this.trail[n++] = p;
    this.trail.length = n;
  }

  /**
   * The screen rectangle the colour occupies this frame.
   *
   * This is the single most important optimisation in the renderer. The colour
   * only ever covers a blob around the walker, so compositing the whole screen
   * is mostly wasted work; restricted to this box, the cost scales with the
   * colour radius instead of the size of the window. On a large display that is
   * the difference between compositing 100% of the pixels and about 10%.
   */
  computeDirty(
    camera: Camera,
    centreX: number,
    centreY: number,
    radius: number,
    viewportWidth: number,
    viewportHeight: number,
  ): DirtyRect {
    let x0 = centreX - radius * 1.14;
    let y0 = centreY - radius * 1.14;
    let x1 = centreX + radius * 1.14;
    let y1 = centreY + radius * 1.14;

    for (const p of this.trail) {
      const tx = camera.toScreenX(p.x);
      const ty = camera.toScreenY(p.y - 10);
      const tr = radius * 0.42 * (0.45 + p.life * 0.55) * 1.1;
      if (tx - tr < x0) x0 = tx - tr;
      if (ty - tr < y0) y0 = ty - tr;
      if (tx + tr > x1) x1 = tx + tr;
      if (ty + tr > y1) y1 = ty + tr;
    }

    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(viewportWidth, Math.ceil(x1));
    y1 = Math.min(viewportHeight, Math.ceil(y1));

    this.dirty.x = x0;
    this.dirty.y = y0;
    this.dirty.width = x1 - x0;
    this.dirty.height = y1 - y0;
    this.dirty.empty = this.dirty.width <= 0 || this.dirty.height <= 0;
    return this.dirty;
  }

  /** Paint the mask for this frame, inside the dirty rectangle. */
  build(
    t: number,
    camera: Camera,
    centreX: number,
    centreY: number,
    radius: number,
    scale: number,
  ): void {
    const { ctx } = this.surface;
    const d = this.dirty;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(d.x * scale, d.y * scale, d.width * scale + 2, d.height * scale + 2);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(d.x, d.y, d.width, d.height);
    ctx.clip();

    // `lighter` so overlapping trail marks accumulate towards opaque rather
    // than punching holes in each other.
    ctx.globalCompositeOperation = 'lighter';

    for (const p of this.trail) {
      const tx = camera.toScreenX(p.x);
      const ty = camera.toScreenY(p.y - 10);
      const tr = radius * 0.42 * (0.45 + p.life * 0.55);
      drawTrailBlob(ctx, tx, ty, tr, 0.8 * p.life);
    }

    const grad = ctx.createRadialGradient(
      centreX,
      centreY,
      radius * 0.12,
      centreX,
      centreY,
      radius,
    );
    grad.addColorStop(0.0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.52, 'rgba(255,255,255,1)');
    grad.addColorStop(0.74, 'rgba(255,255,255,.82)');
    grad.addColorStop(0.89, 'rgba(255,255,255,.38)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let i = 0; i <= RIM_SEGMENTS; i++) {
      const a = (i / RIM_SEGMENTS) * TAU;
      const k = rimScale(a, t);
      const x = centreX + Math.cos(a) * radius * k;
      const y = centreY + Math.sin(a) * radius * k;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  /** A faint pencil line where the colour gives out, so the edge reads as drawn. */
  strokeRim(
    ctx: CanvasRenderingContext2D,
    t: number,
    centreX: number,
    centreY: number,
    radius: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(46,43,38,.20)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i <= RIM_SEGMENTS; i++) {
      const a = (i / RIM_SEGMENTS) * TAU;
      const k = rimScale(a, t) * 0.97;
      ctx.lineTo(centreX + Math.cos(a) * radius * k, centreY + Math.sin(a) * radius * k);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}
