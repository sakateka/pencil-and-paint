import { roundRectPath } from '../core/geom';
import { clamp, TAU } from '../core/math';
import { rnd, rr } from '../core/rng';
import { ink, inkArc, inkArcs, inkLine, inkLines, inkPoly, jitter } from '../media/ink';
import { PAPER, PENCIL, type Medium } from '../media/medium';
import { movingShadow } from '../media/sprites';
import type { AnimalKind } from './animalKinds';

/**
 * The nesting hen's colours.
 *
 * Her white is the paper's own cream rather than a true white, and the outline
 * is nearly black: in the drawing she comes from, the body is the untouched
 * page and the crayon is only ever the line round it.
 */
const HEN = '#f7f2e6';
const HEN_EDGE = '#2b2620';
/** The straw of the nest, thrown out flat around her. */
const STRAW = '#e8a53c';
const STRAW_EDGE = '#c07d22';

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

  /**
   * Whether a frog wants to be under the water. Only frogs ever do.
   *
   * Separate from `dive` because taking fright is instant and getting under is
   * not: this is the decision, `dive` is how far along it has got.
   */
  diving: boolean;

  /**
   * How far under it is: 0 sitting on its leaf, 1 gone, and the leap in
   * between. Held at 1 for as long as somebody is fishing over its head.
   */
  dive: number;

  /**
   * Its place in the herd, fixed when the field is laid out.
   *
   * Which of the three inked variants it is drawn with, so that a field of
   * sheep is not the same drawing stamped out a dozen times, and so that a
   * sleeping one keeps the same hand for as long as it sleeps.
   */
  slot: number;
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

const CHICK_LEGS: readonly (readonly [number, number])[] = [
  [-1, 1],
  [1.4, -1],
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

/**
 * A purr is not one long note, it is *murrr … murrr … murrr*.
 *
 * Each one swells up and falls away again over a second or so, and between
 * them she is quiet for a moment before starting the next. The shape
 * is shared by the sound and by everything she does while it runs, so the tail
 * and the rumble rise and fall together rather than drifting apart.
 */
/*
 * Three murrrs, taken briskly.
 *
 * At three seconds a murrr the whole thing ran eleven seconds, which outstays
 * one stroke of a cat by a long way. The count of three is the character of it,
 * though, so what gives is the tempo — the same three swells and the same two
 * rests, twice run through at two thirds of the time until they sit at about
 * five seconds altogether.
 */
export const MURR_SECONDS = 1.35;
export const MURR_GAP = 0.45;
export const MURR_COUNT = 3;

/** How long one stroke keeps her going: the murrrs and the quiet between. */
export const PURR_SECONDS = MURR_COUNT * MURR_SECONDS + (MURR_COUNT - 1) * MURR_GAP;

/**
 * How hard she is purring, `age` seconds in.
 *
 * A raised cosine, so each murrr starts from nothing, swells, and returns to
 * nothing with no corner at either end — the "up and down smoothly" part. Zero
 * during the gaps, and zero once she has finished.
 */
export function purrStrength(age: number): number {
  if (age < 0 || age > PURR_SECONDS) return 0;
  const within = age % (MURR_SECONDS + MURR_GAP);
  if (within > MURR_SECONDS) return 0;
  return 0.5 - 0.5 * Math.cos((within / MURR_SECONDS) * TAU);
}

const SPEEDS: Record<AnimalKind, number> = {
  chicken: 38,
  // She has somebody to keep an eye on, and does not go far.
  hen: 29,
  // Faster than its mother, which is the only way it ever catches her up.
  chick: 47,
  sheep: 26,
  cow: 19,
  cat: 0,
  // Sitting, and the whole point of her is that she does not get up.
  broody: 0,
  // A frog on a lily pad has arrived. Where would it go?
  frog: 0,
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
    diving: false,
    dive: 0,
    slot: 0,
  };
}

/**
 * Where a sheep's head hangs, and how far it has turned into the grass.
 *
 * The hinge, in the body's own units. A head coming up out of the grass is one
 * drawing on a neck rather than a row of frames, so this is what carries it:
 * the picture is baked once and the sprite is put here and turned by this much.
 * That is why the movement is exactly as smooth as the easing behind it.
 */
export function sheepHinge(headDown: number): { x: number; y: number; angle: number } {
  return { x: 15, y: -17 + headDown * 10, angle: headDown * 0.55 };
}

