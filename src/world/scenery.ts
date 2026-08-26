import { isolate } from '../core/canvas';
import { shade } from '../core/color';
import { bounds, circlePoly, rectPoly, tracePoly, type Point, type Poly } from '../core/geom';
import { lerp, TAU } from '../core/math';
import { pick, rnd, rr } from '../core/rng';
import { PENCIL } from '../media/medium';
import { groundShadow, paint } from '../media/pencil';
import { BARK, BARK_EDGE, BLOOMS, FENCE, GREENS } from './palette';
import { circleCollider, type Scenery } from './types';

/** Trees, bushes, rocks, flowers, fences, lamps — what fills the meadow. */

export function makeTree(x: number, y: number, scale: number): Scenery {
  const trunkWidth = 11 * scale;
  const trunkHeight = 30 * scale;
  const trunk: Poly = [
    [x - trunkWidth * 0.55, y],
    [x + trunkWidth * 0.55, y],
    [x + trunkWidth * 0.34, y - trunkHeight * 0.6],
    [x + trunkWidth * 0.3, y - trunkHeight],
    [x - trunkWidth * 0.3, y - trunkHeight],
    [x - trunkWidth * 0.38, y - trunkHeight * 0.55],
  ];

  const crownY = y - trunkHeight - 16 * scale;
  const base = pick(GREENS);
  const canopy = [
    { poly: circlePoly(x - 20 * scale, crownY + 10 * scale, 25 * scale), fill: shade(base, -0.06) },
    { poly: circlePoly(x + 21 * scale, crownY + 8 * scale, 24 * scale), fill: shade(base, -0.03) },
    { poly: circlePoly(x, crownY, 32 * scale), fill: base },
    { poly: circlePoly(x - 7 * scale, crownY - 13 * scale, 18 * scale), fill: shade(base, 0.09) },
  ];

  // Leaf clumps, so the colour side is as busy as the hatched side.
  const leaves: { x: number; y: number; r: number; fill: string }[] = [];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * 30 * scale;
    leaves.push({
      x: x + Math.cos(a) * d,
      y: crownY + Math.sin(a) * d * 0.85,
      r: rr(3, 7) * scale,
      fill: rnd() < 0.5 ? shade(base, 0.07) : shade(base, -0.07),
    });
  }

  return {
    y,
    tall: true,
    colliders: [circleCollider(x, y - 4, 13 * scale)],
    bounds: { x0: x - 58 * scale, y0: y - 92 * scale, x1: x + 58 * scale, y1: y + 8 },
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 3, 34 * scale, 12 * scale, medium);
      paint(ctx, trunk, BARK, medium, { angle: 1.4, edge: BARK_EDGE });
      for (const clump of canopy) {
        paint(ctx, clump.poly, clump.fill, medium, {
          angle: -0.75,
          outlineAlpha: 0.42,
          darkScale: 0.95,
        });
      }
      if (medium !== 'color') return;
      isolate(ctx, () => {
        tracePoly(ctx, canopy[2].poly);
        ctx.clip();
        ctx.globalAlpha = 0.5;
        for (const leaf of leaves) {
          ctx.fillStyle = leaf.fill;
          ctx.beginPath();
          ctx.arc(leaf.x, leaf.y, leaf.r, 0, TAU);
          ctx.fill();
        }
      });
    },
  };
}

