import { isolate } from '../core/canvas';
import { rectPoly } from '../core/geom';
import { TAU } from '../core/math';
import { rr } from '../core/rng';
import { PENCIL, type Medium } from '../media/medium';
import { groundShadow, paint } from '../media/pencil';
import { WOOD_EDGE } from './palette';
import { circleCollider, type Scenery } from './types';

/**
 * An easel, left standing next to the hammock.
 *
 * Whoever left this valley half-drawn left this here too, and what is on it is
 * the same valley: hills, the pond, a sun — some of it inked, most of it still
 * in pencil. It is the game's own premise, sitting in the game, and it is the
 * one place you can see what the world is supposed to look like when it is
 * finished.
 *
 * Baked like the rest of the scenery. Nothing about it moves.
 */

/** How tall it stands. About shoulder height on the walker. */
const HEIGHT = 62;

/** The board on it. */
const BOARD_W = 40;
const BOARD_H = 32;

/** The little picture, drawn twice: once in pencil, once part-coloured. */
function picture(ctx: CanvasRenderingContext2D, x: number, top: number, medium: Medium): void {
  const left = x - BOARD_W / 2 + 4;
  const w = BOARD_W - 8;
  const h = BOARD_H - 8;
  const base = top + 4;

  isolate(ctx, () => {
    ctx.beginPath();
    ctx.rect(left, base, w, h);
    ctx.clip();

    /*
     * The far hills are finished and the near ones are not, which is the same
     * way round as the valley outside: the colour has got that far and no
     * further.
     */
    if (medium === 'color') {
      ctx.fillStyle = '#cfe3ef';
      ctx.fillRect(left, base, w, h * 0.52);
      ctx.fillStyle = '#f0c96a';
      ctx.beginPath();
      ctx.arc(left + w * 0.74, base + h * 0.2, 3.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#8fb98a';
      ctx.beginPath();
      ctx.moveTo(left, base + h * 0.62);
      ctx.quadraticCurveTo(left + w * 0.3, base + h * 0.42, left + w * 0.62, base + h * 0.6);
      ctx.lineTo(left + w * 0.62, base + h);
      ctx.lineTo(left, base + h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7fa9cc';
      ctx.beginPath();
      ctx.ellipse(left + w * 0.3, base + h * 0.82, w * 0.16, h * 0.08, 0, 0, TAU);
      ctx.fill();
    }

    // The unfinished half, in pencil, in both media — this is the part the
    // person with the pencil had not got to yet.
    ctx.strokeStyle = PENCIL;
    ctx.globalAlpha = medium === 'color' ? 0.42 : 0.5;
    ctx.lineWidth = 0.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(left + w * 0.55, base + h * 0.6);
    ctx.quadraticCurveTo(left + w * 0.76, base + h * 0.36, left + w, base + h * 0.56);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(left + w * 0.74, base + h * 0.2, 3.4, 0, TAU);
    ctx.stroke();
    // A couple of strokes of grass that never got their green.
    for (let i = 0; i < 4; i++) {
      const gx = left + w * (0.66 + i * 0.09);
      ctx.beginPath();
      ctx.moveTo(gx, base + h * 0.92);
      ctx.lineTo(gx + rr(-1.4, 1.4), base + h * 0.78);
      ctx.stroke();
    }
  });
}

export function makeEasel(x: number, y: number): Scenery {
  const top = y - HEIGHT;
  const board = rectPoly(x - BOARD_W / 2, top, BOARD_W, BOARD_H);

  const legs = (ctx: CanvasRenderingContext2D, wobble: number) => {
    const w = () => (wobble ? rr(-wobble, wobble) : 0);
    ctx.beginPath();
    // Two at the front, splayed, and one behind — a tripod stands, four legs
    // wobble.
    ctx.moveTo(x - 4 + w(), top + 6);
    ctx.lineTo(x - 15 + w(), y);
    ctx.moveTo(x + 4 + w(), top + 6);
    ctx.lineTo(x + 15 + w(), y);
    ctx.moveTo(x + 1 + w(), top + 10);
    ctx.lineTo(x + 7 + w(), y - 3);
    // The ledge the board sits on.
    ctx.moveTo(x - 13 + w(), top + BOARD_H + 2);
    ctx.lineTo(x + 13 + w(), top + BOARD_H + 2);
    ctx.stroke();
  };

  return {
    y,
    colliders: [circleCollider(x, y - 6, 15)],
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 1, 20, 7, medium);

      if (medium === 'color') {
        ctx.strokeStyle = WOOD_EDGE;
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        legs(ctx, 0);
      } else {
        isolate(ctx, () => {
          ctx.strokeStyle = PENCIL;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1.2;
          ctx.lineCap = 'round';
          legs(ctx, 0.7);
        });
      }

      paint(ctx, board, '#f4efe3', medium, { angle: -1.1, outlineAlpha: 0.5, darkScale: 0.4 });
      picture(ctx, x, top, medium);

      if (medium !== 'color') return;
      // A brush across the ledge, because somebody put it down mid-stroke.
      ctx.strokeStyle = '#8a6a3f';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x - 9, top + BOARD_H + 1);
      ctx.lineTo(x + 4, top + BOARD_H + 3);
      ctx.stroke();
      ctx.strokeStyle = '#d9463c';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x + 4, top + BOARD_H + 3);
      ctx.lineTo(x + 8, top + BOARD_H + 3.6);
      ctx.stroke();
    },
  };
}