/** Everything of a sheep but its head: the shadow it stands in, legs, fleece. */
export function drawSheepBody(
  ctx: CanvasRenderingContext2D,
  sw: number,
  medium: Medium,
  k: number,
): void {
  movingShadow(ctx, 0, 1, 20, 6, medium, k + 200);
  if (medium === 'color') {
    ctx.strokeStyle = '#4a453e'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (const [lx, ph] of SHEEP_LEGS) {
      ctx.beginPath(); ctx.moveTo(lx, -11); ctx.lineTo(lx + sw * ph * 2.6, -0.5); ctx.stroke();
    }
    ctx.fillStyle = '#f7f2e6';
    for (const b of SHEEP_FLUFF) { ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(186,176,156,.30)';
    for (const b of SHEEP_FLUFF) if (b[1] > -13) { ctx.beginPath(); ctx.arc(b[0], b[1] + 2.5, b[2] * 0.78, 0, TAU); ctx.fill(); }
  } else {
    ink(ctx, 0.5, 1.1);
    inkLines(ctx, SHEEP_LEGS.map(([lx, ph]) => [lx, -11, lx + sw * ph * 2.6, -0.5] as const), k);
    ink(ctx, 0.46, 1.15);
    inkArcs(ctx, SHEEP_FLUFF, k + 40);
  }
}

/** Its head, drawn about the hinge — see `sheepHinge`. */
export function drawSheepHead(ctx: CanvasRenderingContext2D, medium: Medium, k: number): void {
  if (medium === 'color') {
    ctx.fillStyle = '#4a453e';
    ctx.beginPath(); ctx.ellipse(1, 0, 6.6, 5.2, 0.15, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-4.5, -4.6, 3.4, 2.1, -0.7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f7f2e6';
    ctx.beginPath(); ctx.arc(-3.4, -3.4, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fdfdfa';
    ctx.beginPath(); ctx.arc(3, -1.4, 1.05, 0, TAU); ctx.fill();
  } else {
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
  }
}

/**
 * Where a cow's head hangs, and how far it has turned into the grass.
 *
 * The reach is longer than a sheep's and the turn is deeper, which is most of
 * what makes a cow read as a cow when it grazes. See `sheepHinge`.
 */
export function cowHinge(headDown: number): { x: number; y: number; angle: number } {
  return { x: 24, y: -26 + headDown * 15, angle: headDown * 0.6 };
}

/** Where the tail hangs from, in the body's own units. */
export const COW_TAIL: { readonly x: number; readonly y: number } = { x: -19, y: -31 };

/**
 * How far round the root the tail has swung, for a swish of `tail` units.
 *
 * The tail was drawn by moving the far end sideways, which is the same motion
 * a rotation about the root gives — and a rotation is a transform, so the
 * swish stays smooth at any frame rate instead of being quantised into a
 * handful of tails. The tip is twenty units from the root, hence the ratio.
 */
export function cowTailAngle(tail: number): number {
  return -tail * 0.075;
}

/** The tail alone, hanging from its root. */
export function drawCowTail(ctx: CanvasRenderingContext2D, medium: Medium, k: number): void {
  if (medium === 'color') {
    ctx.strokeStyle = '#463c33'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-8, 7, -5, 18);
    ctx.stroke();
    ctx.fillStyle = '#463c33';
    ctx.beginPath(); ctx.arc(-5, 20, 2.6, 0, TAU); ctx.fill();
  } else {
    ink(ctx, 0.45, 1.1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-8, 7, -5, 18);
    ctx.stroke();
    inkArc(ctx, -5, 20, 2.4, k + 30);
  }
}

/** Everything of a cow but its head and its tail. */
export function drawCowBody(
  ctx: CanvasRenderingContext2D,
  sw: number,
  medium: Medium,
  k: number,
  coat: string,
  patch: string,
): void {
  movingShadow(ctx, 0, 1, 26, 8, medium, k + 200);
  if (medium === 'color') {
    ctx.strokeStyle = '#463c33'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    for (const [lx, ph] of COW_LEGS) {
      ctx.beginPath(); ctx.moveTo(lx, -14); ctx.lineTo(lx + sw * ph * 3, -0.5); ctx.stroke();
    }
    ctx.fillStyle = coat;
    roundRectPath(ctx, -20, -34, 40, 22, 9); ctx.fill();
    ctx.save(); roundRectPath(ctx, -20, -34, 40, 22, 9); ctx.clip();
    ctx.fillStyle = patch;
    ctx.beginPath(); ctx.ellipse(-9, -27, 7.5, 6, 0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, -21, 6.5, 5, -0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(180,168,148,.28)';
    ctx.beginPath(); ctx.ellipse(0, -13, 20, 5, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // udder
    ctx.fillStyle = '#e8a9a0';
    ctx.beginPath(); ctx.ellipse(-4, -12.5, 5, 3.4, 0, 0, TAU); ctx.fill();
  } else {
    ink(ctx, 0.5, 1.2);
    inkLines(ctx, COW_LEGS.map(([lx, ph]) => [lx, -14, lx + sw * ph * 3, -0.5] as const), k);
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
  }
}

/** Its head, drawn about the hinge — see `cowHinge`. */
export function drawCowHead(
  ctx: CanvasRenderingContext2D,
  medium: Medium,
  k: number,
  coat: string,
): void {
  if (medium === 'color') {
    ctx.fillStyle = coat;
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
  } else {
    ink(ctx, 0.55, 1.2);
    roundRectPath(ctx, -8 + jitter(k + 100, .6), -8 + jitter(k + 101, .6), 17, 16, 6); ctx.stroke();
    ink(ctx, 0.45, 1);
    ctx.beginPath(); ctx.ellipse(8, 3, 5.4, 4.4, 0.2, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-8, -3, 4, 2.4, -0.5, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-2, -9.5, 2.6, 3.4, -0.3, 0, TAU); ctx.stroke();
    ink(ctx, 0.6, 1.4);
    ctx.beginPath(); ctx.arc(3, -3, 1.1, 0, TAU); ctx.stroke();
  }
}

/**
 * Where a chicken's head sits, and how far it has ducked to peck.
 *
 * Same hinge as a grazing sheep, on a shorter neck and a faster clock. It is
 * the peck the head is for, and the peck is what was worst about the old
 * twelve-frames-a-second: at five and a half radians a second a chicken got
 * two pictures per dip.
 */
export function chickenHinge(peck: number): { x: number; y: number; angle: number } {
  return { x: 5, y: -14, angle: peck * 0.85 };
}

/** Everything of a chicken but its head: shadow, legs, body, tail feathers. */
export function drawChickenBody(
  ctx: CanvasRenderingContext2D,
  sw: number,
  medium: Medium,
  k: number,
  coat: string,
): void {
  movingShadow(ctx, 0, 1, 9, 3, medium, k + 200);
  if (medium === 'color') {
    ctx.strokeStyle = '#e0982f'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    for (const [lx, ph] of CHICKEN_LEGS) {
      ctx.beginPath(); ctx.moveTo(lx, -5); ctx.lineTo(lx + sw * ph * 1.6, -0.4); ctx.stroke();
    }
    ctx.fillStyle = coat;
    ctx.beginPath(); ctx.ellipse(0, -9, 7, 5.6, 0.1, 0, TAU); ctx.fill();
    // tail feathers
    ctx.strokeStyle = coat === '#f4efe3' ? '#d9d2c0' : '#a86a35';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-5, -11); ctx.lineTo(-11, -16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, -9);  ctx.lineTo(-11, -12); ctx.stroke();
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
  }
}

/** Its head, drawn about the hinge — see `chickenHinge`. */
export function drawChickenHead(
  ctx: CanvasRenderingContext2D,
  medium: Medium,
  k: number,
  coat: string,
): void {
  if (medium === 'color') {
    ctx.fillStyle = coat;
    ctx.beginPath(); ctx.arc(0, 0, 3.7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d9463c';
    ctx.beginPath(); ctx.arc(-0.8, -3.6, 1.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(1.4, -3.9, 1.3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e0982f';
    ctx.beginPath(); ctx.moveTo(3.2, -0.4); ctx.lineTo(7, 0.6); ctx.lineTo(3.2, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2e2b26';
    ctx.beginPath(); ctx.arc(1.9, -0.9, 0.85, 0, TAU); ctx.fill();
  } else {
    ink(ctx, 0.5, 1.05);
    inkArc(ctx, 0, 0, 3.7, k + 32);
    inkArc(ctx, -0.8, -3.6, 1.4, k + 38);
    ink(ctx, 0.45, 1);
    ctx.beginPath();
    ctx.moveTo(3.2, -0.4); ctx.lineTo(7, 0.6); ctx.lineTo(3.2, 2); ctx.closePath();
    ctx.stroke();
    ink(ctx, 0.6, 1.3);
    ctx.beginPath(); ctx.arc(1.9, -0.9, 0.7, 0, TAU); ctx.stroke();
  }
}

/** Where the chick's head sits, and how far it has ducked to peck. */
export function chickHinge(peck: number): { x: number; y: number; angle: number } {
  return { x: 2.9, y: -8.6, angle: peck * 0.95 };
}

/** Everything of a chick but its head: shadow, legs, body, the stub of a wing. */
export function drawChickBody(
  ctx: CanvasRenderingContext2D,
  sw: number,
  medium: Medium,
  k: number,
): void {
  movingShadow(ctx, 0, 1, 5, 2, medium, k + 200);
  if (medium === 'color') {
    ctx.strokeStyle = '#e0982f';
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    for (const [lx, ph] of CHICK_LEGS) {
      ctx.beginPath();
      ctx.moveTo(lx, -3.4);
      ctx.lineTo(lx + sw * ph * 1.2, -0.3);
      ctx.stroke();
    }
    // Body and head are both just circles. A chick is a circle with a smaller
    // circle on it, and drawing it as anything cleverer loses it.
    ctx.fillStyle = '#f5d24e';
    ctx.beginPath();
    ctx.ellipse(0, -5.6, 4.4, 3.9, 0.1, 0, TAU);
    ctx.fill();
    // A stub of a wing, so it is not a plain oval.
    ctx.fillStyle = '#e8bf37';
    ctx.beginPath();
    ctx.ellipse(-0.6, -5.2, 2.2, 1.5, 0.3, 0, TAU);
    ctx.fill();
  } else {
    ink(ctx, 0.45, 0.85);
    for (const [lx, ph] of CHICK_LEGS) inkLine(ctx, lx, -3.4, lx + sw * ph * 1.2, -0.3, k + lx);
    ink(ctx, 0.5, 1);
    ctx.beginPath();
    ctx.ellipse(jitter(k + 12, 0.4), -5.6 + jitter(k + 13, 0.4), 4.4, 3.9, 0.1, 0, TAU);
    ctx.stroke();
    ink(ctx, 0.35, 0.8);
    inkArc(ctx, -0.6, -5.2, 2, k + 18);
  }
}

/** Its head, drawn about the hinge — see `chickHinge`. */
export function drawChickHead(ctx: CanvasRenderingContext2D, medium: Medium, k: number): void {
  if (medium === 'color') {
    ctx.fillStyle = '#f5d24e';
    ctx.beginPath();
    ctx.arc(0, 0, 2.9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e0982f';
    ctx.beginPath();
    ctx.moveTo(2.4, -0.2);
    ctx.lineTo(5, 0.7);
    ctx.lineTo(2.4, 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2e2b26';
    ctx.beginPath();
    ctx.arc(1.3, -0.8, 0.7, 0, TAU);
    ctx.fill();
  } else {
    ink(ctx, 0.5, 1);
    inkArc(ctx, 0, 0, 2.9, k + 24);
    ink(ctx, 0.45, 0.9);
    ctx.beginPath();
    ctx.moveTo(2.4, -0.2);
    ctx.lineTo(5, 0.7);
    ctx.lineTo(2.4, 1.5);
    ctx.closePath();
    ctx.stroke();
    ink(ctx, 0.6, 1.2);
    ctx.beginPath();
    ctx.arc(1.3, -0.8, 0.6, 0, TAU);
    ctx.stroke();
  }
}

/**
 * The hen on the nest, straight out of the drawing she comes from.
 *
 * Not the hen with the chick — that one wanders the run and this one has not
 * moved for a fortnight. The drawing is a child's, in crayon, and what it is
 * about is the *shape*: an enormous smooth white body, far too big for the
 * head, with a long neck coming up out of one end of it and the smallest
 * possible curl of tail at the other. Everything worth keeping is in that
 * silhouette, so the body here is bigger relative to the head than any real
 * hen's, in the same way the drawing's is.
 *
 * Four things in the drawing are doing the work and all four are here: the
 * black outline heavier than anything else in the picture, the wing sketched on
 * the body in a completely different and much finer line, the row of pale eggs
 * showing under her, and the orange straw thrown out flat around the whole
 * thing like a sunburst. The straw is what makes her a hen on a nest rather
 * than a hen sitting down.
 *
 * One drawing, nest and bird together. She does not walk and she does not
 * peck, so there is nothing to take apart — the breath is a vertical scale
 * applied to the whole picture, which is a transform.
 */
export function drawBroodyHen(
  ctx: CanvasRenderingContext2D,
  medium: Medium,
  k: number,
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  /** Her body: one big smooth oval, tipped very slightly nose-up. */
  const body = () => {
    ctx.beginPath();
    ctx.ellipse(0, -11, 13.5, 9.5, -0.06, 0, TAU);
  };

  /** The neck and head as one shape, rising forward out of the body. */
  const neck = () => {
    ctx.beginPath();
    ctx.moveTo(6, -16);
    ctx.quadraticCurveTo(13.5, -20, 12.6, -26);
    ctx.quadraticCurveTo(12, -31.5, 8, -31.5);
    ctx.quadraticCurveTo(4.2, -31.5, 4.6, -26.5);
    ctx.quadraticCurveTo(5, -21, 1.5, -17.5);
    ctx.closePath();
  };

  /**
   * The eggs, and they are drawn last of everything.
   *
   * Tucked under her they were invisible — her body is a solid oval and it
   * covered all four. In the drawing they are not under her at all: they are
   * drawn *over* her lower edge, four pale ovals crossing the black outline,
   * which is what a child draws when they know the eggs are there. So they
   * overlap her, and the overlap is the point.
   */
  const EGGS: readonly [number, number, number][] = [
    [-8.6, -5.4, 0.42],
    [-2.9, -4.4, -0.1],
    [2.9, -4.6, 0.16],
    [8.6, -5.6, -0.34],
  ];

  /** The sunburst of straw, thrown out flat and wider than she is. */
  const strawSpray = (draw: (fromX: number, fromY: number, toX: number, toY: number, i: number) => void) => {
    for (let i = 0; i < 19; i++) {
      const a = Math.PI + (i / 18) * Math.PI;
      const reach = 22 + jitter(k + i, 4.5);
      draw(
        Math.cos(a) * 7,
        -3 + Math.sin(a) * 1.8,
        Math.cos(a) * reach,
        -1.5 + Math.sin(a) * reach * 0.3,
        i,
      );
    }
  };

  if (medium === 'color') {
    // The nest first, under everything: the spray, then the mound it sits in.
    ctx.strokeStyle = STRAW;
    ctx.lineWidth = 2.3;
    strawSpray((fx, fy, tx, ty) => {
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    });
    ctx.fillStyle = STRAW;
    ctx.beginPath();
    ctx.ellipse(0, -3.2, 19.5, 5.8, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = STRAW_EDGE;
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 11; i++) {
      const x = -15 + i * 3;
      ctx.beginPath();
      ctx.moveTo(x, -1.2 + jitter(k + 40 + i, 0.8));
      ctx.lineTo(x + 4.5, -5.6 + jitter(k + 50 + i, 0.8));
      ctx.stroke();
    }

    // The tail: the smallest possible curl, as in the drawing, and behind her.
    ctx.strokeStyle = HEN_EDGE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-12.5, -15.5);
    ctx.quadraticCurveTo(-16, -17.4, -14.6, -19.4);
    ctx.quadraticCurveTo(-13.5, -20.7, -12.6, -19.2);
    ctx.stroke();

    // Her, in one piece: neck and body filled together so no seam shows.
    ctx.fillStyle = HEN;
    neck();
    ctx.fill();
    body();
    ctx.fill();

    /*
     * The outline, and it is heavier than any other line in the valley on
     * purpose. In the drawing it is a wax crayon gone over twice and it is the
     * first thing you see; a polite one-pixel edge loses her completely.
     */
    ctx.strokeStyle = HEN_EDGE;
    ctx.lineWidth = 1.9;
    neck();
    ctx.stroke();
    body();
    ctx.stroke();

    /*
     * The wing, in pencil on top of the paint.
     *
     * This is the one place the drawing changes tool: the body is crayon and
     * the wing is a fine graphite outline over it, three layered lobes and no
     * shading. Drawing it in the body's own colours turned her into a lump, and
     * the difference in line is the whole reason the wing reads at all.
     */
    ctx.strokeStyle = 'rgba(74,68,58,0.7)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-0.5, -15.5);
    ctx.quadraticCurveTo(6.5, -19.5, 10, -13.5);
    ctx.quadraticCurveTo(5, -8.6, -0.5, -15.5);
    ctx.stroke();
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(1.4, -14.6);
    ctx.quadraticCurveTo(6, -16.6, 8.4, -12.6);
    ctx.stroke();

    // The comb, and the wattle under the beak. Two blobs and one, as drawn.
    ctx.fillStyle = '#d9463c';
    ctx.beginPath();
    ctx.arc(6.6, -32.3, 1.9, 0, TAU);
    ctx.arc(9.5, -32.7, 1.6, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(10.4, -27.4, 1.5, 0, TAU);
    ctx.fill();

    // The beak, and the one dark dot that makes her look at you.
    ctx.fillStyle = '#e89a2c';
    ctx.beginPath();
    ctx.moveTo(11.6, -29.6);
    ctx.lineTo(16.4, -28.4);
    ctx.lineTo(11.6, -26.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2e2b26';
    ctx.beginPath();
    ctx.arc(10.2, -30.4, 0.95, 0, TAU);
    ctx.fill();

    // And the eggs over her lower edge — see `EGGS`.
    for (const [ex, ey, tilt] of EGGS) {
      ctx.fillStyle = '#f6efdf';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 3.3, 4.1, tilt, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#bfae8c';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    /*
     * A few blades of straw back over the eggs, so they are sitting in the nest
     * rather than stacked in front of it.
     */
    ctx.strokeStyle = STRAW_EDGE;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const x = -11 + i * 5.5;
      ctx.beginPath();
      ctx.moveTo(x - 3, -1.6 + jitter(k + 90 + i, 0.7));
      ctx.lineTo(x + 3.5, -4.4 + jitter(k + 96 + i, 0.7));
      ctx.stroke();
    }
    return;
  }

  /*
   * In graphite she is the same shape and nothing else. No straw colour, no
   * red, no orange — the drawing out here is the outline, which is exactly
   * what the crayon original is underneath its colour.
   */
  ink(ctx, 0.36, 0.9);
  strawSpray((fx, fy, tx, ty, i) => inkLine(ctx, fx, fy, tx, ty, k + 60 + i));

  ink(ctx, 0.5, 1);
  ctx.beginPath();
  ctx.moveTo(-12.5, -15.5);
  ctx.quadraticCurveTo(-16, -17.4, -14.6, -19.4);
  ctx.quadraticCurveTo(-13.5, -20.7, -12.6, -19.2);
  ctx.stroke();

  // Knocked out of the paper, then outlined firmly — she is white, and white
  // over the grain is the paper with a hard line round it.
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = PAPER;
  neck();
  ctx.fill();
  body();
  ctx.fill();
  ctx.globalAlpha = 1;

  ink(ctx, 0.66, 1.5);
  neck();
  ctx.stroke();
  body();
  ctx.stroke();

  ink(ctx, 0.34, 0.85);
  ctx.beginPath();
  ctx.moveTo(-0.5, -15.5);
  ctx.quadraticCurveTo(6.5, -19.5, 10, -13.5);
  ctx.quadraticCurveTo(5, -8.6, -0.5, -15.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(1.4, -14.6);
  ctx.quadraticCurveTo(6, -16.6, 8.4, -12.6);
  ctx.stroke();

  ink(ctx, 0.5, 1.05);
  inkArc(ctx, 6.6, -32.3, 1.8, k + 80);
  inkArc(ctx, 9.5, -32.7, 1.5, k + 86);
  inkArc(ctx, 10.4, -27.4, 1.4, k + 92);
  ctx.beginPath();
  ctx.moveTo(11.6, -29.6);
  ctx.lineTo(16.4, -28.4);
  ctx.lineTo(11.6, -26.8);
  ctx.closePath();
  ctx.stroke();
  ink(ctx, 0.62, 1.25);
  ctx.beginPath();
  ctx.arc(10.2, -30.4, 0.8, 0, TAU);
  ctx.stroke();

  /*
   * The eggs last out here too, knocked out of the paper so her outline does
   * not read straight through them.
   */
  for (const [ex, ey, tilt] of EGGS) {
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 3.3, 4.1, tilt, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ink(ctx, 0.45, 1);
    ctx.beginPath();
    ctx.ellipse(ex + jitter(k + 70 + ex, 0.4), ey, 3.3, 4.1, tilt, 0, TAU);
    ctx.stroke();
  }
}


/** How the purr moves her, `t` seconds into her own clock. */
export function catStir(a: Animal, t: number): {
  breath: number;
  flick: number;
  ear: number;
  settled: number;
} {
  /*
   * Two different clocks, because a cat does two different things at once.
   *
   * `joy` is one murrr: it swells and falls three times over the purr, and
   * drives the parts of her that move with the rumble. `settled` is the whole
   * mood — she keeps her eyes shut and her face soft throughout, including
   * through the quiet seconds between murrrs, and only lets go at the end.
   */
  const joy = purrStrength(PURR_SECONDS - a.purr);
  return {
    /*
     * The breath is the same asleep and purring, on purpose.
     *
     * It is a vertical scale of the whole cat about the ground line, so
     * deepening it does not make her chest rise — it makes her ears rise, and
     * quickening it as well made her bounce like something on a spring. A
     * purring cat lies heavier than a sleeping one, not lighter. So the purr is
     * said with the things that do not lift her off the ground: the tail, the
     * ears, the face.
     */
    breath: 1 + Math.sin(t * 1.5 + a.phase) * 0.035,
    flick: joy * Math.sin(t * 2.3 + a.phase) * 2.6,
    ear: joy * Math.sin(t * 1.7 + a.phase * 2) * 0.7,
    settled: clamp(Math.min((PURR_SECONDS - a.purr) / 0.6, a.purr / 0.9), 0, 1),
  };
}

/** The curled body she sleeps in, and the tabby stripes down it. */
export function drawCatBody(ctx: CanvasRenderingContext2D, medium: Medium, k: number): void {
  movingShadow(ctx, 0, 1, 15, 4.5, medium, k + 200);
  if (medium === 'color') {
    ctx.fillStyle = '#c9834b';
    ctx.beginPath(); ctx.ellipse(0, -8, 13, 8, 0, 0, TAU); ctx.fill();        // curled body
    ctx.fillStyle = '#b06f3c';
    for (const s of [-6, 0, 6]) {                                        // tabby stripes
      ctx.beginPath(); ctx.ellipse(s, -11, 1.7, 3.4, 0.25, 0, TAU); ctx.fill();
    }
  } else {
    ink(ctx, 0.5, 1.15);
    ctx.beginPath();
    ctx.ellipse(jitter(k, .6), -8 + jitter(k + 1, .6), 13, 8, 0, 0, TAU);
    ctx.stroke();
    ink(ctx, 0.28, 0.8);
    for (const s of [-6, 0, 6]) inkLine(ctx, s - 1, -13, s + 1, -9, k + 30 + s);
  }
}

/**
 * The tail, wrapped round the front of her and swinging while she purrs.
 *
 * Pictures rather than a rotation, which the head of a grazing cow gets: this
 * tail is curled round on itself and its tip is barely five units from where it
 * leaves the body, so turning it about that point would swing the middle of the
 * curl right across her face. Seven of them cover the whole sway, and the sway
 * only happens while somebody is stroking her.
 */
export function drawCatTail(
  ctx: CanvasRenderingContext2D,
  flick: number,
  medium: Medium,
  _k: number,
): void {
  const tipX = 6 + flick * 1.4;
  const tipY = -1.5 + flick * 0.5;
  if (medium === 'color') {
    ctx.strokeStyle = '#c9834b'; ctx.lineWidth = 4.6; ctx.lineCap = 'round';
  } else {
    ink(ctx, 0.45, 1.05);
  }
  ctx.beginPath();
  ctx.moveTo(9, -6);
  ctx.quadraticCurveTo(16, -2 - flick * 0.6, tipX, tipY);
  ctx.stroke();
}

/**
 * Her head: the ears turning, the shut eyes folding, the small smile.
 *
 * All three are the purr talking, and all three are a fraction of a pixel — so
 * they are pictures, and few of them. In graphite she is only ever the sleeping
 * one: a cat the colour has reached is drawn in paint, and a cat it has not is
 * pencil on paper, which does not move.
 */
export function drawCatHead(
  ctx: CanvasRenderingContext2D,
  ear: number,
  settled: number,
  medium: Medium,
  k: number,
): void {
  const squint = settled * 0.85;
  const eyeR = 2 + squint;
  if (medium === 'color') {
    ctx.fillStyle = '#c9834b';
    ctx.beginPath(); ctx.arc(-11, -10, 6.2, 0, TAU); ctx.fill();               // head
    ctx.beginPath(); ctx.moveTo(-15, -14); ctx.lineTo(-16 - ear, -19 - ear); ctx.lineTo(-11, -15.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-8, -15); ctx.lineTo(-6 + ear, -19.5 - ear); ctx.lineTo(-5, -13.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6b4a2c'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-13, -9.5 - squint, eyeR, 0.15, Math.PI - 0.15); ctx.stroke();  // shut eye
    ctx.beginPath(); ctx.arc(-8.5, -9.5 - squint, eyeR * 0.85, 0.15, Math.PI - 0.15); ctx.stroke();
    if (settled > 0.04) {
      ctx.globalAlpha = settled;
      ctx.beginPath(); ctx.arc(-12.4, -6.6, 1.5, 0.2, Math.PI - 0.2); ctx.stroke();  // the small smile
      ctx.beginPath(); ctx.arc(-9.6, -6.6, 1.5, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  } else {
    ink(ctx, 0.45, 1.05);
    inkArc(ctx, -11, -10, 6.2, k + 10);
    ink(ctx, 0.4, 0.95);
    inkPoly(ctx, [[-15, -14], [-16 - ear, -19 - ear], [-11, -15.5]], k + 16, true);
    inkPoly(ctx, [[-8, -15], [-6 + ear, -19.5 - ear], [-5, -13.5]], k + 24, true);
    ink(ctx, 0.5, 1);
    ctx.beginPath(); ctx.arc(-13, -9.5 - squint, eyeR, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.beginPath(); ctx.arc(-8.5, -9.5 - squint, eyeR * 0.85, 0.15, Math.PI - 0.15); ctx.stroke();
    if (settled > 0.04) {
      ink(ctx, 0.42 * settled, 0.8);
      ctx.beginPath(); ctx.arc(-12.4, -6.6, 1.5, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(-9.6, -6.6, 1.5, 0.2, Math.PI - 0.2); ctx.stroke();
    }
  }
}

/** The ring left on the water where something went in. */
function splash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  spread: number,
  size: number,
  medium: Medium,
): void {
  ctx.save();
  for (let i = 0; i < 2; i++) {
    const r = size * (0.4 + spread * (1.1 + i * 0.7));
    ctx.globalAlpha = Math.max(0, (1 - spread) * (i ? 0.3 : 0.55));
    ctx.strokeStyle = medium === 'color' ? '#eaf5fb' : PENCIL;
    ctx.lineWidth = medium === 'color' ? 1.5 : 0.9;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.42, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/** How far the ring has opened, or nothing if it has not started. */
export function frogRing(dive: number): number | undefined {
  return dive > 0.45 ? (dive - 0.45) / 0.55 : undefined;
}

/** The ring on the water, at unit size — the caller scales it to the frog. */
export function drawFrogSplash(
  ctx: CanvasRenderingContext2D,
  spread: number,
  medium: Medium,
): void {
  splash(ctx, 0, 0, spread, 9, medium);
}

/**
 * A frog on a lily pad, out on the pond.
 *
 * Painted from one of the paintings on the easel — the same teal back, the same
 * yellow throat, the same two eyes stuck on top like buttons. Five of them sit
 * out there, and at the end you get to see the picture they came from.
 *
 * It does not move, and that is the joke: a frog on a pad is the stillest thing
 * in the valley until the moment it is not. All it does is breathe and blink —
 * and the breath is a scale, so the only pictures here are the blink and the
 * pulse of the throat. The leap is a transform from beginning to end: up, along,
 * smaller, fainter, gone.
 */
export function drawFrogBody(
  ctx: CanvasRenderingContext2D,
  throat: number,
  lid: number,
  medium: Medium,
  k: number,
): void {
  if (medium === 'color') {
    /*
     * Bright against the pad, and outlined.
     *
     * In the painting the pads are a deep blue-green and the frogs sit on them
     * like lamps; here the pads are already grass-coloured, so the separation
     * has to come from tone rather than hue — the frog is a darker green than
     * its leaf, with a dark edge drawn round it.
     *
     * It was a bright mint green to begin with, which separated from the pad
     * well enough but went strange once the pond was repainted paler: a minty
     * frog on pale blue water reads as a sweet rather than an animal.
     */
    ctx.strokeStyle = '#17482a';
    ctx.lineWidth = 1.1;
    ctx.lineJoin = 'round';

    // Front legs tucked under, drawn first so the body overlaps them.
    ctx.fillStyle = '#276b3b';
    for (const lx of [-7.8, 7.8]) {
      ctx.beginPath();
      ctx.ellipse(lx, 0.5, 3.6, 2.1, lx < 0 ? 0.4 : -0.4, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    // Eye mounds, also behind the body: two bumps on the skull.
    ctx.fillStyle = '#347f47';
    for (const ex of [-5.4, 5.4]) {
      ctx.beginPath();
      ctx.arc(ex, -10.4, 3.6, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    // Back: a wide low dome, the way a frog sits.
    ctx.beginPath();
    ctx.ellipse(0, -5, 11, 7.5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    /*
     * The belly, low and wide.
     *
     * It used to be a tall oval in the middle of the face, which is exactly
     * where a beak goes — and that is what it looked like. Dropped to the
     * bottom of the dome and flattened out, it goes back to being the pale
     * front of a frog, and the smile above it has room to be a smile.
     */
    ctx.fillStyle = '#f0c257';
    ctx.beginPath();
    ctx.ellipse(0, -0.8, 6.2 * throat, 3.4 * throat, 0, 0, TAU);
    ctx.fill();
    // Eyes: a pale ring and a dark pupil, with the lid coming down over both.
    for (const ex of [-5.4, 5.4]) {
      ctx.fillStyle = '#f6f1e4';
      ctx.beginPath();
      ctx.arc(ex, -10.8, 2.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1d2e28';
      ctx.beginPath();
      ctx.arc(ex, -10.8, 1.15, 0, TAU);
      ctx.fill();
      if (lid > 0.02) {
        ctx.fillStyle = '#347f47';
        ctx.beginPath();
        ctx.ellipse(ex, -12.2 + lid * 1.4, 2.4, 2.4 * lid, 0, 0, TAU);
        ctx.fill();
      }
    }
    // A wide smile across the face, well clear of the belly.
    ctx.strokeStyle = '#17482a';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -7.4, 6.2, 0.32, Math.PI - 0.32);
    ctx.stroke();
    return;
  }

  /*
   * Fewer strokes than the colour version, deliberately.
   *
   * A frog is a fifth the size of a sheep, and everything that reads on a sheep
   * — hatched shading, tucked legs, a hatched throat — turns into one dark
   * scribble on something twenty pixels across sitting on an already-outlined
   * lily pad. What survives at this size is the dome, two eyes and the mouth,
   * so that is all that is drawn.
   */
  ink(ctx, 0.5, 1.1);
  ctx.beginPath();
  ctx.ellipse(jitter(k, 0.6), -5 + jitter(k + 1, 0.6), 11, 7.5, 0, 0, TAU);
  ctx.stroke();
  ink(ctx, 0.5, 1.05);
  for (const ex of [-5.4, 5.4]) inkArc(ctx, ex, -10.4, 3.2, k + 30 + ex);
  // Pupils: dots rather than circles, which at this scale fill in anyway.
  ink(ctx, 0.62, 1.5);
  ctx.lineCap = 'round';
  for (const ex of [-5.4, 5.4]) inkLine(ctx, ex, -10.6, ex, -10.2, k + 40 + ex);
  ink(ctx, 0.45, 0.95);
  ctx.beginPath();
  ctx.arc(0, -6.2, 5.2, 0.5, Math.PI - 0.5);
  ctx.stroke();
}

/** How high the leap has carried it, at unit scale. */
export function frogHop(dive: number): number {
  return Math.sin(dive * Math.PI) * 13;
}

/** How far away it has got, as a scale. */
export function frogShrink(dive: number): number {
  return 1 - dive * 0.55;
}

/** How far the lid has come down, 0 to 1. Rare, quick, and out of step. */
export function frogBlink(a: Animal, t: number): number {
  return Math.max(0, Math.sin(t * 0.7 + a.phase * 3) - 0.985) * 60;
}

/** Its breath and the pulse of its throat, both of them small. */
export function frogBreath(a: Animal, t: number): number {
  return 1 + Math.sin(t * 1.9 + a.phase) * 0.045;
}

export function frogThroat(a: Animal, t: number): number {
  return 1 + Math.sin(t * 3.1 + a.phase) * 0.06;
}