export function makeBush(x: number, y: number, scale: number): Scenery {
  const base = pick(GREENS);
  const clumps = [
    { poly: circlePoly(x - 12 * scale, y - 8 * scale, 14 * scale), fill: shade(base, -0.05) },
    { poly: circlePoly(x + 12 * scale, y - 7 * scale, 13 * scale), fill: shade(base, -0.02) },
    { poly: circlePoly(x, y - 14 * scale, 17 * scale), fill: shade(base, 0.05) },
  ];

  const berries: Point[] = [];
  if (rnd() < 0.45) {
    for (let i = 0; i < 5; i++) {
      berries.push([x + rr(-16, 16) * scale, y - rr(4, 22) * scale]);
    }
  }

  return {
    y,
    tall: true,
    colliders: [circleCollider(x, y - 6, 15 * scale)],
    bounds: { x0: x - 34 * scale, y0: y - 38 * scale, x1: x + 34 * scale, y1: y + 8 },
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 2, 20 * scale, 7 * scale, medium);
      for (const clump of clumps) {
        paint(ctx, clump.poly, clump.fill, medium, { angle: -0.9, outlineAlpha: 0.4 });
      }
      for (const [bx, by] of berries) {
        if (medium === 'color') {
          ctx.beginPath();
          ctx.arc(bx, by, 2.6 * scale, 0, TAU);
          ctx.fillStyle = '#d23b3b';
          ctx.fill();
        } else {
          isolate(ctx, () => {
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = PENCIL;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.arc(bx, by, 2.4 * scale, 0, TAU);
            ctx.stroke();
          });
        }
      }
    },
  };
}

export function makeRock(x: number, y: number, scale: number): Scenery {
  // Squash the circles vertically so they sit on the ground rather than float.
  const squash = (pts: Poly, factor: number): Poly =>
    pts.map(([px, py]) => [px, y - (y - py) * factor] as Point);

  const body = squash(circlePoly(x, y - 7 * scale, 15 * scale, 9, 0.22), 0.72);
  const cap = squash(circlePoly(x - 3 * scale, y - 12 * scale, 7 * scale, 8, 0.25), 0.7);

  return {
    y,
    colliders: [circleCollider(x, y - 4, 14 * scale)],
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 1, 18 * scale, 6 * scale, medium);
      paint(ctx, body, '#9a978e', medium, { angle: -1.25, edge: '#6d6a63' });
      paint(ctx, cap, '#c2beb2', medium, {
        angle: -1.25,
        outlineAlpha: 0.3,
        hatch: medium !== 'sketch',
      });
    },
  };
}

export function makeFlower(x: number, y: number): Scenery {
  const colour = pick(BLOOMS);
  const scale = rr(0.8, 1.25);
  const height = rr(11, 18) * scale;
  const petals: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rnd();
    petals.push({
      x: x + Math.cos(a) * 4.2 * scale,
      y: y - height + Math.sin(a) * 4.2 * scale,
      r: 3.1 * scale,
    });
  }

  return {
    y,
    draw(ctx, medium) {
      if (medium === 'color') {
        ctx.strokeStyle = '#4c8341';
        ctx.lineWidth = 1.5 * scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 2 * scale, y - height * 0.6, x, y - height);
        ctx.stroke();
        ctx.fillStyle = colour;
        for (const p of petals) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#f6e27a';
        ctx.beginPath();
        ctx.arc(x, y - height, 2.1 * scale, 0, TAU);
        ctx.fill();
        return;
      }
      isolate(ctx, () => {
        ctx.strokeStyle = PENCIL;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.42;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(x + rr(-0.6, 0.6), y);
        ctx.quadraticCurveTo(x + 2 * scale, y - height * 0.6, x, y - height);
        ctx.stroke();
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 0.8;
        for (const p of petals) {
          ctx.beginPath();
          ctx.arc(p.x + rr(-0.5, 0.5), p.y + rr(-0.5, 0.5), p.r, 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(x, y - height, 1.6 * scale, 0, TAU);
        ctx.stroke();
      });
    },
  };
}

/**
 * A run of post-and-rail fence following a path.
 *
 * Posts are spaced evenly along the whole path rather than per segment, so a
 * boundary that bends does not bunch its posts up at every corner. The rails
 * simply follow the posts, which is how the bends read.
 */
