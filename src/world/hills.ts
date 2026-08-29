import { isolate } from '../core/canvas';
import { Rng } from '../core/rng';
import { PAPER, PENCIL, type Medium } from '../media/medium';
import { GRAIN } from '../media/sprites';
import { makePaintedHouse, makePine } from './homestead';
import type { Scenery } from './types';

type Point = readonly [number, number];
type Curve = readonly [Point, Point, Point, Point];

/*
 * Two small pieces of meadow rising above the otherwise unchanged horizon.
 *
 * They overlap around x=560. Taking the higher piece of ground there makes a
 * shallow saddle without inventing a third "lowland" object. Both outer ends
 * meet y=0 with a horizontal tangent, so there is no spike where a hill joins
 * the old horizon.
 */
const HILL_CURVES: readonly Curve[] = [
  [[-120, 0], [20, 0], [170, -122], [275, -122]],
  [[275, -122], [390, -122], [500, -30], [550, -16]],
  [[550, -16], [590, -16], [620, -98], [690, -98]],
  [[690, -98], [790, -98], [915, -45], [1010, 0]],
];

function cubic(curve: Curve, t: number): Point {
  const u = 1 - t;
  const [a, b, c, d] = curve;
  return [
    u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
  ];
}

function sample(curves: readonly Curve[]): Point[] {
  const points: Point[] = [];
  for (const curve of curves) {
    for (let i = 0; i <= 48; i++) points.push(cubic(curve, i / 48));
  }
  return points;
}

const LEFT = sample(HILL_CURVES.slice(0, 2));
const RIGHT = sample(HILL_CURVES.slice(2));

function onSurface(points: readonly Point[], x: number): number | null {
  if (x < points[0][0] || x > points[points.length - 1][0]) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= x) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const t = (x - a[0]) / (b[0] - a[0] || 1);
  return a[1] + (b[1] - a[1]) * t;
}

/** The northern edge of walkable ground at this horizontal position. */
export function northernSurfaceY(x: number): number {
  const left = onSurface(LEFT, x);
  const right = onSurface(RIGHT, x);
  return Math.min(0, left ?? 0, right ?? 0);
}

const SURFACE: Point[] = [];
for (let x = 0; x <= 1010; x += 6) SURFACE.push([x, northernSurfaceY(x)]);
SURFACE.push([1010, 0]);

export const PAINTED_HOUSE = { x: 340, y: -116, scale: 0.874 } as const;
export const PINE = { x: 690, y: -98, scale: 1.058 } as const;

/** Live because the baked world begins at y=0 and these stand above it. */
export const NORTHERN_LANDMARKS: readonly Scenery[] = [
  makePaintedHouse(PAINTED_HOUSE.x, PAINTED_HOUSE.y, PAINTED_HOUSE.scale),
  makePine(PINE.x, PINE.y, PINE.scale),
];

const grass = (() => {
  const random = new Rng(0x6a4d123b);
  const marks: { x: number; y: number; lean: number; size: number }[] = [];
  for (let i = 0; i < 44; i++) {
    const x = random.range(8, 995);
    const top = northernSurfaceY(x);
    if (top > -18) continue;
    marks.push({
      x,
      y: random.range(top + 10, -4),
      lean: random.range(-2.5, 2.5),
      size: random.range(3, 7),
    });
  }
  return marks;
})();

function traceMeadow(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(SURFACE[0][0], SURFACE[0][1]);
  for (let i = 1; i < SURFACE.length; i++) ctx.lineTo(SURFACE[i][0], SURFACE[i][1]);
  ctx.lineTo(1010, 70);
  ctx.lineTo(0, 70);
  ctx.closePath();
}

/** Draw the hill caps and the two landmarks over the sky, in both media. */
export function drawNorthernLandscape(ctx: CanvasRenderingContext2D, medium: Medium): void {
  isolate(ctx, () => {
    traceMeadow(ctx);
    const fill = ctx.createLinearGradient(0, -130, 0, 70);
    if (medium === 'color') {
      fill.addColorStop(0, '#83b56a');
      fill.addColorStop(0.65, '#83b56a');
      fill.addColorStop(1, 'rgba(131,181,106,0)');
    } else {
      fill.addColorStop(0, PAPER);
      fill.addColorStop(0.65, PAPER);
      fill.addColorStop(1, 'rgba(242,236,221,0)');
    }
    ctx.fillStyle = fill;
    ctx.fill();

    traceMeadow(ctx);
    ctx.clip();
    const pattern = ctx.createPattern(GRAIN, 'repeat');
    if (pattern) {
      ctx.globalAlpha = medium === 'color' ? 0.14 : 0.55;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, -130, 1012, 130);
    }
  });

  isolate(ctx, () => {
    ctx.strokeStyle = medium === 'color' ? 'rgba(68,126,65,.55)' : PENCIL;
    ctx.globalAlpha = medium === 'color' ? 0.65 : 0.42;
    ctx.lineWidth = medium === 'color' ? 1.1 : 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(SURFACE[0][0], SURFACE[0][1]);
    for (let i = 1; i < SURFACE.length; i++) ctx.lineTo(SURFACE[i][0], SURFACE[i][1]);
    ctx.stroke();

    ctx.strokeStyle = medium === 'color' ? '#4f9156' : PENCIL;
    ctx.globalAlpha = medium === 'color' ? 0.7 : 0.3;
    ctx.lineWidth = medium === 'color' ? 1.4 : 0.9;
    ctx.beginPath();
    for (const blade of grass) {
      ctx.moveTo(blade.x, blade.y);
      ctx.quadraticCurveTo(
        blade.x + blade.lean * 0.4,
        blade.y - blade.size * 0.55,
        blade.x + blade.lean,
        blade.y - blade.size,
      );
    }
    ctx.stroke();
  });

  for (const landmark of NORTHERN_LANDMARKS) landmark.draw(ctx, medium);
}
