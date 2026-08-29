import { isolate } from '../core/canvas';
import { circlePoly, ellipsePoly, rectPoly, tracePoly, type Point, type Poly } from '../core/geom';
import { TAU } from '../core/math';
import { rng, rnd, rr } from '../core/rng';
import { PENCIL, type Medium } from '../media/medium';
import { groundShadow, paint } from '../media/pencil';
import { circleCollider, rectCollider, type Scenery } from './types';

/**
 * The house and the pine from the drawing.
 *
 * Everything else on this hillside was invented for the game. These two were
 * drawn on paper first — a steep-roofed house with fish-scale tiles standing on
 * a block foundation, and a tree with a bare trunk and four bunches of leaves
 * stuck on it — and the job here is to be recognisably *those*, not a tidier
 * version of them. So the roof leans, the window is not square with the wall,
 * the tree's leaf bunches are three different sizes and none of them are round.
 * Straightening any of that would make it somebody else's house.
 *
 * Bigger than the cottages already in the valley, and deliberately: this is the
 * one you walk north to find.
 */

const TILE = '#e5928c';
const TILE_DARK = '#cf6a68';
const TILE_EDGE = '#a94c4a';
const BRICK = '#dd9a5c';
const BRICK_LINE = 'rgba(140,80,38,.55)';
const GLASS = '#5b9fd6';
const GLASS_EDGE = '#2f5f8c';
const DOOR = '#a9793f';
const BLOCK = '#b0aca2';
const BLOCK_LINE = 'rgba(90,86,78,.55)';
const RUBBLE = '#9a968c';
const SOOT = '#7d7973';
const NEEDLE = '#4f9256';
const NEEDLE_DARK = '#3d7a46';
const PINE_BARK = '#8a6034';

/** Sample a quadratic curve into a polygon, so `paint` can hatch it. */
function bow(from: Point, control: Point, to: Point, steps = 7): Point[] {
  const pts: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u * u * from[0] + 2 * u * t * control[0] + t * t * to[0],
      u * u * from[1] + 2 * u * t * control[1] + t * t * to[1],
    ]);
  }
  return pts;
}

/**
 * The house, on its foundation.
 *
 * `y` is the ground at the middle of it. The ground falls away eastward here —
 * that is the whole reason the foundation exists in the drawing — so the blocks
 * show barely two courses at the uphill end and four at the downhill one.
 */