export function makeFenceRun(path: Point[], height = 32): Scenery {
  const SPACING = 34;
  const posts: Point[] = [[path[0][0] + rr(-1.5, 1.5), path[0][1] + rr(-1.5, 1.5)]];

  let carried = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let travelled = SPACING - carried;
    while (travelled <= length) {
      const t = travelled / length;
      posts.push([
        lerp(a[0], b[0], t) + rr(-1.5, 1.5),
        lerp(a[1], b[1], t) + rr(-1.5, 1.5),
      ]);
      travelled += SPACING;
    }
    carried = length - (travelled - SPACING);
  }
  const last = path[path.length - 1];
  posts.push([last[0] + rr(-1.5, 1.5), last[1] + rr(-1.5, 1.5)]);

  const RAIL_HEIGHTS = [height * 0.44, height * 0.75];
  const POST_HEIGHT = height;

  return {
    // Deliberately not solid: a paddock you cannot walk into is a paddock you
    // never see the inside of.
    y: posts.reduce((lowest, p) => Math.max(lowest, p[1]), -Infinity),
    draw(ctx, medium) {
      if (medium === 'color') {
        ctx.strokeStyle = FENCE;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const offset of RAIL_HEIGHTS) {
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          posts.forEach(([px, py], i) =>
            i ? ctx.lineTo(px, py - offset) : ctx.moveTo(px, py - offset),
          );
          ctx.stroke();
        }
        ctx.lineWidth = 5;
        for (const [px, py] of posts) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px, py - POST_HEIGHT);
          ctx.stroke();
        }
        return;
      }
      isolate(ctx, () => {
        ctx.strokeStyle = PENCIL;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.5;
        for (const offset of RAIL_HEIGHTS) {
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          posts.forEach(([px, py], i) => {
            const ry = py - offset + rr(-1, 1);
            if (i) ctx.lineTo(px, ry);
            else ctx.moveTo(px, ry);
          });
          ctx.stroke();
        }
        ctx.lineWidth = 1.3;
        for (const [px, py] of posts) {
          ctx.beginPath();
          ctx.moveTo(px + rr(-1, 1), py);
          ctx.lineTo(px + rr(-1, 1), py - POST_HEIGHT);
          ctx.stroke();
        }
      });
    },
  };
}

/** A straight run between two points. */
export function makeFence(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  height = 32,
): Scenery {
  return makeFenceRun(
    [
      [x1, y1],
      [x2, y2],
    ],
    height,
  );
}

export function makeLamp(x: number, y: number): Scenery {
  const post = rectPoly(x - 2.5, y - 62, 5, 62);
  const head: Poly = [
    [x - 9, y - 62],
    [x + 9, y - 62],
    [x + 6, y - 78],
    [x - 6, y - 78],
  ];

  return {
    y,
    tall: true,
    colliders: [circleCollider(x, y - 6, 9)],
    bounds: { x0: x - 50, y0: y - 118, x1: x + 50, y1: y + 8 },
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 1, 12, 5, medium);
      paint(ctx, post, '#5d5750', medium, { angle: 1.5, outlineAlpha: 0.5 });
      paint(ctx, head, '#f2d98a', medium, { angle: -0.6, edge: '#5d5750', darkScale: 1.6 });
      if (medium !== 'color') return;
      const glow = ctx.createRadialGradient(x, y - 70, 0, x, y - 70, 46);
      glow.addColorStop(0, 'rgba(255,225,150,.42)');
      glow.addColorStop(1, 'rgba(255,225,150,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y - 70, 46, 0, TAU);
      ctx.fill();
    },
  };
}

/** Window mullions, shared by the cottages. */
export function drawWindowBars(ctx: CanvasRenderingContext2D, window: Poly): void {
  const b = bounds(window);
  ctx.beginPath();
  ctx.moveTo((b.x0 + b.x1) / 2, b.y0);
  ctx.lineTo((b.x0 + b.x1) / 2, b.y1);
  ctx.moveTo(b.x0, (b.y0 + b.y1) / 2);
  ctx.lineTo(b.x1, (b.y0 + b.y1) / 2);
  ctx.stroke();
}
