import { TAU } from '../core/math';
import { ink, inkArc, inkLines, jitter } from '../media/ink';
import type { Medium } from '../media/medium';
import { drawSitter } from './vigil';

/**
 * Somewhere to stop that asks nothing of you.
 *
 * The valley has three of these now — the hammock, the stump, and these two —
 * and only the stump is waiting for something. A bench and a haystack are just
 * places to be, and the whole feature is that pressing the key does nothing
 * except put the walker down and take the keys away until you get up.
 *
 * One class for both because the difference between them is a pose. You sit on
 * a bench; you flop backwards into hay.
 */

export type Pose = 'bench' | 'hay';

/**
 * What sitting down on each of them, and getting up again, is worth saying.
 *
 * Kept apart from the prompt because the prompt is an instruction and these are
 * not: they are the only thing either place gives you back.
 */
const NOTES: Record<Pose, { on: string; off: string }> = {
  bench: { on: 'note.satBench', off: 'note.leftBench' },
  hay: { on: 'note.lainHay', off: 'note.leftHay' },
};

const SKIN = '#f2c398';
const HAIR = '#4a3527';
const SHIRT = '#e8563f';
const SHIRT_SHADE = '#c9452f';
const SCARF = '#f7c14b';
const TROUSERS = '#3a5a86';
const EYE = '#3a2f26';

export class Perch {
  /** Whether the walker is on it. */
  resting = false;

  /** Its own clock, which only runs while the colour is on it. */
  clock = 0;

  /** Whether the colour has reached it. */
  lit = false;

  constructor(
    readonly x: number,
    readonly y: number,
    readonly pose: Pose,
    /** What the prompt says when you are near enough to use it. */
    readonly say: string,
    /** Which way the walker faces once they are on it. */
    readonly face: -1 | 1,
  ) {}

  /** The line for settling onto it, and the one for leaving it. */
  get note(): string {
    return NOTES[this.pose].on;
  }

  get parting(): string {
    return NOTES[this.pose].off;
  }

  sitDown(): void {
    this.resting = true;
    this.clock = 0;
  }

  getUp(): void {
    this.resting = false;
  }

  update(dt: number, lit: boolean): void {
    this.lit = lit;
    // Out of the colour it is a drawing, and drawings hold still.
    if (lit) this.clock += dt;
  }
}

/** Whoever is on it, if anyone. The seat itself is baked into the world. */
export function drawPerch(ctx: CanvasRenderingContext2D, perch: Perch, medium: Medium): void {
  if (!perch.resting) return;
  if (perch.pose === 'bench') {
    // The bench's seat is twenty above its origin; the sitter's own drawing
    // puts the hips a little below wherever it is told, so this lands on it.
    drawSitter(ctx, perch.x + 2, perch.y - 11, perch.face, medium);
    return;
  }
  drawLounger(ctx, perch, medium);
}

/**
 * Flopped back into the hay, legs out, hands behind the head.
 *
 * Not the sitting figure moved up the slope: somebody on a haystack is lying
 * against it rather than perched on it, and the give-away is the angle of the
 * back. This leans a long way over and lets the legs run out in front.
 */
function drawLounger(ctx: CanvasRenderingContext2D, perch: Perch, medium: Medium): void {
  const t = perch.clock;
  // Breathing, slow and shallow. Anything more and they look uncomfortable.
  const breath = Math.sin(t * 0.9) * 0.6;

  ctx.save();
  ctx.translate(perch.x, perch.y);
  ctx.scale(perch.face, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (medium === 'color') {
    // Legs, running down the slope in front.
    ctx.strokeStyle = '#33507a';
    ctx.lineWidth = 6.4;
    ctx.beginPath();
    ctx.moveTo(-2, -6);
    ctx.quadraticCurveTo(10, -3, 19, 2);
    ctx.stroke();
    ctx.strokeStyle = TROUSERS;
    ctx.beginPath();
    ctx.moveTo(-3, -3.5);
    ctx.quadraticCurveTo(9, -0.5, 17.5, 4.5);
    ctx.stroke();
    ctx.strokeStyle = '#4a3b30';
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(19, 2);
    ctx.lineTo(23, 3);
    ctx.moveTo(17.5, 4.5);
    ctx.lineTo(21.5, 5.5);
    ctx.stroke();

    // Body, leaning right back into it.
    ctx.save();
    ctx.rotate(-0.62 + breath * 0.012);
    ctx.fillStyle = SHIRT;
    ctx.beginPath();
    ctx.moveTo(-5.4, 0.5);
    ctx.quadraticCurveTo(-7.4, -7, -5.6, -13);
    ctx.lineTo(4.4, -12);
    ctx.quadraticCurveTo(6, -6, 5.2, 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = SCARF;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-5.2, -11.4);
    ctx.quadraticCurveTo(0, -9.4, 4.6, -11);
    ctx.stroke();
    // An arm folded up behind the head, which is what says "at rest".
    ctx.strokeStyle = SHIRT_SHADE;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(-3.6, -10.5);
    ctx.quadraticCurveTo(-9.5, -14, -6.5, -20);
    ctx.stroke();

    // Head, at the walker's own size, tipped back with it.
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(1, -22, 9.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.arc(1, -22.5, 9.4, Math.PI * 0.98, Math.PI * 2.12);
    ctx.quadraticCurveTo(7, -20, 9.6, -18.5);
    ctx.quadraticCurveTo(5, -21.5, -1, -20.5);
    ctx.closePath();
    ctx.fill();
    // Eyes shut. Nobody lies back in hay to keep watch.
    ctx.strokeStyle = EYE;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(4.4, -22.6, 2.4, 0.35, Math.PI - 0.35);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    return;
  }

  const k = 8200;
  ink(ctx, 0.5, 1.25);
  ctx.beginPath();
  ctx.moveTo(-3, -3.5);
  ctx.quadraticCurveTo(9, -0.5, 17.5 + jitter(k, 0.5), 4.5);
  ctx.moveTo(-2, -6);
  ctx.quadraticCurveTo(10, -3, 19 + jitter(k + 1, 0.5), 2);
  ctx.stroke();
  ctx.save();
  ctx.rotate(-0.62);
  ink(ctx, 0.55, 1.3);
  ctx.beginPath();
  ctx.moveTo(-5.4 + jitter(k + 2, 0.5), 0.5);
  ctx.quadraticCurveTo(-7.4, -7, -5.6, -13);
  ctx.lineTo(4.4, -12);
  ctx.quadraticCurveTo(6, -6, 5.2, 0.5);
  ctx.closePath();
  ctx.stroke();
  ink(ctx, 0.45, 1.1);
  ctx.beginPath();
  ctx.moveTo(-3.6, -10.5);
  ctx.quadraticCurveTo(-9.5, -14, -6.5, -20);
  ctx.stroke();
  ink(ctx, 0.55, 1.25);
  inkArc(ctx, 1, -22, 9.2, k + 8);
  ink(ctx, 0.34, 0.9);
  inkLines(
    ctx,
    [0, 1, 2, 3, 4].map((i) => [-6.6 + i * 3, -29.4, -4.6 + i * 3, -24.4] as const),
    k + 14,
  );
  ink(ctx, 0.45, 1);
  ctx.beginPath();
  ctx.arc(4.4, -22.6, 2.4, 0.35, Math.PI - 0.35);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}
