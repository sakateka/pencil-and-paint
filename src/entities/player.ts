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
  /**
   * Half-widths of the chest. A chest seen edge-on is not as wide as one seen
   * face-on, and a full-width front-facing chest sliding sideways is a large
   * part of what made the walk look like it was going the wrong way.
   */
  torsoHalfFront: 8.5,
  torsoHalfSide: 6,
} as const;

const LEG_SWING = WALK_CYCLE.legSwing;
const ARM_SWING = WALK_CYCLE.armSwing;
const ARM_REST = WALK_CYCLE.armRest;

const SKIN = '#f2c398';
const HAIR = '#4a3527';
const EYE = '#3a2f26';
const BLUSH = 'rgba(230,140,120,.35)';

/** The haircut. One shape, drawn wherever the head happens to be. */
function drawHair(ctx: CanvasRenderingContext2D, offsetX: number): void {
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.arc(offsetX, -35.5, 9.4, Math.PI * 0.98, Math.PI * 2.12);
  ctx.quadraticCurveTo(offsetX + 6, -33, offsetX + 8.6, -31.5);
  ctx.quadraticCurveTo(offsetX + 4, -34.5, offsetX - 2, -33.5);
  ctx.closePath();
  ctx.fill();
}

/**
 * The head. Exactly as it was: a round skull, the same haircut from every
 * angle, two eyes face-on and one from the side.
 *
 * Everything here is drawn facing +x; the caller mirrors for the other way.
 */
function drawHead(ctx: CanvasRenderingContext2D, facing: Facing): void {
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(0, -35, 9.2, 0, TAU);
  ctx.fill();

  drawHair(ctx, 0);

  if (facing === 'up') return; // walking away: nothing to show but hair

  ctx.fillStyle = EYE;
  if (facing === 'down') {
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
  } else {
    ctx.beginPath();
    ctx.arc(4.2, -34.6, 1.25, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = BLUSH;
  ctx.beginPath();
  ctx.arc(6.2, -32.6, 2.2, 0, TAU);
  ctx.fill();
}

/** Shoulder positions. Face-on the arms sit either side of a wide chest; in
 *  profile they gather near the centre line, one in front of the torso and one
 *  behind it. */
const SHOULDER_FRONT_NEAR = 6.5;
const SHOULDER_FRONT_FAR = -7;
const SHOULDER_SIDE_NEAR = 2.8;
const SHOULDER_SIDE_FAR = -2.5;

const SHIRT = '#e8563f';
const SHIRT_SHADE = '#c9452f';
const SCARF = '#f7c14b';

function drawArm(
  ctx: CanvasRenderingContext2D,
  x: number,
  angle: number,
  colour: string,
): void {
  ctx.save();
  ctx.translate(x, SHOULDER_Y);
  ctx.rotate(angle);
  ctx.fillStyle = colour;
  roundRectPath(ctx, -3, 0, 5.5, 13, 2.6);
  ctx.fill();
  ctx.restore();
}

/** The near arm, with a hand and the brush it is carrying. */
function drawBrushArm(
  ctx: CanvasRenderingContext2D,
  x: number,
  angle: number,
  brush: string,
): void {
  ctx.save();
  ctx.translate(x, SHOULDER_Y);
  ctx.rotate(angle);
  ctx.fillStyle = SHIRT;
  roundRectPath(ctx, -2.7, 0, 5.5, 13, 2.6);
  ctx.fill();
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(0, 13.5, 3.1, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#a9793f';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 13);
  ctx.lineTo(6, 22);
  ctx.stroke();
  ctx.strokeStyle = brush;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(6, 22);
  ctx.lineTo(9, 26.5);
  ctx.stroke();
  ctx.restore();
}

/**
 * The torso. Narrower in profile, because a chest seen edge-on is not as wide
 * as one seen face-on — and a full-width front-facing chest sliding sideways is
 * a large part of what makes the walk look like it is going the wrong way.
 */
function drawTorso(ctx: CanvasRenderingContext2D, sideOn: boolean): void {
  const half = sideOn ? WALK_CYCLE.torsoHalfSide : WALK_CYCLE.torsoHalfFront;
  ctx.fillStyle = SHIRT;
  roundRectPath(ctx, -half, -28, half * 2, 17, 6);
  ctx.fill();
  // A little light. Face-on it falls on one side; in profile it catches the
  // leading edge, which helps say which way the body is pointed.
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  if (sideOn) roundRectPath(ctx, half - 4.5, -28, 4.5, 17, 5);
  else roundRectPath(ctx, -half, -28, 7, 17, 6);
  ctx.fill();
}

/**
 * The scarf. In profile the loose end streams *backwards*.
 *
 * It used to hang forwards whichever way you were going, and a scarf blown
 * ahead of you reads as wind from behind — which is to say, as walking
 * backwards.
 */
function drawScarf(ctx: CanvasRenderingContext2D, sw: number, sideOn: boolean): void {
  ctx.fillStyle = SCARF;
  const half = sideOn ? WALK_CYCLE.torsoHalfSide : WALK_CYCLE.torsoHalfFront;
  roundRectPath(ctx, -half, -29.5, half * 2, 5, 2.5);
  ctx.fill();

  ctx.beginPath();
  if (sideOn) {
    // A band with real width. Drawn as a thin sliver it was barely a pixel
    // across at the tip and read as nothing at all.
    ctx.moveTo(-2, -28.5);
    ctx.quadraticCurveTo(-9 - sw * 2, -27 + sw, -14.5 - sw * 3, -23.5 + sw * 2);
    ctx.lineTo(-13.5 - sw * 3, -19.5 + sw * 2);
    ctx.quadraticCurveTo(-8 - sw * 2, -22.5 + sw, -2, -23.5);
  } else {
    ctx.moveTo(2, -27);
    ctx.quadraticCurveTo(9 - sw * 3, -22 + sw * 2, 6 - sw * 4, -14 + sw * 3);
    ctx.lineTo(2.5 - sw * 2, -15 + sw * 3);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawWalker(ctx: CanvasRenderingContext2D, player: Walker, t: number): void {
  const moving = Math.hypot(player.vx, player.vy) > 6;
  const sw = moving ? Math.sin(player.step) : 0;
  const bob = moving ? Math.abs(Math.sin(player.step)) * 2.2 : Math.sin(t * 2) * 0.8;
  const sideOn = player.facing === 'side';

  ctx.save();
  drawWalkerShadow(ctx, player.x, player.y + 3);
  ctx.translate(player.x, player.y - bob);
  ctx.scale(player.face, 1);

  // Legs swing as pendulums from the hip, near and far taking opposite signs.
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

  const farAngle = sw * ARM_SWING + ARM_REST;
  const nearAngle = -sw * ARM_SWING + ARM_REST;

  // In profile the far arm belongs *behind* the torso, so it is drawn first and
  // only shows where it swings clear of the body. Drawn over the chest it read
  // as a second front arm attached at the back.
  if (sideOn) drawArm(ctx, SHOULDER_SIDE_FAR, farAngle, SHIRT_SHADE);

  drawTorso(ctx, sideOn);
  drawScarf(ctx, sw, sideOn);

  if (!sideOn) drawArm(ctx, SHOULDER_FRONT_FAR, farAngle, SHIRT_SHADE);

  drawHead(ctx, player.facing);

  drawBrushArm(ctx, sideOn ? SHOULDER_SIDE_NEAR : SHOULDER_FRONT_NEAR, nearAngle, player.brush);

  ctx.restore();
}