export function makePaintedHouse(x: number, y: number, s = 1): Scenery {
  const w = 190;
  const wallH = 132;

  /** Where the walls stop and the blocks begin. */
  const sill = y - 30;
  /** How far the foundation reaches below the sill at either end. */
  const shallow = 24;
  const deep = 70;
  const plinthW = w + 26;

  const wallTop = sill - wallH;
  const apex: Point = [x + 10, wallTop - 152];
  const eaveL: Point = [x - w / 2 - 15, wallTop];
  const eaveR: Point = [x + w / 2 + 15, wallTop];

  /*
   * The roof, bowed rather than straight.
   *
   * Two long edges drawn freehand never come out as clean triangle sides; both
   * of these belly outwards a little, and the right one more than the left,
   * which is what stops the house reading as a shape from a toolbar.
   */
  const roof: Poly = [
    eaveL,
    ...bow(eaveL, [x - w * 0.36, wallTop - 92], apex),
    ...bow(apex, [x + w * 0.34, wallTop - 84], eaveR),
    [x + w / 2 + 8, wallTop + 7],
    [x - w / 2 - 8, wallTop + 7],
  ];

  const body = rectPoly(x - w / 2, wallTop, w, wallH);

  // The foundation: level along the top, following the fall of the ground below.
  const plinth: Poly = [
    [x - plinthW / 2, sill],
    [x + plinthW / 2, sill],
    [x + plinthW / 2, sill + deep],
    [x + plinthW * 0.18, sill + deep - 6],
    [x - plinthW / 2, sill + shallow],
  ];

  /*
   * The window, out of true on purpose.
   *
   * In the drawing it is a leaning quadrilateral with the blue gone over the
   * edge on one side. Squared up it looks like a window; left leaning it looks
   * like a window somebody drew.
   */
  const window: Poly = [
    [x - 78, wallTop + 26],
    [x - 16, wallTop + 18],
    [x - 13, wallTop + 78],
    [x - 76, wallTop + 84],
  ];

  const door = rectPoly(x + 18, sill - 86, 46, 86);
  const chimney = rectPoly(x + 48, wallTop - 118, 17, 46);
  const gable = { x: x - 4, y: wallTop - 66, r: 25 };

  /** Blocks: nine across, and as many courses down as the ground allows. */
  const COLS = 9;
  const bw = plinthW / COLS;
  const bh = 14;

  /*
   * Drawn about its own base rather than built at a size.
   *
   * How tall it may be is set by how far the camera is allowed over the top of
   * the paper, and that number moved twice while this was being fitted onto the
   * skyline. Scaling the finished drawing about the point it stands on is one
   * number to turn; rewriting forty offsets is not.
   */
  const scaled = (ctx: CanvasRenderingContext2D, fn: () => void): void => {
    if (s === 1) {
      fn();
      return;
    }
    isolate(ctx, () => {
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.translate(-x, -y);
      fn();
    });
  };

  return {
    y,
    colliders: [rectCollider(x - (w * s) / 2, y - (wallH + 30) * s, w * s, (wallH + 30) * s)],
    bounds: {
      x0: x - 120 * s,
      y0: y - 345 * s,
      x1: x + 120 * s,
      y1: y + 30 * s,
    },
    tall: true,
    draw(ctx, medium) {
      rng.replay(0x31a7c4e2, () => scaled(ctx, () => strokes(ctx, medium)));
    },
  };

  function strokes(ctx: CanvasRenderingContext2D, medium: Medium): void {
      groundShadow(ctx, x + 6, sill + deep - 6, w * 0.62, 15, medium);

      // --- the foundation ---
      paint(ctx, plinth, BLOCK, medium, { angle: 0.2, edge: 'rgba(70,66,58,.45)', darkScale: 1.2 });
      isolate(ctx, () => {
        // Clipped to the plinth, so the courses stop where the ground rises.
        tracePoly(ctx, plinth);
        ctx.clip();
        if (medium === 'color') {
          ctx.strokeStyle = BLOCK_LINE;
          ctx.lineWidth = 1.6;
        } else {
          ctx.strokeStyle = PENCIL;
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 1;
        }
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let row = 1; row * bh < deep + 4; row++) {
          const ly = sill + row * bh;
          ctx.moveTo(x - plinthW / 2 - 2, ly + rr(-1, 1));
          ctx.lineTo(x + plinthW / 2 + 2, ly + rr(-1, 1));
        }
        for (let row = 0; row * bh < deep + 4; row++) {
          // Staggered, like courses actually are.
          const offset = row % 2 ? bw / 2 : 0;
          for (let col = 0; col <= COLS; col++) {
            const lx = x - plinthW / 2 + col * bw + offset;
            ctx.moveTo(lx + rr(-1, 1), sill + row * bh);
            ctx.lineTo(lx + rr(-1, 1), sill + (row + 1) * bh);
          }
        }
        ctx.stroke();
        /*
         * And the round stones set into it, which are the thing that makes it
         * read as a foundation rather than as a grey box. They are drawn as
         * plain ovals in the picture, sitting proud of the blocks.
         */
        for (let i = 0; i < 7; i++) {
          const sx = x - plinthW / 2 + rr(12, plinthW - 12);
          const sy = sill + rr(8, deep - 6);
          const poly = ellipsePoly(sx, sy, rr(7, 11), rr(5, 8), 14, 0.09);
          paint(ctx, poly, RUBBLE, medium, { hatch: false, edge: 'rgba(70,66,58,.6)' });
        }
      });

      // --- the walls ---
      paint(ctx, body, BRICK, medium, { angle: 1.5, edge: 'rgba(140,80,38,.5)', darkScale: 1.25 });
      isolate(ctx, () => {
        tracePoly(ctx, body);
        ctx.clip();
        if (medium === 'color') {
          ctx.strokeStyle = BRICK_LINE;
          ctx.lineWidth = 1.4;
        } else {
          ctx.strokeStyle = PENCIL;
          ctx.globalAlpha = 0.32;
          ctx.lineWidth = 0.9;
        }
        ctx.lineCap = 'round';
        ctx.beginPath();
        const ch = 17;
        const cw = 30;
        for (let row = 0; row * ch < wallH; row++) {
          const ly = wallTop + row * ch;
          ctx.moveTo(x - w / 2, ly + rr(-1.2, 1.2));
          ctx.lineTo(x + w / 2, ly + rr(-1.2, 1.2));
          const offset = row % 2 ? cw / 2 : 0;
          for (let col = 0; col <= w / cw; col++) {
            const lx = x - w / 2 + col * cw + offset;
            ctx.moveTo(lx + rr(-1.2, 1.2), ly);
            ctx.lineTo(lx + rr(-1.2, 1.2), ly + ch);
          }
        }
        ctx.stroke();
      });

      // --- the door ---
      paint(ctx, door, DOOR, medium, { angle: 1.5, edge: 'rgba(90,58,28,.6)' });
      if (medium === 'color') {
        ctx.strokeStyle = 'rgba(90,58,28,.45)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let i = 1; i < 3; i++) {
          ctx.moveTo(x + 18 + (i * 46) / 3, sill - 84);
          ctx.lineTo(x + 18 + (i * 46) / 3, sill - 4);
        }
        ctx.stroke();
        ctx.fillStyle = '#6d90ac';
        ctx.beginPath();
        ctx.arc(x + 27, sill - 46, 5, 0, TAU);
        ctx.fill();
      } else {
        isolate(ctx, () => {
          ctx.strokeStyle = PENCIL;
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x + 27, sill - 46, 5, 0, TAU);
          ctx.stroke();
        });
      }

      // --- the window ---
      paint(ctx, window, GLASS, medium, { angle: -0.5, edge: GLASS_EDGE, edgeWidth: 2.4 });
      if (medium === 'color') {
        // Panes, and the crayon that went over the frame on the low side.
        ctx.strokeStyle = 'rgba(20,50,80,.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 47, wallTop + 22);
        ctx.lineTo(x - 45, wallTop + 81);
        ctx.moveTo(x - 77, wallTop + 52);
        ctx.lineTo(x - 14, wallTop + 47);
        ctx.stroke();
        isolate(ctx, () => {
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = GLASS;
          ctx.beginPath();
          ctx.moveTo(x - 76, wallTop + 84);
          ctx.quadraticCurveTo(x - 52, wallTop + 100, x - 20, wallTop + 88);
          ctx.lineTo(x - 13, wallTop + 78);
          ctx.closePath();
          ctx.fill();
        });
      }

      // --- the roof ---
      paint(ctx, roof, TILE, medium, { angle: -0.45, edge: TILE_EDGE, edgeWidth: 2 });
      isolate(ctx, () => {
        tracePoly(ctx, roof);
        ctx.clip();
        /*
         * Fish-scale tiles: rows of hanging arcs, offset row to row.
         *
         * Drawn as full scallops rather than as a hatch, because in the picture
         * they are the roof — there is more pencil in the tiles than in
         * everything else on the house put together.
         */
        const rh = 21;
        const rw = 25;
        for (let row = 0; (row - 1) * rh < wallTop - apex[1] + 30; row++) {
          const ty = apex[1] + row * rh;
          const offset = row % 2 ? rw / 2 : 0;
          for (let col = -6; col <= 6; col++) {
            const cx = x + col * rw + offset + rr(-1.5, 1.5);
            if (medium === 'color') {
              ctx.beginPath();
              ctx.arc(cx, ty, rw * 0.56, 0, Math.PI);
              ctx.fillStyle = rnd() < 0.4 ? TILE_DARK : TILE;
              ctx.fill();
              ctx.strokeStyle = 'rgba(150,62,60,.55)';
              ctx.lineWidth = 1.4;
              ctx.stroke();
              continue;
            }
            ctx.strokeStyle = PENCIL;
            ctx.globalAlpha = rr(0.28, 0.5);
            ctx.lineWidth = rr(0.8, 1.3);
            ctx.beginPath();
            ctx.arc(cx, ty + rr(-1, 1), rw * 0.56, 0, Math.PI);
            ctx.stroke();
          }
        }
      });

      // The round window in the gable, over the tiles.
      paint(ctx, circlePoly(gable.x, gable.y, gable.r, 18, 0.05), GLASS, medium, {
        angle: -0.3,
        edge: GLASS_EDGE,
        edgeWidth: 2.4,
      });
      isolate(ctx, () => {
        if (medium === 'color') {
          ctx.strokeStyle = 'rgba(20,50,80,.6)';
          ctx.lineWidth = 1.8;
        } else {
          ctx.strokeStyle = PENCIL;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1;
        }
        // Spokes, the way a round window gets drawn when you are seven.
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI + 0.2;
          ctx.moveTo(gable.x - Math.cos(a) * gable.r, gable.y - Math.sin(a) * gable.r);
          ctx.lineTo(gable.x + Math.cos(a) * gable.r, gable.y + Math.sin(a) * gable.r);
        }
        ctx.stroke();
      });

      // --- the chimney, and what is coming out of it ---
      paint(ctx, chimney, SOOT, medium, { angle: 1.4, edge: 'rgba(50,48,44,.5)' });
      isolate(ctx, () => {
        ctx.strokeStyle = medium === 'color' ? 'rgba(120,116,110,.75)' : PENCIL;
        ctx.globalAlpha = medium === 'color' ? 1 : 0.35;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 56, chimney[0][1] - 4);
        ctx.quadraticCurveTo(x + 44, chimney[0][1] - 22, x + 60, chimney[0][1] - 34);
        ctx.quadraticCurveTo(x + 74, chimney[0][1] - 44, x + 58, chimney[0][1] - 58);
        ctx.stroke();
      });
  }
}

