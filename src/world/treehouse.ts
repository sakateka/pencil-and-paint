import { isolate } from '../core/canvas';
import { circlePoly, rectPoly, tracePoly, type Poly } from '../core/geom';
import { TAU } from '../core/math';
import { rr } from '../core/rng';
import { PENCIL } from '../media/medium';
import { groundShadow, paint } from '../media/pencil';
import { drawWindowBars } from './scenery';
import { BARK, GREENS, ROOFS, WOOD, WOOD_EDGE } from './palette';
import { circleCollider, type Scenery } from './types';

/**
 * A house up a tree, out past the hammock.
 *
 * The one thing in the valley somebody clearly built rather than left. It is
 * shut — there is no way up but the ladder and no reason given for it — and
 * that is the point: a place further out than anywhere you need to go, so that
 * walking to the far side of the field has something at the end of it.
 */

/** How high the platform sits. Tall enough to have to look up at. */
export const FLOOR = 86;

/** The hut on it. */
export const HUT_W = 74;
export const HUT_H = 44;

/** Where somebody inside stands, from the foot of the tree. */
export const INSIDE_X = -8;
export const INSIDE_Y = -FLOOR - 13;

export function makeTreehouse(x: number, y: number): Scenery {
  const trunkTop = y - FLOOR - 34;
  const trunk: Poly = [
    [x - 13, y],
    [x + 13, y],
    [x + 8, y - FLOOR * 0.55],
    [x + 7, trunkTop],
    [x - 7, trunkTop],
    [x - 9, y - FLOOR * 0.5],
  ];

  // The canopy sits behind and above the hut, so the house is tucked into it.
  const base = GREENS[2];
  const canopy = [
    circlePoly(x - 40, trunkTop - 4, 30),
    circlePoly(x + 42, trunkTop - 8, 28),
    circlePoly(x + 2, trunkTop - 26, 38),
    circlePoly(x - 22, trunkTop - 34, 24),
  ];

  const floor = rectPoly(x - HUT_W / 2 - 5, y - FLOOR, HUT_W + 10, 6);
  const hut = rectPoly(x - HUT_W / 2, y - FLOOR - HUT_H, HUT_W, HUT_H);
  const roof: Poly = [
    [x - HUT_W / 2 - 8, y - FLOOR - HUT_H],
    [x, y - FLOOR - HUT_H - 26],
    [x + HUT_W / 2 + 8, y - FLOOR - HUT_H],
  ];
  const window = rectPoly(x + 8, y - FLOOR - HUT_H + 12, 20, 17);
  const door = rectPoly(x - 26, y - FLOOR - 26, 19, 26);

  /** The ladder up the trunk, and the rail round the platform. */
  const timbers = (ctx: CanvasRenderingContext2D, wobble: number) => {
    const w = () => (wobble ? rr(-wobble, wobble) : 0);
    ctx.beginPath();
    // Two rails and the rungs between them.
    ctx.moveTo(x - 16 + w(), y);
    ctx.lineTo(x - 13 + w(), y - FLOOR + 2);
    ctx.moveTo(x - 4 + w(), y);
    ctx.lineTo(x - 3 + w(), y - FLOOR + 2);
    for (let i = 1; i <= 6; i++) {
      const ry = y - (FLOOR / 7) * i;
      ctx.moveTo(x - 16 + w(), ry);
      ctx.lineTo(x - 3 + w(), ry);
    }
    // The handrail along the front of the platform.
    ctx.moveTo(x - HUT_W / 2 - 5 + w(), y - FLOOR - 13);
    ctx.lineTo(x + HUT_W / 2 + 5 + w(), y - FLOOR - 13);
    for (const px of [-HUT_W / 2 - 4, -10, 22, HUT_W / 2 + 4]) {
      ctx.moveTo(x + px + w(), y - FLOOR - 13);
      ctx.lineTo(x + px + w(), y - FLOOR);
    }
    ctx.stroke();
  };

  return {
    y,
    tall: true,
    colliders: [circleCollider(x, y - 6, 17)],
    bounds: { x0: x - 78, y0: trunkTop - 74, x1: x + 78, y1: y + 10 },
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 1, 30, 10, medium);

      // Canopy behind, then the trunk, then what is nailed to it.
      for (const [i, blob] of canopy.entries()) {
        paint(ctx, blob, i === 2 ? base : GREENS[i % GREENS.length], medium, {
          angle: -0.9,
          outlineAlpha: 0.35,
          darkScale: 0.85,
        });
      }
      paint(ctx, trunk, BARK, medium, { angle: -1.35, outlineAlpha: 0.5 });

      paint(ctx, floor, WOOD_EDGE, medium, { angle: -1.1, outlineAlpha: 0.5 });
      paint(ctx, hut, WOOD, medium, { angle: -1.15, edge: WOOD_EDGE, darkScale: 0.9 });
      paint(ctx, roof, ROOFS[3], medium, { angle: -0.95, darkScale: 1.1 });
      paint(ctx, door, '#6b4a2c', medium, { angle: -0.7, darkScale: 1.2 });
      paint(ctx, window, '#f7e6b4', medium, { angle: -0.6, darkScale: 0.35 });
      drawWindowBars(ctx, window);

      if (medium === 'color') {
        ctx.strokeStyle = WOOD_EDGE;
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        timbers(ctx, 0);

        // Planking across the hut, so it reads as built rather than moulded.
        isolate(ctx, () => {
          tracePoly(ctx, hut);
          ctx.clip();
          ctx.strokeStyle = 'rgba(122,87,48,.45)';
          ctx.lineWidth = 1;
          for (let i = 1; i < 5; i++) {
            const ly = y - FLOOR - HUT_H + (HUT_H / 5) * i;
            ctx.beginPath();
            ctx.moveTo(x - HUT_W / 2, ly);
            ctx.lineTo(x + HUT_W / 2, ly);
            ctx.stroke();
          }
        });

        // A rope off the platform, because every treehouse has one.
        ctx.strokeStyle = '#b8926a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x + HUT_W / 2 + 2, y - FLOOR + 1);
        ctx.quadraticCurveTo(x + HUT_W / 2 + 12, y - FLOOR * 0.5, x + HUT_W / 2 + 6, y - 14);
        ctx.stroke();
        ctx.fillStyle = '#8a6a3f';
        ctx.beginPath();
        ctx.arc(x + HUT_W / 2 + 6, y - 12, 3, 0, TAU);
        ctx.fill();
        return;
      }

      isolate(ctx, () => {
        ctx.strokeStyle = PENCIL;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.15;
        ctx.lineCap = 'round';
        timbers(ctx, 0.7);
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 0.85;
        for (let i = 1; i < 5; i++) {
          const ly = y - FLOOR - HUT_H + (HUT_H / 5) * i;
          ctx.beginPath();
          ctx.moveTo(x - HUT_W / 2 + rr(-1, 1), ly);
          ctx.lineTo(x + HUT_W / 2 + rr(-1, 1), ly);
          ctx.stroke();
        }
        // The rope, sketched.
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(x + HUT_W / 2 + 2, y - FLOOR + 1);
        ctx.quadraticCurveTo(
          x + HUT_W / 2 + 12 + rr(-1, 1),
          y - FLOOR * 0.5,
          x + HUT_W / 2 + 6,
          y - 14,
        );
        ctx.stroke();
      });

    },
  };
}

