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

/** How much bigger than life it is. Nothing about it is to scale anyway. */
const ELEPHANT_SCALE = 2;

const SKIN = '#f2c398';
const HAIR = '#4a3527';
const SHIRT = '#e8563f';
const SHIRT_SHADE = '#c9452f';
const TROUSERS = '#3a5a86';
const SCARF = '#f7c14b';
const EYE = '#3a2f26';

export class Vigil {
  sitting = false;

  /** Seconds sat, which goes back to nothing the moment you stand up. */
  clock = 0;

  /** How far the elephant has arrived: 0 nothing there, 1 fully here. */
  elephant = 0;

  /** Whether it has ever shown itself this session. */
  seen = false;

  /**
   * Whether the colour has reached the elephant.
   *
   * Its ear and its tail move on `beastClock`, and out in the graphite they
   * must not: everything else in this valley holds perfectly still once the
   * colour has left it, because it is a drawing again.
   */
  lit = false;

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
      if (this.elephant > 0 && this.lit) this.beastClock += dt;
      return false;
    }

    this.clock += dt;
    if (this.clock < VIGIL_SECONDS) return false;

    const first = this.elephant === 0;
    this.elephant = Math.min(1, this.elephant + dt / ARRIVING);
    if (this.lit) this.beastClock += dt;
    if (first) this.seen = true;
    return first;
  }
}

/** The stump, and whoever is sitting on it. */
export function drawStump(ctx: CanvasRenderingContext2D, v: Vigil, medium: Medium): void {
  const { x, y } = v;
  groundShadow(ctx, x, y + 2, 17, 6, medium, true);

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

  // Facing whatever it is waiting for, which is the only reason to sit here.
  if (v.sitting) drawSitter(ctx, x, y, v.elephantX < v.x ? -1 : 1, medium);
}

/**
 * The walker, sat on the stump with their knees up.
 *
 * Drawn here rather than by `drawWalker`, the same way the sleeper in the
 * hammock is: the standing figure would otherwise be planted through the middle
 * of the stump, and a person sitting is not a person standing with a shorter
 * gap between their feet.
 */
function drawSitter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  face: -1 | 1,
  medium: Medium,
): void {
  /*
   * Built off the standing walker's own proportions, because the first version
   * of this was not: its head was a 4.6 disc where the walker's is 9.2, so
   * sitting down halved them. Hips at the seat, shoulders twelve above, head
   * centre ten above that — the same spacing `player.ts` uses standing.
   */
  ctx.save();
  ctx.translate(x - face, y - 10);
  ctx.scale(face, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (medium === 'color') {
    // Legs: thigh forward off the seat, shin down to the ground.
    ctx.strokeStyle = '#33507a';
    ctx.lineWidth = 6.4;
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(9.5, -1.5);
    ctx.lineTo(11.5, 9);
    ctx.stroke();
    ctx.strokeStyle = TROUSERS;
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.lineTo(11, 0.5);
    ctx.lineTo(13.5, 10.5);
    ctx.stroke();
    ctx.strokeStyle = '#4a3b30';
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(11.5, 9.6);
    ctx.lineTo(15.5, 10.2);
    ctx.moveTo(13.5, 11);
    ctx.lineTo(17.5, 11.6);
    ctx.stroke();

    // Body, leaning back the way you do when you have stopped walking.
    ctx.fillStyle = SHIRT;
    ctx.beginPath();
    ctx.moveTo(-5.4, 0.5);
    ctx.quadraticCurveTo(-7.4, -7, -5.6, -13);
    ctx.lineTo(4.4, -12);
    ctx.quadraticCurveTo(6, -6, 5.2, 0.5);
    ctx.closePath();
    ctx.fill();
    // The scarf, which is what says it is the same person.
    ctx.strokeStyle = SCARF;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-5.2, -11.4);
    ctx.quadraticCurveTo(0, -9.4, 4.6, -11);
    ctx.stroke();
    // An arm, propped back on the stump.
    ctx.strokeStyle = SHIRT_SHADE;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(-4.4, -10.5);
    ctx.quadraticCurveTo(-9.5, -6, -9, -0.5);
    ctx.stroke();
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(-9, 0.6, 2.6, 0, TAU);
    ctx.fill();

    /*
     * Head: the walker's own, at the walker's own size, and their own haircut —
     * a fringe rather than a helmet. Drawn as a plain arc it swallowed the
     * whole face and left a pale band under a brown lump.
     */
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(1, -22, 9.2, 0, TAU);
    ctx.fill();
    // The haircut and the eye at exactly the offsets `player.ts` uses, so it is
    // recognisably the same person and not a doll of them.
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.arc(1, -22.5, 9.4, Math.PI * 0.98, Math.PI * 2.12);
    ctx.quadraticCurveTo(7, -20, 9.6, -18.5);
    ctx.quadraticCurveTo(5, -21.5, -1, -20.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = EYE;
    ctx.beginPath();
    ctx.arc(5.2, -21.6, 1.25, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(230,140,120,.35)';
    ctx.beginPath();
    ctx.arc(7.2, -19.6, 2.2, 0, TAU);
    ctx.fill();
  } else {
    const k = 5400;
    ink(ctx, 0.5, 1.25);
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.lineTo(11 + jitter(k, 0.5), 0.5);
    ctx.lineTo(13.5, 10.5);
    ctx.moveTo(0, -1);
    ctx.lineTo(9.5, -1.5);
    ctx.lineTo(11.5 + jitter(k + 1, 0.5), 9);
    ctx.stroke();
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
    ctx.moveTo(-4.4, -10.5);
    ctx.quadraticCurveTo(-9.5, -6, -9, -0.5);
    ctx.stroke();
    ink(ctx, 0.55, 1.25);
    inkArc(ctx, 1, -22, 9.2, k + 8);
    // Hair, hatched rather than filled, as everywhere else in graphite.
    ink(ctx, 0.34, 0.9);
    inkLines(
      ctx,
      [0, 1, 2, 3, 4].map((i) => [-6.6 + i * 3, -29.4, -4.6 + i * 3, -24.4] as const),
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
  ctx.scale(ELEPHANT_SCALE, ELEPHANT_SCALE);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // The shadow stays on the ground while the animal does not — see below.
  groundShadow(ctx, 0, 5, 30, 7, medium, true);
  /*
   * Off the ground.
   *
   * In the painting it floats: its feet are well above the strip of grass at
   * the bottom, and the whole thing hangs in the sky rather than standing in a
   * field. So it hovers here too, drifting very slowly, with its shadow left
   * behind on the grass to say that the gap is real and not a mistake.
   */
  ctx.translate(0, -(7 + Math.sin(clock * 0.45) * 2.6));

  if (medium === 'color') {
    // Hide, ears and trunk, all sampled from the painting.
    const hide = '#4e3f28';
    /*
     * Toenails first, so the feet are drawn over their tops.
     *
     * Sampled off the painting rather than guessed: the paint is a coral,
     * `srgb(236,96,82)`, which reads far pinker than the flat red I first put
     * here and rather redder than the pink I replaced it with.
     */
    ctx.fillStyle = '#ec6052';
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
    ctx.strokeStyle = '#1a1410';
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
    ctx.fillStyle = '#3d3120';
    ctx.beginPath();
    ctx.ellipse(-4, -2, 8, 9, -0.25, 0, TAU);
    ctx.fill();
    ctx.fillStyle = hide;
    ctx.beginPath();
    ctx.ellipse(7, -3, 8.5, 9.5, 0.2, 0, TAU);
    ctx.fill();
    ctx.restore();
    // Two green eyes, which is what the painting gives it.
    ctx.fillStyle = '#427441';
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
