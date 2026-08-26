import { roundRectPath } from '../core/geom';
import { TAU } from '../core/math';
import { drawShadowBlob } from '../media/sprites';
import { SPAWN } from '../world/layout';

/**
 * The person who carries the colour.
 *
 * Always drawn in full colour, never in pencil — they are the source of the
 * colour, so they are the one thing in the valley that is never unfinished.
 */

/** Which way they are facing, which decides what of their face you can see. */
export type Facing = 'up' | 'down' | 'side';

export interface Walker {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** -1 looking left, 1 looking right. */
  face: -1 | 1;
  facing: Facing;
  /** Walk-cycle phase, advanced by distance covered rather than by time. */
  step: number;
  readonly speed: number;
  readonly radius: number;
  /** Tip of the brush — the colour of the last pot picked up. */
  brush: string;
}

export const WALKER_SPEED = 210;
export const WALKER_RADIUS = 13;
const DEFAULT_BRUSH = '#e8563f';

export function makeWalker(): Walker {
  return {
    x: SPAWN.x,
    y: SPAWN.y,
    vx: 0,
    vy: 0,
    face: 1,
    facing: 'down',
    step: 0,
    speed: WALKER_SPEED,
    radius: WALKER_RADIUS,
    brush: DEFAULT_BRUSH,
  };
}

export function resetWalker(player: Walker): void {
  player.x = SPAWN.x;
  player.y = SPAWN.y;
  player.vx = 0;
  player.vy = 0;
  player.face = 1;
  player.facing = 'down';
  player.step = 0;
  player.brush = DEFAULT_BRUSH;
}

function drawWalkerShadow(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  drawShadowBlob(ctx, x, y, 17, 7.2);
}

export function drawWalker(ctx: CanvasRenderingContext2D, player: Walker, t: number): void {
  const moving = Math.hypot(player.vx, player.vy) > 6;
  const sw = moving ? Math.sin(player.step) : 0;          // leg/arm swing
  const bob = moving ? Math.abs(Math.sin(player.step)) * 2.2 : Math.sin(t * 2) * 0.8;
  const x = player.x, y = player.y - bob;
  const f = player.face;

  ctx.save();

  drawWalkerShadow(ctx, player.x, player.y + 3);

  ctx.translate(x, y);
  ctx.scale(f, 1);

  // legs
  for (const s of [-1, 1]) {
    const off = sw * 4.5 * s;
    ctx.save(); ctx.translate(s * 3.4, 0);
    roundRectPath(ctx, -3 + off * 0.35, -13, 6, 14 + off * 0.6, 3);
    ctx.fillStyle = s > 0 ? '#3d5a80' : '#33496a';
    ctx.fill();
    ctx.restore();
  }
  // shoes
  ctx.fillStyle = '#4a3527';
  for (const s of [-1, 1]) {
    const off = sw * 4.5 * s;
    roundRectPath(ctx, s * 3.4 - 4, -1.5 + off * 0.6, 8, 4.5, 2); ctx.fill();
  }

  // body
  ctx.fillStyle = '#e8563f';
  roundRectPath(ctx, -8.5, -28, 17, 17, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  roundRectPath(ctx, -8.5, -28, 7, 17, 6); ctx.fill();

  // scarf
  ctx.fillStyle = '#f7c14b';
  roundRectPath(ctx, -8.5, -29.5, 17, 5, 2.5); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2, -27);
  ctx.quadraticCurveTo(9 - sw * 3, -22 + sw * 2, 6 - sw * 4, -14 + sw * 3);
  ctx.lineTo(2.5 - sw * 2, -15 + sw * 3);
  ctx.closePath(); ctx.fill();

  // back arm
  ctx.fillStyle = '#c9452f';
  ctx.save(); ctx.translate(-7, -25); ctx.rotate(-sw * 0.5);
  roundRectPath(ctx, -3, 0, 5.5, 13, 2.6); ctx.fill(); ctx.restore();

  // head
  ctx.fillStyle = '#f2c398';
  ctx.beginPath(); ctx.arc(0, -35, 9.2, 0, TAU); ctx.fill();
  // hair
  ctx.fillStyle = '#4a3527';
  ctx.beginPath();
  ctx.arc(0, -35.5, 9.4, Math.PI * 0.98, Math.PI * 2.12);
  ctx.quadraticCurveTo(6, -33, 8.6, -31.5);
  ctx.quadraticCurveTo(4, -34.5, -2, -33.5);
  ctx.closePath(); ctx.fill();

  // face (only when not walking away from the viewer)
  if (player.facing !== 'up') {
    ctx.fillStyle = '#3a2f26';
    if (player.facing === 'down') {
      ctx.beginPath(); ctx.arc(-3.2, -34.4, 1.25, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc( 3.2, -34.4, 1.25, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(180,90,70,.65)'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, -32.4, 2.6, 0.25, Math.PI - 0.25); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(4.2, -34.6, 1.25, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(230,140,120,.35)';
    ctx.beginPath(); ctx.arc(6.2, -32.6, 2.2, 0, TAU); ctx.fill();
  }

  // front arm holding the brush
  ctx.save();
  ctx.translate(6.5, -25); ctx.rotate(sw * 0.55 + 0.25);
  ctx.fillStyle = '#e8563f';
  roundRectPath(ctx, -2.7, 0, 5.5, 13, 2.6); ctx.fill();
  ctx.fillStyle = '#f2c398';
  ctx.beginPath(); ctx.arc(0, 13.5, 3.1, 0, TAU); ctx.fill();
  // brush
  ctx.strokeStyle = '#a9793f'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 13); ctx.lineTo(6, 22); ctx.stroke();
  ctx.strokeStyle = player.brush; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(6, 22); ctx.lineTo(9, 26.5); ctx.stroke();
  ctx.restore();

  ctx.restore();
}
