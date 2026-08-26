import { isolate } from '../core/canvas';
import { luminance, type Hex } from '../core/color';
import { bounds, tracePoly, type Poly } from '../core/geom';
import { clamp, lerp, TAU } from '../core/math';
import { rnd, rr } from '../core/rng';
import { PENCIL, type Medium } from './medium';

/**
 * Graphite for things drawn *once*, into the baked world layers.
 *
 * These are free to jitter with the shared rng on every stroke, because they
 * only ever run at bake time. Anything redrawn every frame must use `ink.ts`
 * instead, whose wobble holds still between frames.
 */

/** How a shape should be rendered in each medium. */
export interface PaintOptions {
  /** Outline colour in the colour medium. */
  edge?: string;
  edgeWidth?: number;
  /** Hatching angle in radians. Pick per material: bark vertical, water flat. */
  angle?: number;
  /** Scale the hatch density up or down from what the fill colour implies. */
  darkScale?: number;
  /** Skip hatching and draw outline only. */
  hatch?: boolean;
  outlineAlpha?: number;
  outlineWidth?: number;
}

/** A wobbly, over-shooting outline in two passes, the way a pencil edge lands. */
export function sketchOutline(
  ctx: CanvasRenderingContext2D,
  pts: Poly,
  alpha = 0.5,
  width = 1.2,
): void {
  isolate(ctx, () => {
    ctx.strokeStyle = PENCIL;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      const jitter = pass ? 1.6 : 0.9;
      ctx.globalAlpha = alpha * (pass ? 0.45 : 1);
      ctx.lineWidth = width * (pass ? 0.65 : 1);
      ctx.beginPath();
      // Two points past the close, so the line overshoots like a real one.
      const n = pts.length + 2;
      for (let i = 0; i < n; i++) {
        const p = pts[i % pts.length];
        const x = p[0] + rr(-jitter, jitter);
        const y = p[1] + rr(-jitter, jitter);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

/**
 * Parallel hatching clipped to a shape, cross-hatched where it needs to be dark.
 *
 * `darkness` runs 0..1 and drives the line spacing, which is how a colour
 * illustration becomes a tonal drawing: dark fills come out dense, pale ones
 * come out airy.
 */
export function hatchPoly(
  ctx: CanvasRenderingContext2D,
  pts: Poly,
  darkness: number,
  angle: number,
): void {
  const b = bounds(pts);
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const reach = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + 8;
  const spacing = lerp(10, 3.2, clamp(darkness, 0, 1));

  isolate(ctx, () => {
    tracePoly(ctx, pts);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = PENCIL;
    ctx.lineCap = 'round';

    const pass = (gap: number, alphaScale: number) => {
      for (let y = -reach; y <= reach; y += gap) {
        ctx.globalAlpha = (0.09 + darkness * 0.26 + rnd() * 0.07) * alphaScale;
        ctx.lineWidth = 0.6 + rnd() * 0.7;
        const x0 = -reach + rr(0, 9);
        const x1 = reach - rr(0, 9);
        if (x1 <= x0) continue;
        ctx.beginPath();
        ctx.moveTo(x0, y + rr(-0.7, 0.7));
        ctx.quadraticCurveTo((x0 + x1) / 2, y + rr(-1.7, 1.7), x1, y + rr(-0.7, 0.7));
        ctx.stroke();
      }
    };

    pass(spacing, 1);
    if (darkness > 0.5) {
      ctx.rotate(1.15);
      pass(spacing * 1.5, 0.75);
    }
  });
}

/**
 * Render one shape in whichever medium the layer being baked calls for.
 *
 * This is the seam the entire art style hangs on: scenery describes itself once,
 * as polygons plus a fill colour, and gets a colour illustration or a pencil
 * drawing depending on which layer is asking.
 */
export function paint(
  ctx: CanvasRenderingContext2D,
  pts: Poly,
  fill: Hex,
  medium: Medium,
  options: PaintOptions = {},
): void {
  if (medium === 'color') {
    tracePoly(ctx, pts);
    ctx.fillStyle = fill;
    ctx.fill();
    if (options.edge) {
      ctx.strokeStyle = options.edge;
      ctx.lineWidth = options.edgeWidth ?? 1.5;
      ctx.stroke();
    }
    return;
  }
  const darkness = (1 - luminance(fill)) * (options.darkScale ?? 1);
  if (options.hatch !== false) hatchPoly(ctx, pts, darkness, options.angle ?? -0.85);
  sketchOutline(ctx, pts, options.outlineAlpha ?? 0.5, options.outlineWidth ?? 1.15);
}

/**
 * Occluder sprites re-run an object's draw call to overlay it on the walker.
 * The ground shadow is already baked into the world underneath, so drawing it
 * again would double its darkness — this suppresses it for that one pass.
 */
let shadowsSuppressed = false;

export function withoutGroundShadows<T>(fn: () => T): T {
  const previous = shadowsSuppressed;
  shadowsSuppressed = true;
  try {
    return fn();
  } finally {
    shadowsSuppressed = previous;
  }
}

/** The soft dark patch a baked object sits on. */
export function groundShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  medium: Medium,
): void {
  if (shadowsSuppressed) return;

  if (medium === 'color') {
    isolate(ctx, () => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
      g.addColorStop(0, 'rgba(40,60,35,.30)');
      g.addColorStop(1, 'rgba(40,60,35,0)');
      ctx.translate(x, y);
      ctx.scale(1, ry / rx);
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
    });
    return;
  }

  isolate(ctx, () => {
    ctx.strokeStyle = PENCIL;
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const skew = lerp(-0.4, 0.4, t);
      ctx.globalAlpha = 0.13 + rnd() * 0.1;
      ctx.lineWidth = 0.8;
      const px = x + lerp(-rx * 0.85, rx * 0.85, t);
      ctx.beginPath();
      ctx.moveTo(px - ry * 0.8, y - ry * 0.3 + skew * 3);
      ctx.lineTo(px + ry * 0.8, y + ry * 0.5 + skew * 3);
      ctx.stroke();
    }
  });
}
