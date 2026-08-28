import { clamp, TAU } from '../core/math';
import { ink, inkArc, inkLine, inkLines, jitter } from '../media/ink';
import { PENCIL, type Medium } from '../media/medium';
import { groundShadow } from '../media/pencil';

/**
 * The stump in the northern wood, and what turns up if you wait by it.
 *
 * Two minutes is a long time to ask anyone to do nothing, and that is the whole
 * point: nothing else here is on a clock, and the one thing that is asks for
 * patience rather than for walking further. Stand up and it goes away again.
 *
 * The elephant is from one of the paintings — dark brown, blocky, a striped
 * trunk, green eyes and red toenails — and there is nothing in this valley to
 * explain it. There does not need to be.
 */

/** How long you have to sit before anything happens. */
export const VIGIL_SECONDS = 120;

/** Seconds it takes to arrive, and the quicker seconds it takes to melt away. */
const ARRIVING = 6;
const LEAVING = 2;

const SKIN = '#f2c398';
const HAIR = '#4a3527';
const SHIRT = '#e8563f';
const SHIRT_SHADE = '#c9452f';
const TROUSERS = '#3a5a86';

export class Vigil {
  sitting = false;

  /** Seconds sat, which goes back to nothing the moment you stand up. */
  clock = 0;

  /** How far the elephant has arrived: 0 nothing there, 1 fully here. */
  elephant = 0;

  /** Whether it has ever shown itself this session. */
  seen = false;

  /** The elephant's own clock, for the ear and the tail. Runs while it is here. */
  beastClock = 0;

  constructor(
    readonly x: number,
    readonly y: number,
    readonly elephantX: number,
    readonly elephantY: number,
  ) {}

  sitDown(): void {
    this.sitting = true;
  }

  getUp(): void {
    this.sitting = false;
    this.clock = 0;
  }

  reset(): void {
    this.getUp();
    this.elephant = 0;
    this.beastClock = 0;
    this.seen = false;
  }

  /** How far through the wait you are, for anything that wants to hint at it. */
  get patience(): number {
    return clamp(this.clock / VIGIL_SECONDS, 0, 1);
  }

  /** Steps the wait on, and answers true on the frame it first shows itself. */
  update(dt: number): boolean {
    if (!this.sitting) {
      this.elephant = Math.max(0, this.elephant - dt / LEAVING);
      if (this.elephant > 0) this.beastClock += dt;
      return false;
    }

    this.clock += dt;
    if (this.clock < VIGIL_SECONDS) return false;

    const first = this.elephant === 0;
    this.elephant = Math.min(1, this.elephant + dt / ARRIVING);
    this.beastClock += dt;
    if (first) this.seen = true;
    return first;
  }
}

