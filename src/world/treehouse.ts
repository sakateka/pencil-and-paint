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

/**
 * The window, as one rectangle from the foot of the tree.
 *
 * Shared by the boards and by whoever is behind them: the baked window and the
 * live view through it have to be the same hole, and two copies of four numbers
 * is two copies that can drift.
 */
export const WINDOW = { dx: 6, dy: 10, w: 24, h: 21 } as const;

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
  const window = rectPoly(x + WINDOW.dx, y - FLOOR - HUT_H + WINDOW.dy, WINDOW.w, WINDOW.h);
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
 * Whoever is up there, seen through the window and nowhere else.
 *
 * The wall is a wall. An earlier version made it go soft over them, which read
 * as a hole cut in somebody's house rather than as somebody being in it — so
 * now the only way to see in is the way there actually is, and walking about
 * the room means crossing the one part of the wall you can be seen through.
 *
 * The clip to the glass is what does the work: the figure is drawn at full size
 * in the room's own coordinates and simply is not painted anywhere the window
 * is not. As pictures the clip is the one thing that cannot be a transform —
 * see `render/looks/window.ts`, where it becomes a crop on the sprite.
 *
 * Four parts, drawn in this order: the lit room, whoever is in it, the frame
 * over the top of them both, and the lamplight spilling onto the platform.
 */

/** Where the window is, in world units, given where the tree stands. */
export function windowPane(x: number, y: number): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const left = x + WINDOW.dx;
  const top = y - FLOOR - HUT_H + WINDOW.dy;
  return { left, top, right: left + WINDOW.w, bottom: top + WINDOW.h };
}

/** Where the floor of the room is, which is what the figure stands on. */
export function roomFloor(y: number): number {
  return y - FLOOR - 2;
}

/** How far the walking bob lifts them at this point in the step. */
export function roomBob(walk: number, moving: boolean): number {
  return moving ? Math.abs(Math.sin(walk * Math.PI * 2)) * 1.4 : 0;
}

/** The room behind them: lit, because somebody is in it. Drawn about the pane. */
export function drawRoomLight(ctx: CanvasRenderingContext2D): void {
  const { w, h } = WINDOW;
  const lamp = ctx.createLinearGradient(0, 0, 0, h);
  lamp.addColorStop(0, '#f0cf94');
  lamp.addColorStop(1, '#c79a5e');
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Them, about their own feet.
 *
 * `facing` is baked rather than mirrored on the way out, because this is the
 * one drawing in the game that is cut to a hole in a wall: a crop is measured
 * in the picture's own pixels, and a mirrored picture measures them from the
 * other end. Two pictures of something eleven pixels wide is not a saving worth
 * that. The difference between them is an eye and the parting of the hair.
 */
export function drawRoomFigure(ctx: CanvasRenderingContext2D, facing: -1 | 1): void {
  ctx.save();
  ctx.scale(facing, 1);
  ctx.fillStyle = '#3a5a86';
  ctx.fillRect(-4.5, -10, 9, 10);
  ctx.fillStyle = '#d9463c';
  ctx.fillRect(-5.5, -21, 11, 11);
  ctx.fillStyle = '#f7c14b';
  ctx.fillRect(-5.5, -16, 11, 2.2);
  ctx.fillStyle = '#e8a06a';
  ctx.beginPath();
  ctx.arc(0, -25, 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#4a3b30';
  ctx.beginPath();
  ctx.arc(0, -26.6, 5, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = '#2e2b26';
  ctx.beginPath();
  ctx.arc(2, -24.6, 0.85, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** The frame over the top, so they are behind glass rather than in a hole. */
export function drawWindowFrame(ctx: CanvasRenderingContext2D): void {
  const { w, h } = WINDOW;
  ctx.save();
  ctx.strokeStyle = WOOD_EDGE;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.strokeRect(0, 0, w, h);
  ctx.stroke();
  ctx.restore();
}

/** A little of the lamp on the platform outside, about the sill's middle. */
export function drawWindowSpill(ctx: CanvasRenderingContext2D): void {
  const spill = ctx.createRadialGradient(0, 0, 2, 0, 0, 46);
  spill.addColorStop(0, 'rgba(255,214,130,.26)');
  spill.addColorStop(1, 'rgba(255,214,130,0)');
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, TAU);
  ctx.fill();
}
