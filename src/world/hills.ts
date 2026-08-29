import { createSurface, isolate, type Surface } from '../core/canvas';
import { Rng } from '../core/rng';
import { withBoil } from '../media/ink';
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

/**
 * Where the hills begin and end, in world x.
 *
 * The whole northern landscape lives between these, and everything about it —
 * the silhouette, the ground the walker is held to, the polygon the meadow is
 * filled inside — is read off `SURFACE` below. One array over one domain: they
 * used to be three arrays over two, agreeing only because they happened to come
 * from the same control points, with nothing anywhere saying they must.
 */
export const HILLS_FROM = HILL_CURVES[0][0][0];
export const HILLS_TO = HILL_CURVES[HILL_CURVES.length - 1][3][0];

/** How finely the curves are flattened into the one array. */
const SURFACE_STEP = 6;

/**
 * The hills, as one polyline.
 *
 * Built by evaluating the Béziers densely and reading them back onto an even
 * grid, so that a lookup is a step along it rather than a search through four
 * curves with their own parameterisations.
 */
export const SURFACE: readonly Point[] = (() => {
  const left = sample(HILL_CURVES.slice(0, 2));
  const right = sample(HILL_CURVES.slice(2));
  const at = (x: number) => Math.min(0, onSurface(left, x) ?? 0, onSurface(right, x) ?? 0);
  const points: Point[] = [];
  for (let x = HILLS_FROM; x <= HILLS_TO; x += SURFACE_STEP) points.push([x, at(x)]);
  // The east end exactly, which the even grid steps over.
  if (points[points.length - 1][0] < HILLS_TO) points.push([HILLS_TO, at(HILLS_TO)]);
  return points;
})();

/** The northern edge of walkable ground at this horizontal position. */
export function northernSurfaceY(x: number): number {
  if (x <= HILLS_FROM || x >= HILLS_TO) return 0;
  const i = Math.min(
    SURFACE.length - 2,
    Math.floor((x - HILLS_FROM) / SURFACE_STEP),
  );
  const a = SURFACE[i];
  const b = SURFACE[i + 1];
  return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
}

/**
 * Where the drawing starts, as an index into `SURFACE`.
 *
 * The hills run from x = -120, but the map does not, and the camera is clamped
 * inside it — so west of x = 0 there is ground the walker could stand on if
 * they could get there and no pixel of it will ever be on screen. `minX` keeps
 * them at 26. Drawing that western tail would be filling a polygon nobody can
 * see; the collision keeps it because a boundary with a hole in it is worse
 * than one that runs a little past the edge of the paper.
 */
const DRAWN_FROM = SURFACE.findIndex(([x]) => x >= 0);

export const PAINTED_HOUSE = { x: 340, y: -116, scale: 0.874 } as const;
export const PINE = { x: 690, y: -98, scale: 1.058 } as const;

/** Live because the baked world begins at y=0 and these stand above it. */
export const NORTHERN_LANDMARKS: readonly Scenery[] = [
  makePaintedHouse(PAINTED_HOUSE.x, PAINTED_HOUSE.y, PAINTED_HOUSE.scale),
  makePine(PINE.x, PINE.y, PINE.scale),
];

/*
 * The house and pine are detailed, but completely static. In a mixed frame
 * they used to be rebuilt once in graphite and again in colour — most of the
 * live-layer cost at the hills, especially in Firefox. Keep the hill itself as
 * geometry, and cache only these two expensive drawings in one compact surface
 * per medium. That buys the useful part of sprite caching without adding a
 * canvas for every object or changing the world's baking architecture.
 */
const LANDMARK_PAD = 4;
const LANDMARK_BOUNDS = NORTHERN_LANDMARKS.reduce(
  (bounds, landmark) => {
    const drawn = landmark.bounds;
    if (!drawn) return bounds;
    return {
      x0: Math.min(bounds.x0, drawn.x0 - LANDMARK_PAD),
      y0: Math.min(bounds.y0, drawn.y0 - LANDMARK_PAD),
      x1: Math.max(bounds.x1, drawn.x1 + LANDMARK_PAD),
      y1: Math.max(bounds.y1, drawn.y1 + LANDMARK_PAD),
    };
  },
  { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
);
const landmarkCache = new Map<Medium, Surface>();

function drawLandmarks(ctx: CanvasRenderingContext2D, medium: Medium): void {
  let cached = landmarkCache.get(medium);
  if (!cached) {
    const surface = createSurface(
      Math.ceil(LANDMARK_BOUNDS.x1 - LANDMARK_BOUNDS.x0),
      Math.ceil(LANDMARK_BOUNDS.y1 - LANDMARK_BOUNDS.y0),
    );
    surface.ctx.translate(-LANDMARK_BOUNDS.x0, -LANDMARK_BOUNDS.y0);
    // These are scenery, not live actors: their graphite should hold still.
    withBoil(false, () => {
      for (const landmark of NORTHERN_LANDMARKS) landmark.draw(surface.ctx, medium);
    });
    landmarkCache.set(medium, surface);
    cached = surface;
  }
  ctx.drawImage(cached.canvas, LANDMARK_BOUNDS.x0, LANDMARK_BOUNDS.y0);
}

/**
 * Hand the two cached drawings back.
 *
 * `World.dispose` shrinks every tile and every occluder sprite to a single
 * pixel when the page goes, because — its own words — two worlds of canvas at
 * once is more than a phone will grant, and on a reload the new document starts
 * building while the old one is still resident. These two surfaces live at
 * module scope rather than on the World, so they were sitting out exactly the
 * teardown that exists to stop that: better than half a megabyte of canvas
 * each once the device pixel ratio is counted, held past the end of the page.
 *
 * Shrunk rather than only dropped, for the same reason the tiles are: letting
 * go of the reference asks the collector to get round to it, and this is the
 * moment where the memory is actually wanted elsewhere. If anything draws
 * afterwards it simply builds them again, which is correct.
 */
export function disposeLandmarks(): void {
  for (const surface of landmarkCache.values()) {
    surface.canvas.width = 1;
    surface.canvas.height = 1;
  }
  landmarkCache.clear();
}

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
  ctx.moveTo(SURFACE[DRAWN_FROM][0], SURFACE[DRAWN_FROM][1]);
  for (let i = DRAWN_FROM + 1; i < SURFACE.length; i++) ctx.lineTo(SURFACE[i][0], SURFACE[i][1]);
  ctx.lineTo(HILLS_TO, 70);
  ctx.lineTo(0, 70);
  ctx.closePath();
}

/** Draw the hill caps and the two landmarks over the sky, in both media. */
export function drawNorthernLandscape(
  ctx: CanvasRenderingContext2D,
  medium: Medium,
  viewX: number,
  viewWidth: number,
): void {
  // The northern painting only occupies the west end of the map.
  if (viewX > 1012 || viewX + viewWidth < 0) return;

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
    ctx.moveTo(SURFACE[DRAWN_FROM][0], SURFACE[DRAWN_FROM][1]);
    for (let i = DRAWN_FROM + 1; i < SURFACE.length; i++) ctx.lineTo(SURFACE[i][0], SURFACE[i][1]);
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

  drawLandmarks(ctx, medium);
}
