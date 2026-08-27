import { isolate } from '../core/canvas';
import { TAU } from '../core/math';
import { jitter } from '../media/ink';
import { PENCIL, type Medium } from '../media/medium';
import { groundShadow } from '../media/pencil';
import { circleCollider, type Scenery } from './types';

/**
 * A hammock, slung between two trees.
 *
 * The cloth is drawn live, every frame, in whichever medium — it is not baked
 * into the world like the trees are. It cannot be: it sags under whoever is in
 * it, and a baked copy at the empty sag stays exactly where it was painted. The
 * first version did bake it, and lying down gave you two hammocks, the empty
 * one hanging above the loaded one.
 *
 * What is baked is the ground shadow and the two trees, none of which move.
 *
 * The shape is a catenary rather than an arc, which is the difference between
 * a hammock and a smile: cloth hung between two points sags fast near the ends
 * and flattens in the middle, and an arc does the opposite.
 */

/** How far apart the trees stand. */
export const HAMMOCK_SPAN = 140;

/** How high the ropes are tied. */
const TIE_HEIGHT = 52;

/** How far the empty cloth hangs below the ties. */
const EMPTY_SAG = 20;

/**
 * The curve of the cloth, as a function across it.
 *
 * `u` runs 0 to 1 from one tree to the other, `sag` is how far the middle
 * drops. `cosh` is the real shape of a hanging line; scaled here so the ends
 * sit at the ties and the middle at the full sag.
 */
export function hammockCurve(u: number, sag: number): number {
  const k = 2.2;
  const shape = (Math.cosh(k * (u - 0.5)) - 1) / (Math.cosh(k * 0.5) - 1);
  return sag * (1 - shape);
}

/** Where the cloth hangs at `u`, in world coordinates. */
export function hammockPoint(
  x: number,
  y: number,
  u: number,
  sag: number,
): { x: number; y: number } {
  return {
    x: x - HAMMOCK_SPAN / 2 + u * HAMMOCK_SPAN,
    y: y - TIE_HEIGHT + hammockCurve(u, sag),
  };
}

/**
 * Trace the cloth from one tie to the other.
 *
 * The wobble comes from `jitter`, not from the world's generator: this is drawn
 * every frame now, and `rr` would both re-roll the wobble sixty times a second
 * — a line that vibrates rather than one that looks drawn — and walk the seed
 * the whole world was laid out from.
 */
export function traceHammock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sag: number,
  wobble = 0,
  seed = 0,
): void {
  ctx.beginPath();
  for (let i = 0; i <= 22; i++) {
    const p = hammockPoint(x, y, i / 22, sag);
    const jx = wobble ? jitter(seed + i * 2, wobble) : 0;
    const jy = wobble ? jitter(seed + i * 2 + 1, wobble) : 0;
    if (i === 0) ctx.moveTo(p.x + jx, p.y + jy);
    else ctx.lineTo(p.x + jx, p.y + jy);
  }
}

/** The ropes gathered to each tie point. */
function ropes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sag: number,
  wobble: number,
): void {
  for (const side of [0, 1]) {
    const tie = { x: x + (side ? 1 : -1) * (HAMMOCK_SPAN / 2 + 12), y: y - TIE_HEIGHT - 8 };
    for (const [k, u] of (side ? [0.94, 1, 1.06] : [-0.06, 0, 0.06]).entries()) {
      const p = hammockPoint(x, y, Math.min(1, Math.max(0, u)), sag);
      ctx.beginPath();
      ctx.moveTo(tie.x + jitter(side * 90 + k * 3, wobble), tie.y);
      ctx.lineTo(p.x + (u - (side ? 1 : 0)) * 40, p.y + jitter(side * 90 + k * 3 + 1, wobble));
      ctx.stroke();
    }
  }
}

/** The cloth, its ropes and the stripes across it. Shared with the live draw. */
export function drawHammockCloth(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sag: number,
  medium: Medium,
): void {
  if (medium === 'color') {
    ctx.strokeStyle = '#b8926a';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ropes(ctx, x, y, sag, 0);

    // The knots, so the ropes end somewhere rather than stopping.
    ctx.fillStyle = '#8a6a3f';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + side * (HAMMOCK_SPAN / 2 + 12), y - TIE_HEIGHT - 8, 2.6, 0, TAU);
      ctx.fill();
    }

    // The cloth: the curve, and the same curve dropped by its depth, closed.
    ctx.beginPath();
    for (let i = 0; i <= 22; i++) {
      const p = hammockPoint(x, y, i / 22, sag);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    for (let i = 22; i >= 0; i--) {
      const p = hammockPoint(x, y, i / 22, sag);
      ctx.lineTo(p.x, p.y + 13);
    }
    ctx.closePath();
    ctx.fillStyle = '#e0d3b4';
    ctx.fill();

    // Stripes, clipped to the cloth so they follow its edge rather than cross it.
    isolate(ctx, () => {
      ctx.clip();
      ctx.strokeStyle = 'rgba(190,120,86,.55)';
      ctx.lineWidth = 3.4;
      for (let i = 1; i < 9; i++) {
        const p = hammockPoint(x, y, i / 9, sag);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 3);
        ctx.lineTo(p.x, p.y + 17);
        ctx.stroke();
      }
    });

    ctx.strokeStyle = '#a8875f';
    ctx.lineWidth = 1.4;
    traceHammock(ctx, x, y, sag);
    ctx.stroke();
    return;
  }

  isolate(ctx, () => {
    ctx.strokeStyle = PENCIL;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 0.9;
    ropes(ctx, x, y, sag, 0.6);

    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.15;
    traceHammock(ctx, x, y, sag, 0.7, 10);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    traceHammock(ctx, x, y, sag + 13, 0.7, 200);
    ctx.stroke();

    // The stripes read as the dark bits, so they are hatched rather than drawn.
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 0.85;
    for (let i = 1; i < 9; i++) {
      const p = hammockPoint(x, y, i / 9, sag);
      ctx.beginPath();
      ctx.moveTo(p.x + jitter(300 + i * 2, 0.6), p.y - 1);
      ctx.lineTo(p.x + jitter(301 + i * 2, 0.6), p.y + 14);
      ctx.stroke();
    }
  });
}

export function makeHammock(x: number, y: number): Scenery {
  return {
    // Sorted by the ground it stands on, like everything else at this height.
    y,
    colliders: [
      circleCollider(x - HAMMOCK_SPAN / 2, y, 13),
      circleCollider(x + HAMMOCK_SPAN / 2, y, 13),
    ],
    draw(ctx, medium) {
      // Only the shadow. The cloth above it is drawn live — see the note at the
      // top of this file.
      groundShadow(ctx, x, y - 4, HAMMOCK_SPAN * 0.42, 13, medium);
    },
  };
}

export { EMPTY_SAG, TIE_HEIGHT };