/**
 * Somebody inside, seen through the wall.
 *
 * No zoom and no cutaway view: the hut stays exactly the size and angle it was,
 * and instead the near wall goes soft over whoever is behind it. The planking
 * is drawn again on top at a low alpha, which is what makes it read as looking
 * *through* the boards rather than as a hole cut in them.
 *
 * `shown` runs 0 to 1 as they climb in, so the wall fades rather than blinking.
 */
export function drawInside(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  shown: number,
): void {
  if (shown <= 0.01) return;
  const cx = x + INSIDE_X;
  const cy = y + INSIDE_Y;
  const breath = Math.sin(t * 1.3) * 0.5;

  ctx.save();
  ctx.globalAlpha = Math.min(1, shown);

  // The wall, gone soft. A radial patch of the room behind it, fading out so
  // there is no edge anywhere — an edge would be a hole.
  const seeThrough = ctx.createRadialGradient(cx, cy - 8, 4, cx, cy - 8, 32);
  // Lit rather than dark: a room with somebody in it has a lamp on, and a dark
  // patch made the figure inside it unreadable against its own shadow.
  seeThrough.addColorStop(0, 'rgba(120,92,58,.95)');
  seeThrough.addColorStop(0.6, 'rgba(96,72,46,.88)');
  seeThrough.addColorStop(1, 'rgba(88,66,42,0)');
  ctx.fillStyle = seeThrough;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - HUT_W / 2, y - FLOOR - HUT_H, HUT_W, HUT_H);
  ctx.clip();
  ctx.fillRect(x - HUT_W / 2, y - FLOOR - HUT_H, HUT_W, HUT_H);

  // Whoever it is, standing in their own house.
  ctx.fillStyle = '#3a5a86';
  ctx.fillRect(cx - 5, cy - 9, 10, 10);
  ctx.fillStyle = '#d9463c';
  ctx.fillRect(cx - 6.5, cy - 21 + breath, 13, 13);
  ctx.fillStyle = '#f7c14b';
  ctx.fillRect(cx - 6.5, cy - 15 + breath, 13, 2.4); // the scarf, so it is plainly them
  ctx.fillStyle = '#e8a06a';
  ctx.beginPath();
  ctx.arc(cx, cy - 25.5 + breath, 5.8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#4a3b30';
  ctx.beginPath();
  ctx.arc(cx, cy - 27.5 + breath, 5.8, Math.PI, TAU);
  ctx.fill();

  // And the boards again, over the top of them.
  ctx.globalAlpha = Math.min(1, shown) * 0.34;
  ctx.strokeStyle = WOOD_EDGE;
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const ly = y - FLOOR - HUT_H + (HUT_H / 5) * i;
    ctx.beginPath();
    ctx.moveTo(x - HUT_W / 2, ly);
    ctx.lineTo(x + HUT_W / 2, ly);
    ctx.stroke();
  }
  ctx.restore();

  // The window warms up, which is the part you can see from across the field.
  ctx.globalAlpha = Math.min(1, shown);
  ctx.fillStyle = '#ffd98a';
  ctx.fillRect(x + 8, y - FLOOR - HUT_H + 12, 20, 17);
  /*
   * A head and shoulders in the window, which is the part that reads from
   * across the field — the cut-away wall is only legible up close.
   */
  ctx.fillStyle = 'rgba(58,44,28,.62)';
  const wy = y - FLOOR - HUT_H + 24 + breath * 0.6;
  ctx.beginPath();
  ctx.ellipse(x + 18, wy + 4, 7, 4.4, 0, Math.PI, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 18, wy - 1.5, 3.6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = WOOD_EDGE;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + 18, y - FLOOR - HUT_H + 12);
  ctx.lineTo(x + 18, y - FLOOR - HUT_H + 29);
  ctx.moveTo(x + 8, y - FLOOR - HUT_H + 20.5);
  ctx.lineTo(x + 28, y - FLOOR - HUT_H + 20.5);
  ctx.stroke();

  // A little of it spills onto the platform.
  const spill = ctx.createRadialGradient(x + 18, y - FLOOR - HUT_H + 20, 2, x + 18, y - FLOOR - HUT_H + 20, 44);
  spill.addColorStop(0, 'rgba(255,214,130,.30)');
  spill.addColorStop(1, 'rgba(255,214,130,0)');
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.arc(x + 18, y - FLOOR - HUT_H + 20, 44, 0, TAU);
  ctx.fill();

  ctx.restore();
}
