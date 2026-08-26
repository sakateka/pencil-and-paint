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

/**
 * The walk cycle: limbs are pendulums, and opposite limbs swing opposite ways.
 *
 * Canvas angles are clockwise, so for a limb hanging downwards a positive
 * rotation carries its tip backwards. The near leg and the near arm therefore
 * take opposite signs, which is what a contralateral gait actually looks like.
 */
const HIP_Y = -13;
const SHOULDER_Y = -25;

/**
 * Exported so the test suite can assert the shape of the cycle directly. The
 * bug this guards against is a resting bias large enough to park the hand
 * behind the body for most of the cycle, which reads as walking backwards.
 */
export const WALK_CYCLE = {
  legSwing: 0.4,
  armSwing: 0.46,
  /** A touch of slack, so the arms are not rigid when standing still. */
  armRest: 0.06,
} as const;

const LEG_SWING = WALK_CYCLE.legSwing;
const ARM_SWING = WALK_CYCLE.armSwing;
const ARM_REST = WALK_CYCLE.armRest;

const SKIN = '#f2c398';
const HAIR = '#4a3527';
const EYE = '#3a2f26';
const BLUSH = 'rgba(230,140,120,.35)';

/**
 * The head, drawn as a profile from the side and face-on from the front.
 *
 * The shape has to change, not just the features. A symmetrical head with one
 * small eye added reads as someone facing the viewer while sliding sideways —
 * which looks like walking backwards. A profile needs a nose leading the way,
 * the ear set back, and the weight of the hair behind the crown.
 *
 * Everything here is drawn facing +x; the caller mirrors for the other way.
 */
function drawHead(ctx: CanvasRenderingContext2D, facing: Facing): void {
  if (facing === 'side') {
    // Skull, nudged forward so the face leads the body.
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(1.6, -35, 9.2, 0, TAU);
    ctx.fill();

    // Nose, and the small step of the brow above it.
    ctx.beginPath();
    ctx.moveTo(9.4, -37.6);
    ctx.quadraticCurveTo(13.4, -34.8, 9.2, -32.4);
    ctx.closePath();
    ctx.fill();

    // Ear, set well back on the skull.
    ctx.fillStyle = 'rgba(214,164,120,.9)';
    ctx.beginPath();
    ctx.ellipse(-2.4, -33.8, 2, 2.6, 0.2, 0, TAU);
    ctx.fill();

    // Hair: a full cap over the crown with the bulk of it behind, and a
    // hairline that sits high at the front so the face is not buried.
    // The underside has to come back *below* the crown or the fill is a thin
    // band at the very top and the walker looks bald.
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.arc(1.6, -35.8, 9.7, Math.PI * 0.86, Math.PI * 2.04);
    ctx.quadraticCurveTo(10.6, -37.6, 7.2, -38.8); // fringe tip at the brow
    ctx.quadraticCurveTo(0, -34.2, -7.2, -31.6); // sweeping down low behind
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-4.8, -34.2, 5.4, 6.4, 0.28, 0, TAU);
    ctx.fill();

    // One eye, forward on the face where a profile puts it.
    ctx.fillStyle = EYE;
    ctx.beginPath();
    ctx.arc(6.4, -35.2, 1.25, 0, TAU);
    ctx.fill();
    ctx.fillStyle = BLUSH;
    ctx.beginPath();
    ctx.arc(8.2, -32.4, 2.1, 0, TAU);
    ctx.fill();
    return;
  }

  // Face-on, or the back of the head when walking away.
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(0, -35, 9.2, 0, TAU);
  ctx.fill();

  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.arc(0, -35.5, 9.4, Math.PI * 0.98, Math.PI * 2.12);
  ctx.quadraticCurveTo(6, -33, 8.6, -31.5);
  ctx.quadraticCurveTo(4, -34.5, -2, -33.5);
  ctx.closePath();
  ctx.fill();

  if (facing === 'up') return; // walking away: nothing to show but hair

  ctx.fillStyle = EYE;
  ctx.beginPath();
  ctx.arc(-3.2, -34.4, 1.25, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(3.2, -34.4, 1.25, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,90,70,.65)';
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -32.4, 2.6, 0.25, Math.PI - 0.25);
  ctx.stroke();
  ctx.fillStyle = BLUSH;
  ctx.beginPath();
  ctx.arc(6.2, -32.6, 2.2, 0, TAU);
  ctx.fill();
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

  // Legs swing as pendulums from the hip. They used to stretch and slide
  // sideways instead of rotating, which is not a gait — the leading leg grew
  // longer and sank through the ground line.
  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.translate(side * 3.0, HIP_Y);
    ctx.rotate(side * sw * LEG_SWING);
    ctx.fillStyle = side > 0 ? '#3d5a80' : '#33496a';
    roundRectPath(ctx, -3, 0, 6, 13, 3);
    ctx.fill();
    ctx.fillStyle = '#4a3527';
    roundRectPath(ctx, -3.6, 9.5, 8, 4.5, 2);
    ctx.fill();
    ctx.restore();
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

  // Far arm, opposing the far leg.
  ctx.save();
  ctx.translate(-7, SHOULDER_Y);
  ctx.rotate(sw * ARM_SWING + ARM_REST);
  ctx.fillStyle = '#c9452f';
  roundRectPath(ctx, -3, 0, 5.5, 13, 2.6);
  ctx.fill();
  ctx.restore();

  drawHead(ctx, player.facing);

  // front arm holding the brush
  ctx.save();
  ctx.translate(6.5, SHOULDER_Y);
  // Near arm, opposing the near leg. No constant bias: the old `+ 0.25` held
  // the hand behind the body for most of the cycle, and arms that only ever
  // trail read as someone being dragged forwards rather than walking.
  ctx.rotate(-sw * ARM_SWING + ARM_REST);
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