/** The stump, and whoever is sitting on it. */
export function drawStump(ctx: CanvasRenderingContext2D, v: Vigil, medium: Medium): void {
  const { x, y } = v;
  groundShadow(ctx, x, y + 2, 17, 6, medium);

  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (medium === 'color') {
    // The side of it, then the cut face on top, then the rings.
    ctx.fillStyle = '#6b4a32';
    ctx.beginPath();
    ctx.moveTo(-13, -9);
    ctx.lineTo(-12.4, -1);
    ctx.quadraticCurveTo(0, 3.4, 12.4, -1);
    ctx.lineTo(13, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a8845c';
    ctx.beginPath();
    ctx.ellipse(0, -9.5, 13, 5.2, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,63,42,.55)';
    ctx.lineWidth = 0.9;
    for (const r of [0.32, 0.58, 0.82]) {
      ctx.beginPath();
      ctx.ellipse(-0.8, -9.5, 13 * r, 5.2 * r, 0, 0, TAU);
      ctx.stroke();
    }
    // Bark, one or two vertical splits.
    ctx.strokeStyle = 'rgba(58,40,26,.5)';
    ctx.lineWidth = 1;
    for (const bx of [-7, 2.5, 8]) {
      ctx.beginPath();
      ctx.moveTo(bx, -8.4);
      ctx.lineTo(bx + 0.8, -1.4);
      ctx.stroke();
    }
  } else {
    const k = 5300;
    ink(ctx, 0.55, 1.15);
    ctx.beginPath();
    ctx.ellipse(jitter(k, 0.5), -9.5 + jitter(k + 1, 0.5), 13, 5.2, 0, 0, TAU);
    ctx.stroke();
    inkLines(
      ctx,
      [
        [-13, -9, -12.4, -1],
        [13, -9, 12.4, -1],
      ],
      k + 4,
    );
    ink(ctx, 0.45, 1);
    ctx.beginPath();
    ctx.moveTo(-12.4, -1);
    ctx.quadraticCurveTo(0, 3.4, 12.4, -1);
    ctx.stroke();
    ink(ctx, 0.3, 0.75);
    for (const r of [0.34, 0.62, 0.86]) {
      ctx.beginPath();
      ctx.ellipse(-0.8, -9.5, 13 * r, 5.2 * r, 0, 0, TAU);
      ctx.stroke();
    }
    for (const bx of [-7, 2.5, 8]) inkLine(ctx, bx, -8.4, bx + 0.8, -1.4, k + 20 + bx);
  }
  ctx.restore();

  if (v.sitting) drawSitter(ctx, x, y, medium);
}

/**
 * The walker, sat on the stump with their knees up.
 *
 * Drawn here rather than by `drawWalker`, the same way the sleeper in the
 * hammock is: the standing figure would otherwise be planted through the middle
 * of the stump, and a person sitting is not a person standing with a shorter
 * gap between their feet.
 */
function drawSitter(ctx: CanvasRenderingContext2D, x: number, y: number, medium: Medium): void {
  ctx.save();
  ctx.translate(x, y - 9);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (medium === 'color') {
    // Legs, hanging down off the front of the stump.
    ctx.strokeStyle = TROUSERS;
    ctx.lineWidth = 5.4;
    ctx.beginPath();
    ctx.moveTo(-1, -2);
    ctx.quadraticCurveTo(5.5, -1, 7.5, 7);
    ctx.stroke();
    ctx.strokeStyle = '#33507a';
    ctx.beginPath();
    ctx.moveTo(-1.5, -2);
    ctx.quadraticCurveTo(3.5, -0.5, 5, 7.5);
    ctx.stroke();
    ctx.strokeStyle = '#4a3b30';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(7.5, 7);
    ctx.lineTo(9.6, 7.6);
    ctx.moveTo(5, 7.5);
    ctx.lineTo(7.1, 8.1);
    ctx.stroke();

    // Body, leaning back a little the way you do when you have stopped.
    ctx.fillStyle = SHIRT;
    ctx.beginPath();
    ctx.moveTo(-5.6, -3);
    ctx.quadraticCurveTo(-6.6, -12, -3.4, -15);
    ctx.lineTo(3, -14.4);
    ctx.quadraticCurveTo(4.2, -8, 3.4, -2);
    ctx.closePath();
    ctx.fill();
    // An arm, propped on the stump behind.
    ctx.strokeStyle = SHIRT_SHADE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-4, -11);
    ctx.quadraticCurveTo(-7.5, -7, -7, -2.5);
    ctx.stroke();
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(-7, -1.8, 1.7, 0, TAU);
    ctx.fill();

    // Head, turned to whatever it is watching for.
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(0.4, -18.4, 4.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.arc(0.4, -19.4, 4.6, Math.PI * 0.92, Math.PI * 2.16);
    ctx.fill();
  } else {
    const k = 5400;
    ink(ctx, 0.5, 1.2);
    ctx.beginPath();
    ctx.moveTo(-1, -2);
    ctx.quadraticCurveTo(5.5, -1, 7.5 + jitter(k, 0.5), 7);
    ctx.moveTo(-1.5, -2);
    ctx.quadraticCurveTo(3.5, -0.5, 5 + jitter(k + 1, 0.5), 7.5);
    ctx.stroke();
    ink(ctx, 0.55, 1.25);
    ctx.beginPath();
    ctx.moveTo(-5.6 + jitter(k + 2, 0.5), -3);
    ctx.quadraticCurveTo(-6.6, -12, -3.4, -15);
    ctx.lineTo(3, -14.4);
    ctx.quadraticCurveTo(4.2, -8, 3.4, -2);
    ctx.closePath();
    ctx.stroke();
    ink(ctx, 0.5, 1.1);
    ctx.beginPath();
    ctx.moveTo(-4, -11);
    ctx.quadraticCurveTo(-7.5, -7, -7, -2.5);
    ctx.stroke();
    inkArc(ctx, 0.4, -18.4, 4.6, k + 8);
    ink(ctx, 0.35, 0.9);
    inkLines(
      ctx,
      [0, 1, 2, 3].map((i) => [-3.4 + i * 2, -22.4, -2 + i * 2, -19] as const),
      k + 14,
    );
  }
  ctx.restore();
}

/**
 * The elephant, from the painting.
 *
 * Side on and facing left, dark brown and blocky, with the ears set high on the
 * head, a long trunk hanging down with stripes across it, small green eyes and
 * red toenails. Nothing about it is to scale with anything else here, which is
 * true of the painting too.
 */
export function drawElephant(ctx: CanvasRenderingContext2D, v: Vigil, medium: Medium): void {
  if (v.elephant <= 0) return;
  const here = clamp(v.elephant, 0, 1);
  // An ear, and the tail, and nothing else. It stands there.
  const clock = v.beastClock;
  const ear = Math.sin(clock * 0.8) * 0.09;
  const tail = Math.sin(clock * 0.7) * 3.2;

  ctx.save();
  /*
   * Fading in where it stands, rather than walking out of the trees.
   *
   * It was going to come in from the north, and that was worse: a thing that
   * walks up to you is an event, and this should feel like something that was
   * there all along and which you only now happen to be still enough to see.
   */
  ctx.globalAlpha = here;
  ctx.translate(v.elephantX, v.elephantY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  groundShadow(ctx, 0, 2, 40, 11, medium);

  if (medium === 'color') {
    const hide = '#4a3a2c';
    /*
     * Toenails first, so the feet are drawn over their tops.
     *
     * Pink rather than the red they sample as in the painting — the paint there
     * is a coral that reads red at full size and simply muddy at this one.
     */
    ctx.fillStyle = '#e8848f';
    for (const fx of [-16, -6, 14, 24]) {
      ctx.beginPath();
      ctx.ellipse(fx, -1, 5.2, 3, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = hide;
    // Legs: four blunt columns.
    for (const [fx, w] of [
      [-16, 9],
      [-6, 8],
      [14, 8],
      [24, 9],
    ] as const) {
      ctx.beginPath();
      ctx.rect(fx - w / 2, -26, w, 23);
      ctx.fill();
    }
    // Body: one heavy slab, higher at the shoulder.
    ctx.beginPath();
    ctx.moveTo(-22, -24);
    ctx.quadraticCurveTo(-24, -46, -8, -49);
    ctx.quadraticCurveTo(14, -52, 28, -45);
    ctx.quadraticCurveTo(33, -38, 30, -23);
    ctx.quadraticCurveTo(4, -18, -22, -24);
    ctx.closePath();
    ctx.fill();
    // Tail.
    ctx.strokeStyle = hide;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(29, -42);
    ctx.quadraticCurveTo(34, -34, 32 + tail, -25);
    ctx.stroke();

    // Head and trunk, at the left end.
    ctx.fillStyle = hide;
    ctx.beginPath();
    ctx.ellipse(-24, -40, 12, 13, 0.12, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-30, -32);
    ctx.quadraticCurveTo(-38, -20, -35, -4);
    ctx.quadraticCurveTo(-31.5, -2, -29.5, -5);
    ctx.quadraticCurveTo(-31, -20, -24, -30);
    ctx.closePath();
    ctx.fill();
    // The stripes across the trunk.
    ctx.strokeStyle = '#241b13';
    ctx.lineWidth = 1.6;
    for (const i of [0, 1, 2, 3, 4]) {
      const ty = -25 + i * 4.4;
      ctx.beginPath();
      ctx.moveTo(-35.4 + i * 0.5, ty);
      ctx.lineTo(-31 + i * 0.35, ty + 0.8);
      ctx.stroke();
    }
    // Ears, set high and round.
    ctx.save();
    ctx.translate(-22, -49);
    ctx.rotate(ear);
    ctx.fillStyle = '#43342780';
    ctx.beginPath();
    ctx.ellipse(-4, -2, 8, 9, -0.25, 0, TAU);
    ctx.fill();
    ctx.fillStyle = hide;
    ctx.beginPath();
    ctx.ellipse(7, -3, 8.5, 9.5, 0.2, 0, TAU);
    ctx.fill();
    ctx.restore();
    // Two green eyes, which is what the painting gives it.
    ctx.fillStyle = '#3fae52';
    for (const ey of [[-27.5, -42], [-20.5, -43]] as const) {
      ctx.beginPath();
      ctx.ellipse(ey[0], ey[1], 2, 1.5, 0.2, 0, TAU);
      ctx.fill();
    }
  } else {
    const k = 6100;
    ink(ctx, 0.5, 1.3);
    ctx.beginPath();
    ctx.moveTo(-22 + jitter(k, 0.7), -24);
    ctx.quadraticCurveTo(-24, -46, -8, -49);
    ctx.quadraticCurveTo(14, -52, 28, -45);
    ctx.quadraticCurveTo(33, -38, 30 + jitter(k + 1, 0.7), -23);
    ctx.quadraticCurveTo(4, -18, -22, -24);
    ctx.stroke();
    for (const [fx, w] of [
      [-16, 9],
      [-6, 8],
      [14, 8],
      [24, 9],
    ] as const) {
      inkLines(
        ctx,
        [
          [fx - w / 2, -24, fx - w / 2, -2],
          [fx + w / 2, -24, fx + w / 2, -2],
          [fx - w / 2, -2, fx + w / 2, -2],
        ],
        k + 10 + fx,
      );
    }
    inkArc(ctx, -24, -40, 12.5, k + 30);
    ink(ctx, 0.5, 1.2);
    ctx.beginPath();
    ctx.moveTo(-30, -32);
    ctx.quadraticCurveTo(-38, -20, -35, -4);
    ctx.quadraticCurveTo(-31.5, -2, -29.5, -5);
    ctx.quadraticCurveTo(-31, -20, -24, -30);
    ctx.stroke();
    ink(ctx, 0.42, 1);
    for (const i of [0, 1, 2, 3, 4]) {
      const ty = -25 + i * 4.4;
      inkLine(ctx, -35.4 + i * 0.5, ty, -31 + i * 0.35, ty + 0.8, k + 40 + i);
    }
    inkArc(ctx, -26, -51, 8.5, k + 50);
    inkArc(ctx, -15, -52, 9, k + 52);
    ink(ctx, 0.6, 1.4);
    for (const ey of [[-27.5, -42], [-20.5, -43]] as const) inkArc(ctx, ey[0], ey[1], 1.6, k + 60 + ey[0]);
    ink(ctx, 0.45, 1.1);
    ctx.strokeStyle = PENCIL;
    ctx.beginPath();
    ctx.moveTo(29, -42);
    ctx.quadraticCurveTo(34, -34, 32 + tail, -25);
    ctx.stroke();
  }
  ctx.restore();
}
