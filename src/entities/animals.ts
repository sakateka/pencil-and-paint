import { roundRectPath } from '../core/geom';
import { clamp, TAU } from '../core/math';
import { rnd, rr } from '../core/rng';
import { ink, inkArc, inkArcs, inkLine, inkLines, inkPoly, jitter } from '../media/ink';
import type { Medium } from '../media/medium';
import { movingShadow } from '../media/sprites';
import type { AnimalKind } from './animalKinds';

/**
 * Livestock, drawn live in both media so they can wander.
 *
 * Unlike scenery, an animal cannot be baked into the world layers — it moves.
 * So it is re-drawn every frame, in colour if the walker's light has reached it
 * and in pencil otherwise, which means a cow can be half-inked and half-drawn
 * as you walk past it.
 */

export type AnimalState = 'graze' | 'idle' | 'walk';

export interface Animal {
  readonly kind: AnimalKind;
  x: number;
  y: number;

  /** The patch of field it keeps to. */
  readonly homeX: number;
  readonly homeY: number;
  readonly homeRadius: number;

  readonly scale: number;
  /** Fixed offset into all its cyclic animation, so a herd is not in lockstep. */
  readonly phase: number;
  readonly speed: number;
  readonly coat: string;
  readonly patch: string;

  face: -1 | 1;
  targetX: number;
  targetY: number;
  moving: boolean;
  state: AnimalState;
  timer: number;
  walkPhase: number;

  /** 0 = head up and alert, 1 = head down in the grass. */
  headDown: number;

  /**
   * Its own clock, which only advances while awake. This is what makes a
   * distant sheep hold utterly still rather than merely stand in place: its
   * tail stops swishing too, because no time is passing for it.
   */
  clock: number;

  /** Whether the colour has reached it. */
  awake: boolean;

  /**
   * Seconds of purring left. Only the cat ever has any: she is the one thing
   * in the valley you can reach out and touch, and this is how she answers.
   */
  purr: number;

  /** Its reserved slot in the herd's sprite atlas. */
  slot: number;

  /** Whether its atlas slot currently holds a valid still. */
  frozen: boolean;
}

const SHEEP_LEGS: readonly (readonly [number, number])[] = [
  [-11, 1],
  [-6, -1],
  [6, -1],
  [11, 1],
];

const COW_LEGS: readonly (readonly [number, number])[] = [
  [-15, 1],
  [-9, -1],
  [9, -1],
  [15, 1],
];

const CHICKEN_LEGS: readonly (readonly [number, number])[] = [
  [-1.5, 1],
  [2, -1],
];

const SHEEP_FLUFF: readonly (readonly [number, number, number])[] = [
  [-12, -16, 7.5],
  [-4, -20, 8.5],
  [5, -18, 8],
  [11, -14, 6.5],
  [-8, -11, 7],
  [2, -11, 7.5],
  [9, -9, 5.5],
];

/** How long one stroke keeps her going. */
export const PURR_SECONDS = 3.4;

const SPEEDS: Record<AnimalKind, number> = {
  chicken: 38,
  sheep: 26,
  cow: 19,
  cat: 0,
};

export function makeAnimal(
  kind: AnimalKind,
  x: number,
  y: number,
  homeRadius: number,
  scale: number,
): Animal {
  return {
    kind,
    x,
    y,
    homeX: x,
    homeY: y,
    homeRadius,
    scale,
    phase: rnd() * TAU,
    speed: SPEEDS[kind],
    patch: rnd() < 0.5 ? '#6b4a32' : '#3f3830',
    coat: kind === 'chicken' ? (rnd() < 0.5 ? '#f4efe3' : '#c98a4b') : '#f4efe3',
    face: rnd() < 0.5 ? -1 : 1,
    targetX: x,
    targetY: y,
    moving: false,
    state: 'graze',
    timer: rr(0.5, 4),
    walkPhase: rnd() * TAU,
    headDown: 1,
    clock: rnd() * 20,
    awake: false,
    purr: 0,
    slot: 0,
    frozen: false,
  };
}

