import { isolate } from '../core/canvas';
import { shade } from '../core/color';
import { bounds, circlePoly, rectPoly, tracePoly, type Point, type Poly } from '../core/geom';
import { lerp, TAU } from '../core/math';
import { pick, rnd, rr } from '../core/rng';
import { PENCIL } from '../media/medium';
import { groundShadow, paint } from '../media/pencil';
import { BARK, BARK_EDGE, BLOOMS, FENCE, GREENS } from './palette';
import { circleCollider, segmentCollider, type Collider, type Scenery } from './types';

/**
 * How far a rail holds an animal off its own centre line.
 *
 * Thin on purpose: the animal's own radius does most of the work, and a fat
 * rail would keep a sheep standing oddly far back from a fence it wants to
 * lean on.
 */
const RAIL_THICKNESS = 2.5;

/** Trees, bushes, rocks, flowers, fences, lamps — what fills the meadow. */

export function makeTree(x: number, y: number, scale: number): Scenery {
  /*
   * Slender, and tall enough to show.
   *
   * These used to read as stumps, and the arithmetic says why: the canopy hung
   * down to within ten units of the ground while the trunk was twelve across,
   * so the visible bit was wider than it was tall. Narrowing the trunk and
   * lifting the crown puts the proportions back at about three to one.
   */
  const trunkWidth = 7 * scale;
  const trunkHeight = 44 * scale;
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
    colliders: [circleCollider(x, y - 4, 11 * scale)],
    bounds: { x0: x - 58 * scale, y0: y - 102 * scale, x1: x + 58 * scale, y1: y + 8 },
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

  /*
   * Solid to the stock, and only to the stock.
   *
   * One thick line per span rather than a circle per post: the posts stand 34
   * apart and a chicken is about eleven across, so circles would be a row of
   * open doors. You walk through all of it regardless — see `stockColliders`.
   */
  const rails: Collider[] = [];
  for (let i = 1; i < posts.length; i++) {
    rails.push(segmentCollider(posts[i - 1][0], posts[i - 1][1], posts[i][0], posts[i][1], RAIL_THICKNESS));
  }

  return {
    y: posts.reduce((lowest, p) => Math.max(lowest, p[1]), -Infinity),
    stockColliders: rails,
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

/**
 * The gate that shuts the gap the fence run leaves, and the rails either side.
 *
 * Shut, not standing open. The gap was there so the stock had a way in and you
 * had a way through, but an unfilled gap reads as a missing wall rather than as
 * a way in — worst on the hen run, where the gap is the whole of one end. A
 * hung gate says the same thing and looks deliberate, and it holds the stock,
 * since you walk through it exactly as you walk through the rails.
 *
 * The gate is not stretched across the whole gap. It was, and the result read
 * as a stretch of fence with extra rails: the paddock's gap is 223 across and
 * 36 high, so bars drawn corner to corner were four near-parallel lines and the
 * brace lay almost flat. A gate is about three times as wide as it is tall,
 * which is the proportion the eye knows one by — so it is cut to that, hung in
 * the middle of the gap, and plain fence fills whatever is left over.
 *
 * Uses no `rng` at build time on purpose — it is made inside `enclose`, which
 * runs before the valley is scattered, and one extra draw from the shared
 * stream would move every tree, rock and pot in it. The gap's two ends already
 * carry the fence's own jitter, so nothing here stands quite straight anyway.
 */
export function makeGate(from: Point, to: Point, height = 32): Scenery {
  const span = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const ux = (to[0] - from[0]) / (span || 1);
  const uy = (to[1] - from[1]) / (span || 1);

  const width = Math.min(span, height * 3);
  const start = (span - width) / 2;
  const at = (d: number): Point => [from[0] + ux * d, from[1] + uy * d];

  // The two hanging posts, and the plain fence shutting the rest of the gap.
  const hangA = at(start);
  const hangB = at(start + width);
  const stubs: [Point, Point][] = [];
  if (start > 1) stubs.push([from, hangA], [hangB, to]);

  const POST_HEIGHT = height * 1.3;
  const RAILS = [height * 0.44, height * 0.75];
  const BARS = [0.26, 0.5, 0.74, 0.98].map((f) => height * f);

  /** A line from one end of the gate to the other, at a given height. */
  const bar = (ctx: CanvasRenderingContext2D, offset: number, wobble: number) => {
    ctx.beginPath();
    ctx.moveTo(hangA[0], hangA[1] - offset + wobble);
    ctx.lineTo(hangB[0], hangB[1] - offset - wobble);
    ctx.stroke();
  };

  /** The stub fence: two rails and a post at each end, like the run it joins. */
  const stubRails = (ctx: CanvasRenderingContext2D, wobble: () => number) => {
    for (const [p, q] of stubs) {
      for (const offset of RAILS) {
        ctx.beginPath();
        ctx.moveTo(p[0], p[1] - offset + wobble());
        ctx.lineTo(q[0], q[1] - offset + wobble());
        ctx.stroke();
      }
    }
  };

  const stubPosts = (ctx: CanvasRenderingContext2D, wobble: () => number) => {
    for (const [p] of stubs) {
      ctx.beginPath();
      ctx.moveTo(p[0] + wobble(), p[1]);
      ctx.lineTo(p[0] + wobble(), p[1] - height);
      ctx.stroke();
    }
  };

  return {
    y: Math.max(from[1], to[1]),
    // Solid to the stock across the whole gap — gate and stubs alike — so the
    // field is a closed field. You are not stock.
    stockColliders: [segmentCollider(from[0], from[1], to[0], to[1], RAIL_THICKNESS)],
    draw(ctx, medium) {
      const none = () => 0;
      if (medium === 'color') {
        ctx.strokeStyle = FENCE;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.5;
        stubRails(ctx, none);
        ctx.lineWidth = 5;
        stubPosts(ctx, none);

        // Four bars where the fence has two rails: a gate is the close-boarded
        // bit, and that difference is most of what names it at a glance.
        ctx.lineWidth = 2.8;
        for (const offset of BARS) bar(ctx, offset, 0);
        // The brace, rising from the hanging post to the far top corner. This
        // is the line that says hung rather than propped.
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(hangA[0], hangA[1] - BARS[0]);
        ctx.lineTo(hangB[0], hangB[1] - BARS[BARS.length - 1]);
        ctx.stroke();
        // And the posts it hangs between, taller and heavier than the fence's.
        ctx.lineWidth = 6.5;
        for (const [px, py] of [hangA, hangB]) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px, py - POST_HEIGHT);
          ctx.stroke();
        }
        return;
      }
      isolate(ctx, () => {
        const wobble = () => rr(-1, 1);
        ctx.strokeStyle = PENCIL;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.1;
        stubRails(ctx, wobble);
        ctx.lineWidth = 1.3;
        stubPosts(ctx, wobble);

        ctx.lineWidth = 1.1;
        for (const offset of BARS) bar(ctx, offset, wobble());
        ctx.beginPath();
        ctx.moveTo(hangA[0] + wobble(), hangA[1] - BARS[0]);
        ctx.lineTo(hangB[0] + wobble(), hangB[1] - BARS[BARS.length - 1]);
        ctx.stroke();
        ctx.lineWidth = 1.6;
        for (const [px, py] of [hangA, hangB]) {
          ctx.beginPath();
          ctx.moveTo(px + wobble(), py);
          ctx.lineTo(px + wobble(), py - POST_HEIGHT);
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