/**
 * The pine, which is a pine because the drawing says so.
 *
 * Botanically it is nothing of the sort: a bare trunk flaring into roots, three
 * short branches with a bunch of leaves on the end of each, and a scribbled
 * crown at the top. Drawing needles on it would be correcting the picture.
 */
export function makePine(x: number, y: number, s = 1): Scenery {
  const height = 168 * s;
  const top = y - height;
  const trunk: Poly = [
    [x - 15 * s, y],
    [x - 6 * s, y - 40 * s],
    [x - 5 * s, top + 10 * s],
    [x + 6 * s, top + 10 * s],
    [x + 7 * s, y - 44 * s],
    [x + 16 * s, y],
  ];

  /** Where the branches leave the trunk, how far out they reach, how big. */
  const branches: { at: number; dir: -1 | 1; reach: number; r: number }[] = [
    { at: 0.3, dir: 1, reach: 40, r: 20 },
    { at: 0.46, dir: -1, reach: 52, r: 25 },
    { at: 0.62, dir: 1, reach: 44, r: 21 },
  ];

  /*
   * The crown: overlapping lobes, longer than they are tall and leaning at
   * different angles, because in the picture it is a bunch of loops rather than
   * a ball of foliage.
   */
  const crown = [
    { dx: -38, dy: 20, rx: 25, ry: 13, a: -0.5 },
    { dx: -20, dy: -12, rx: 22, ry: 12, a: 0.62 },
    { dx: 6, dy: -24, rx: 24, ry: 13, a: -0.15 },
    { dx: 28, dy: -4, rx: 23, ry: 12, a: 0.5 },
    { dx: 8, dy: 14, rx: 26, ry: 13, a: 0.08 },
    { dx: 36, dy: 24, rx: 21, ry: 11, a: -0.42 },
  ];

  /*
   * The drawing does not have loose root strokes propped against the trunk.
   * Its base opens into an uneven fan: a short brace towards the house and a
   * broad root beginning high on the trunk and spreading down the right slope.
   * This high triangular flare is the conspicuous part of the paper original;
   * two nearly horizontal feet miss its shape altogether.
   */
  const leftRoot: Poly = [
    [x - 4 * s, y - 26 * s],
    [x - 10 * s, y - 10 * s],
    [x - 28 * s, y + 7 * s],
    [x - 17 * s, y + 5 * s],
    [x - 3 * s, y - 1 * s],
  ];
  const rightRoot: Poly = [
    [x + 4 * s, y - 48 * s],
    [x + 11 * s, y - 29 * s],
    [x + 25 * s, y - 12 * s],
    [x + 62 * s, y + 5 * s],
    [x + 37 * s, y + 7 * s],
    [x + 16 * s, y + 4 * s],
    [x + 4 * s, y - 1 * s],
  ];

  return {
    y,
    colliders: [circleCollider(x, y - 5 * s, 13 * s)],
    bounds: {
      x0: x - 82 * s,
      y0: top - 42 * s,
      x1: x + 82 * s,
      y1: y + 12 * s,
    },
    tall: true,
    draw(ctx, medium) {
      rng.replay(0x79b20d51, () => strokes(ctx, medium));
    },
  };

  function strokes(ctx: CanvasRenderingContext2D, medium: Medium): void {
      groundShadow(ctx, x, y + 2, 40 * s, 12 * s, medium);

      // Filled continuations of the trunk, so the roots carry its weight.
      paint(ctx, leftRoot, PINE_BARK, medium, {
        angle: 0.25,
        edge: 'rgba(90,62,32,.6)',
        darkScale: 1.05,
      });
      paint(ctx, rightRoot, PINE_BARK, medium, {
        angle: -0.18,
        edge: 'rgba(90,62,32,.6)',
        darkScale: 1.1,
      });

      // Fibres fan out from high on the trunk, as in the pencil original.
      isolate(ctx, () => {
        ctx.strokeStyle = medium === 'color' ? PINE_BARK : PENCIL;
        ctx.globalAlpha = medium === 'color' ? 0.58 : 0.38;
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.35 * s;
        ctx.beginPath();
        ctx.moveTo(x - 8 * s, y - 8 * s);
        ctx.quadraticCurveTo(x - 18 * s, y + 3 * s, x - 30 * s, y + 7 * s);
        ctx.moveTo(x + 6 * s, y - 38 * s);
        ctx.quadraticCurveTo(x + 18 * s, y - 10 * s, x + 54 * s, y + 4 * s);
        ctx.moveTo(x + 8 * s, y - 24 * s);
        ctx.quadraticCurveTo(x + 30 * s, y - 2 * s, x + 63 * s, y + 5 * s);
        ctx.stroke();
      });

      paint(ctx, trunk, PINE_BARK, medium, { angle: 1.5, edge: 'rgba(90,62,32,.6)', darkScale: 1.1 });

      // Branches, drawn before their leaves so the leaves sit on the ends.
      isolate(ctx, () => {
        ctx.strokeStyle = medium === 'color' ? PINE_BARK : PENCIL;
        if (medium !== 'color') ctx.globalAlpha = 0.55;
        ctx.lineCap = 'round';
        ctx.lineWidth = 4.5 * s;
        ctx.beginPath();
        for (const b of branches) {
          const by = y - height * b.at;
          ctx.moveTo(x + b.dir * 5 * s, by);
          ctx.lineTo(x + b.dir * b.reach * s, by - 6 * s);
        }
        ctx.stroke();
      });

      /*
       * One leaf loop.
       *
       * A leaning oval, and only one of them — the first go drew each bunch as
       * three overlapping blobs and the crown as five bunches, which is fifteen
       * shapes packed into one space and came out as a lump of broccoli. In the
       * drawing you can see between the loops, and that is what makes it a
       * bunch of leaves and not a canopy.
       */
      const loop = (cx: number, cy: number, rx: number, ry: number, a: number, dark: boolean) => {
        const flat = ellipsePoly(cx, cy, rx, ry, 22, 0.07);
        const sin = Math.sin(a);
        const cos = Math.cos(a);
        const turned = flat.map(
          ([px, py]) =>
            [
              cx + (px - cx) * cos - (py - cy) * sin,
              cy + (px - cx) * sin + (py - cy) * cos,
            ] as const,
        );
        paint(ctx, turned as unknown as Poly, dark ? NEEDLE_DARK : NEEDLE, medium, {
          angle: a - 0.7,
          edge: 'rgba(40,90,50,.65)',
          edgeWidth: 1.8,
          darkScale: 1.15,
        });
        if (medium !== 'color') return;
        // The scribble inside, which is most of what the drawing actually is.
        isolate(ctx, () => {
          ctx.strokeStyle = 'rgba(30,80,42,.5)';
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (let i = -1; i <= 1; i++) {
            const t = i * rx * 0.42;
            ctx.moveTo(cx + t * cos + ry * 0.5 * sin, cy + t * sin - ry * 0.5 * cos);
            ctx.lineTo(cx + t * cos - ry * 0.5 * sin, cy + t * sin + ry * 0.5 * cos);
          }
          ctx.stroke();
        });
      };

      // A bunch on the end of a branch: two loops, crossing.
      for (const b of branches) {
        const by = y - height * b.at - 8 * s;
        const bx = x + b.dir * (b.reach + b.r * 0.55) * s;
        loop(bx - b.r * 0.24 * s, by + b.r * 0.18 * s, b.r * 0.82 * s, b.r * 0.5 * s, -0.34, false);
        loop(bx + b.r * 0.28 * s, by - b.r * 0.2 * s, b.r * 0.7 * s, b.r * 0.44 * s, 0.42, true);
      }
      // And the crown: six of them, spread far enough apart to read separately.
      for (const c of crown) {
        loop(x + c.dx * s, top + c.dy * s, c.rx * s, c.ry * s, c.a, (c.dx + c.dy) % 2 === 0);
      }
  }
}