function drawSheep(ctx: CanvasRenderingContext2D, a: Animal, medium: Medium, _t: number): void {
  const g = a.headDown, sw = a.moving ? Math.sin(a.walkPhase) : 0;
  const hx = 15, hy = -17 + g * 10;
  movingShadow(ctx, a.x, a.y + 1, 20 * a.scale, 6 * a.scale, medium, a.phase * 90);
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.scale(a.face * a.scale, a.scale);
  const k = a.phase * 130;

  if (medium === 'color') {
    ctx.strokeStyle = '#4a453e'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (const [lx, ph] of SHEEP_LEGS) {
      ctx.beginPath(); ctx.moveTo(lx, -11); ctx.lineTo(lx + sw * ph * 2.6, -0.5); ctx.stroke();
    }
    ctx.fillStyle = '#f7f2e6';
    for (const b of SHEEP_FLUFF) { ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(186,176,156,.30)';
    for (const b of SHEEP_FLUFF) if (b[1] > -13) { ctx.beginPath(); ctx.arc(b[0], b[1] + 2.5, b[2] * 0.78, 0, TAU); ctx.fill(); }
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(g * 0.55);
    ctx.fillStyle = '#4a453e';
    ctx.beginPath(); ctx.ellipse(1, 0, 6.6, 5.2, 0.15, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-4.5, -4.6, 3.4, 2.1, -0.7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f7f2e6';
    ctx.beginPath(); ctx.arc(-3.4, -3.4, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fdfdfa';
    ctx.beginPath(); ctx.arc(3, -1.4, 1.05, 0, TAU); ctx.fill();
    ctx.restore();
  } else {
    ink(ctx, 0.5, 1.1);
    inkLines(ctx, SHEEP_LEGS.map(([lx, ph]) => [lx, -11, lx + sw * ph * 2.6, -0.5] as const), k);
    ink(ctx, 0.46, 1.15);
    inkArcs(ctx, SHEEP_FLUFF, k + 40);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(g * 0.55);
    ink(ctx, 0.55, 1.2);
    ctx.beginPath();
    ctx.ellipse(1 + jitter(k + 80, .6), jitter(k + 81, .6), 6.6, 5.2, 0.15, 0, TAU);
    ctx.stroke();
    // the muzzle is the dark bit, so it gets hatched
    ink(ctx, 0.3, 0.8);
    inkLines(
      ctx,
      [0, 1, 2, 3].map((i) => [-1 + i * 1.7, -3.4, 1.5 + i * 1.7, 3.4] as const),
      k + 90,
    );
    ink(ctx, 0.5, 1);
    inkArc(ctx, -3.4, -3.4, 3.4, k + 110);
    ctx.restore();
  }
  ctx.restore();
}

function drawCow(ctx: CanvasRenderingContext2D, a: Animal, medium: Medium, t: number): void {
  const g = a.headDown, sw = a.moving ? Math.sin(a.walkPhase) : 0;
  const tail = Math.sin(t * 2.1 + a.phase) * 4;
  const hx = 24, hy = -26 + g * 15;
  movingShadow(ctx, a.x, a.y + 1, 26 * a.scale, 8 * a.scale, medium, a.phase * 70);
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.scale(a.face * a.scale, a.scale);
  const k = a.phase * 210;

  if (medium === 'color') {
    ctx.strokeStyle = '#463c33'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    for (const [lx, ph] of COW_LEGS) {
      ctx.beginPath(); ctx.moveTo(lx, -14); ctx.lineTo(lx + sw * ph * 3, -0.5); ctx.stroke();
    }
    // tail
    ctx.strokeStyle = '#463c33'; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-19, -31);
    ctx.quadraticCurveTo(-27 + tail, -24, -24 + tail * 1.5, -13);
    ctx.stroke();
    ctx.fillStyle = '#463c33';
    ctx.beginPath(); ctx.arc(-24 + tail * 1.5, -11, 2.6, 0, TAU); ctx.fill();

    ctx.fillStyle = a.coat;
    roundRectPath(ctx, -20, -34, 40, 22, 9); ctx.fill();
    ctx.save(); roundRectPath(ctx, -20, -34, 40, 22, 9); ctx.clip();
    ctx.fillStyle = a.patch;
    ctx.beginPath(); ctx.ellipse(-9, -27, 7.5, 6, 0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, -21, 6.5, 5, -0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(180,168,148,.28)';
    ctx.beginPath(); ctx.ellipse(0, -13, 20, 5, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // udder
    ctx.fillStyle = '#e8a9a0';
    ctx.beginPath(); ctx.ellipse(-4, -12.5, 5, 3.4, 0, 0, TAU); ctx.fill();

    ctx.save(); ctx.translate(hx, hy); ctx.rotate(g * 0.6);
    ctx.fillStyle = a.coat;
    roundRectPath(ctx, -8, -8, 17, 16, 6); ctx.fill();
    ctx.fillStyle = '#e8a9a0';
    ctx.beginPath(); ctx.ellipse(8, 3, 5.4, 4.4, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c98a84';
    ctx.beginPath(); ctx.arc(9.5, 2, 1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(6.5, 4.5, 1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#463c33';
    ctx.beginPath(); ctx.arc(3, -3, 1.3, 0, TAU); ctx.fill();          // eye
    ctx.beginPath(); ctx.ellipse(-8, -3, 4, 2.4, -0.5, 0, TAU); ctx.fill();  // ear
    ctx.fillStyle = '#e6ddc8';
    ctx.beginPath(); ctx.ellipse(-2, -9.5, 2.6, 3.4, -0.3, 0, TAU); ctx.fill();  // horn
    ctx.restore();
  } else {
    ink(ctx, 0.5, 1.2);
    inkLines(ctx, COW_LEGS.map(([lx, ph]) => [lx, -14, lx + sw * ph * 3, -0.5] as const), k);
    ink(ctx, 0.45, 1.1);
    ctx.beginPath();
    ctx.moveTo(-19, -31);
    ctx.quadraticCurveTo(-27 + tail, -24, -24 + tail * 1.5, -13);
    ctx.stroke();
    inkArc(ctx, -24 + tail * 1.5, -11, 2.4, k + 30);
    // body
    ink(ctx, 0.55, 1.25);
    roundRectPath(ctx, -20 + jitter(k + 40, .7), -34 + jitter(k + 41, .7), 40, 22, 9); ctx.stroke();
    // patches read as the dark areas: outline + hatch
    ctx.save(); roundRectPath(ctx, -20, -34, 40, 22, 9); ctx.clip();
    ink(ctx, 0.45, 1);
    ctx.beginPath(); ctx.ellipse(-9 + jitter(k + 50, .6), -27, 7.5, 6, 0.3, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(7 + jitter(k + 52, .6), -21, 6.5, 5, -0.2, 0, TAU); ctx.stroke();
    ink(ctx, 0.3, 0.85);
    inkLines(
      ctx,
      [
        ...[0, 1, 2, 3, 4, 5].map((i) => [-16 + i * 2.4, -31, -11 + i * 2.4, -22] as const),
        ...[0, 1, 2, 3, 4].map((i) => [1 + i * 2.4, -25, 6 + i * 2.4, -17] as const),
      ],
      k + 60,
    );
    ctx.restore();
    // head
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(g * 0.6);
    ink(ctx, 0.55, 1.2);
    roundRectPath(ctx, -8 + jitter(k + 100, .6), -8 + jitter(k + 101, .6), 17, 16, 6); ctx.stroke();
    ink(ctx, 0.45, 1);
    ctx.beginPath(); ctx.ellipse(8, 3, 5.4, 4.4, 0.2, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-8, -3, 4, 2.4, -0.5, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-2, -9.5, 2.6, 3.4, -0.3, 0, TAU); ctx.stroke();
    ink(ctx, 0.6, 1.4);
    ctx.beginPath(); ctx.arc(3, -3, 1.1, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawChicken(ctx: CanvasRenderingContext2D, a: Animal, medium: Medium, t: number): void {
  const peck = a.state === 'graze' ? (0.5 + 0.5 * Math.sin(t * 5.5 + a.phase)) : 0;
  const sw = a.moving ? Math.sin(a.walkPhase * 1.7) : 0;
  movingShadow(ctx, a.x, a.y + 1, 9 * a.scale, 3 * a.scale, medium, a.phase * 40);
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.scale(a.face * a.scale, a.scale);
  const k = a.phase * 310;

  if (medium === 'color') {
    ctx.strokeStyle = '#e0982f'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    for (const [lx, ph] of CHICKEN_LEGS) {
      ctx.beginPath(); ctx.moveTo(lx, -5); ctx.lineTo(lx + sw * ph * 1.6, -0.4); ctx.stroke();
    }
    ctx.fillStyle = a.coat;
    ctx.beginPath(); ctx.ellipse(0, -9, 7, 5.6, 0.1, 0, TAU); ctx.fill();
    // tail feathers
    ctx.strokeStyle = a.coat === '#f4efe3' ? '#d9d2c0' : '#a86a35';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-5, -11); ctx.lineTo(-11, -16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, -9);  ctx.lineTo(-11, -12); ctx.stroke();
    ctx.save(); ctx.translate(5, -14); ctx.rotate(peck * 0.85);
    ctx.fillStyle = a.coat;
    ctx.beginPath(); ctx.arc(0, 0, 3.7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d9463c';
    ctx.beginPath(); ctx.arc(-0.8, -3.6, 1.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(1.4, -3.9, 1.3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e0982f';
    ctx.beginPath(); ctx.moveTo(3.2, -0.4); ctx.lineTo(7, 0.6); ctx.lineTo(3.2, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2e2b26';
    ctx.beginPath(); ctx.arc(1.9, -0.9, 0.85, 0, TAU); ctx.fill();
    ctx.restore();
  } else {
    ink(ctx, 0.5, 0.95);
    inkLine(ctx, -1.5, -5, -1.5 + sw * 1.6, -0.4, k);
    inkLine(ctx, 2, -5, 2 - sw * 1.6, -0.4, k + 6);
    ink(ctx, 0.5, 1.1);
    ctx.beginPath();
    ctx.ellipse(jitter(k + 12, .5), -9 + jitter(k + 13, .5), 7, 5.6, 0.1, 0, TAU);
    ctx.stroke();
    ink(ctx, 0.42, 1);
    inkLine(ctx, -5, -11, -11, -16, k + 20);
    inkLine(ctx, -5, -9, -11, -12, k + 26);
    ctx.save(); ctx.translate(5, -14); ctx.rotate(peck * 0.85);
    ink(ctx, 0.5, 1.05);
    inkArc(ctx, 0, 0, 3.7, k + 32);
    inkArc(ctx, -0.8, -3.6, 1.4, k + 38);
    ink(ctx, 0.45, 1);
    ctx.beginPath();
    ctx.moveTo(3.2, -0.4); ctx.lineTo(7, 0.6); ctx.lineTo(3.2, 2); ctx.closePath();
    ctx.stroke();
    ink(ctx, 0.6, 1.3);
    ctx.beginPath(); ctx.arc(1.9, -0.9, 0.7, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * The cat asleep by the cottage door — the one creature here that answers back.
 *
 * Everything else runs away from you. She does not run, and she does not wake
 * up either: a stroke sets `purr` counting down, and for those few seconds she
 * breathes deeper and quicker, the tail comes unwound and sways, the ears turn,
 * and the shut eyes fold into the crescents a contented cat makes. Then it ebbs
 * away and she is a drawing of a sleeping cat again.
 */
function drawCat(ctx: CanvasRenderingContext2D, a: Animal, medium: Medium, t: number): void {
  // Smoothstepped so the purr arrives and leaves gently instead of snapping on.
  const p = clamp(a.purr / PURR_SECONDS, 0, 1);
  const joy = p * p * (3 - 2 * p);
  /*
   * The breath is the same asleep and purring, on purpose.
   *
   * It is a vertical scale of the whole cat about the ground line, so deepening
   * it does not make her chest rise — it makes her ears rise, and quickening it
   * as well made her bounce like something on a spring. A purring cat lies
   * heavier than a sleeping one, not lighter. So the purr is said with the
   * things that do not lift her off the ground: the tail, the ears, the face.
   */
  const breath = 1 + Math.sin(t * 1.5 + a.phase) * 0.035;
  const flick = joy * Math.sin(t * 2.3 + a.phase) * 2.6;
  const ear = joy * Math.sin(t * 1.7 + a.phase * 2) * 0.7;
  const squint = joy * 0.85;
  const eyeR = 2 + squint;

  movingShadow(ctx, a.x, a.y + 1, 15 * a.scale, 4.5 * a.scale, medium, a.phase * 20);
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.scale(a.face * a.scale, a.scale * breath);
  const k = a.phase * 410;
  // The tail's tip, wrapped round the front and swinging while she purrs.
  const tipX = 6 + flick * 1.4;
  const tipY = -1.5 + flick * 0.5;

  if (medium === 'color') {
    ctx.fillStyle = '#c9834b';
    ctx.beginPath(); ctx.ellipse(0, -8, 13, 8, 0, 0, TAU); ctx.fill();        // curled body
    // tail wrapped round the front
    ctx.strokeStyle = '#c9834b'; ctx.lineWidth = 4.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(9, -6);
    ctx.quadraticCurveTo(16, -2 - flick * 0.6, tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = '#b06f3c';
    for (const s of [-6, 0, 6]) {                                        // tabby stripes
      ctx.beginPath(); ctx.ellipse(s, -11, 1.7, 3.4, 0.25, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#c9834b';
    ctx.beginPath(); ctx.arc(-11, -10, 6.2, 0, TAU); ctx.fill();               // head
    ctx.beginPath(); ctx.moveTo(-15, -14); ctx.lineTo(-16 - ear, -19 - ear); ctx.lineTo(-11, -15.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-8, -15); ctx.lineTo(-6 + ear, -19.5 - ear); ctx.lineTo(-5, -13.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6b4a2c'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-13, -9.5 - squint, eyeR, 0.15, Math.PI - 0.15); ctx.stroke();  // shut eye
    ctx.beginPath(); ctx.arc(-8.5, -9.5 - squint, eyeR * 0.85, 0.15, Math.PI - 0.15); ctx.stroke();
    if (joy > 0.04) {
      ctx.globalAlpha = joy;
      ctx.beginPath(); ctx.arc(-12.4, -6.6, 1.5, 0.2, Math.PI - 0.2); ctx.stroke();  // the small smile
      ctx.beginPath(); ctx.arc(-9.6, -6.6, 1.5, 0.2, Math.PI - 0.2); ctx.stroke();
    }
  } else {
    ink(ctx, 0.5, 1.15);
    ctx.beginPath();
    ctx.ellipse(jitter(k, .6), -8 + jitter(k + 1, .6), 13, 8, 0, 0, TAU);
    ctx.stroke();
    ink(ctx, 0.45, 1.05);
    ctx.beginPath();
    ctx.moveTo(9, -6);
    ctx.quadraticCurveTo(16, -2 - flick * 0.6, tipX, tipY);
    ctx.stroke();
    inkArc(ctx, -11, -10, 6.2, k + 10);
    ink(ctx, 0.4, 0.95);
    inkPoly(ctx, [[-15, -14], [-16 - ear, -19 - ear], [-11, -15.5]], k + 16, true);
    inkPoly(ctx, [[-8, -15], [-6 + ear, -19.5 - ear], [-5, -13.5]], k + 24, true);
    ink(ctx, 0.28, 0.8);
    for (const s of [-6, 0, 6]) inkLine(ctx, s - 1, -13, s + 1, -9, k + 30 + s);
    ink(ctx, 0.5, 1);
    ctx.beginPath(); ctx.arc(-13, -9.5 - squint, eyeR, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.beginPath(); ctx.arc(-8.5, -9.5 - squint, eyeR * 0.85, 0.15, Math.PI - 0.15); ctx.stroke();
    if (joy > 0.04) {
      ink(ctx, 0.42 * joy, 0.8);
      ctx.beginPath(); ctx.arc(-12.4, -6.6, 1.5, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(-9.6, -6.6, 1.5, 0.2, Math.PI - 0.2); ctx.stroke();
    }
  }
  ctx.restore();
}

/** Dispatch to the right animal. */
export function drawAnimalLive(
  ctx: CanvasRenderingContext2D,
  a: Animal,
  medium: Medium,
): void {
  switch (a.kind) {
    case 'sheep':
      return drawSheep(ctx, a, medium, a.clock);
    case 'cow':
      return drawCow(ctx, a, medium, a.clock);
    case 'chicken':
      return drawChicken(ctx, a, medium, a.clock);
    case 'cat':
      return drawCat(ctx, a, medium, a.clock);
  }
}
