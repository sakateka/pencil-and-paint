import { TAU } from './math';
import { rnd } from './rng';

export type Point = readonly [number, number];

/**
 * Every shape in the world is a closed polygon.
 *
 * Not because polygons are convenient, but because they can be *jittered*: to
 * draw something in graphite we walk its points and nudge each one, which is
 * what gives the outlines their hand-drawn wobble. Circles are approximated
 * rather than drawn as arcs for exactly this reason.
 */
export type Poly = Point[];

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A circle with a slow organic waver, so nothing looks compass-drawn. */
export function circlePoly(cx: number, cy: number, r: number, segments = 20, wobble = 0.07): Poly {
  const pts: Point[] = [];
  const phase = rnd() * TAU;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    const rad =
      r * (1 + Math.sin(a * 3 + phase) * wobble + Math.sin(a * 5 - phase * 1.7) * wobble * 0.55);
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return pts;
}

export function ellipsePoly(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segments = 26,
  wobble = 0.05,
): Poly {
  const pts: Point[] = [];
  const phase = rnd() * TAU;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    const k = 1 + Math.sin(a * 3 + phase) * wobble + Math.sin(a * 4.6 - phase) * wobble * 0.6;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

export function rectPoly(x: number, y: number, w: number, h: number): Poly {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

export function bounds(pts: Poly): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);
}

/** Lay a polygon into the current path, closed. Does not fill or stroke. */
export function tracePoly(ctx: CanvasRenderingContext2D, pts: Poly): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/** Rounded rectangle as a path. Predates `ctx.roundRect` support being safe to assume. */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
