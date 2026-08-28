import { clamp, TAU } from '../core/math';
import { ink, inkArc, inkLine, inkLines, jitter } from '../media/ink';
import type { Medium } from '../media/medium';
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
  const swish = Math.sin(clock * 0.7) * 2.4;

  ctx.save();
  /*
   * Fading in where it stands, rather than walking out of the trees.
   *
   * It was going to come in from the north, and that was worse: a thing that
   * walks up to you is an event, and this should feel like something that was
   * there all along and which you only now happen to be still enough to see.
   */
  /*
   * Never quite solid.
   *
   * It hangs in the sky over the top of the world, and a thing in the sky that
   * is as opaque as the grass reads as a cut-out pasted onto it. A fifth of the
   * blue coming through is enough to say that it is not altogether there.
   *
   * This is only bearable because the whole animal is one path filled once —
   * see below. Drawn as separate shapes, every leg and ear would composite
   * against the body and show its seams the whole time rather than only while
   * it arrived.
   */
  ctx.globalAlpha = here * 0.8;
  ctx.translate(v.elephantX, v.elephantY);
  ctx.scale(ELEPHANT_SCALE, ELEPHANT_SCALE);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  /*
   * Off the ground, and with nothing under it.
   *
   * It used to cast a shadow on the grass to say the gap was real. Now that it
   * stands in the sky above the top edge of the world there is no grass beneath
   * it to cast one on, and the shadow was just a dark smudge hanging in mid-air.
   */
  ctx.translate(0, -(8 + Math.sin(clock * 0.62) * 4.6));

  /*
   * The shape, measured off the painting rather than remembered.
   *
   * What makes it that elephant and not a generic one: the body is a deep slab
   * with a domed back, not an oval; the head and the trunk are a single tall
   * mass hanging off the front of it, and the trunk is nearly as wide as the
   * head; and the tail comes off the rump, outside the body, ending in a frayed
   * brush. The first version had a tail — it was simply drawn inside the body
   * outline, so nobody ever saw it.
   */
  const body = () => {
    ctx.moveTo(-27, -15);
    ctx.quadraticCurveTo(-29, -33, -16, -37);
    ctx.quadraticCurveTo(2, -41, 18, -37);
    ctx.quadraticCurveTo(27, -33, 26, -15);
    ctx.quadraticCurveTo(0, -11, -27, -15);
    ctx.closePath();
  };

  /*
   * Head and trunk, filled as two paths rather than two subpaths of one.
   *
   * As one path they punched a hole in each other: canvas fills by the non-zero
   * winding rule, and the two loops happened to run in opposite directions, so
   * where the trunk met the head the overlap was cut straight out and the face
   * had a gap in it.
   */
  const head = () => {
    ctx.moveTo(-22, -24);
    ctx.quadraticCurveTo(-40, -26, -38, -38);
    ctx.quadraticCurveTo(-36, -47, -27, -46);
    ctx.quadraticCurveTo(-20, -45, -20, -34);
    ctx.closePath();
  };

  /**
   * Wide at the top, barely tapering, hanging almost to the ground.
   *
   * Wound the same way round as everything else, deliberately. All of these go
   * into one path and are filled in one go — see `hide` below — and the
   * non-zero rule cuts a hole wherever two overlapping loops disagree about
   * their direction. This one used to run the other way, which is what put a
   * hole through the face.
   */
  const trunk = () => {
    ctx.moveTo(-26, -33);
    ctx.quadraticCurveTo(-27.5, -19, -28, -3.4);
    ctx.quadraticCurveTo(-31.5, -0.8, -35, -3);
    ctx.quadraticCurveTo(-38, -18, -37, -34);
    ctx.closePath();
  };

  /*
   * Four legs, and the back pair stop short of the front pair's feet.
   *
   * Straight off the painting, where the hind feet sit a good way higher up the
   * page than the fore feet. It is not perspective and it is not a mistake —
   * it is what makes the animal look as though it is barely touching the
   * ground, which is the whole character of the drawing.
   *
   * Set well apart, too, with daylight between each pair. Butted together they
   * read as two slabs rather than four legs, and in the painting you can see
   * the sky between them.
   *
   * Each entry is the leg's centre, its width, and how far down its foot goes.
   */
  const legs = [
    [-21, 8, -1.5],
    [-11, 7.5, -2.4],
    [13, 7.5, -7],
    [23, 8, -6.2],
  ] as const;

  /** Off the rump, down and out, ending in a splayed brush. */
  const tail = (wide: number) => {
    ctx.lineWidth = wide;
    ctx.beginPath();
    ctx.moveTo(25, -32);
    ctx.quadraticCurveTo(31, -26, 30.5 + swish, -16);
    ctx.stroke();
    ctx.lineWidth = wide * 0.7;
    for (const a of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(30.5 + swish, -16);
      ctx.lineTo(30.5 + swish + Math.sin(a) * 4, -16 + Math.cos(a) * 6);
      ctx.stroke();
    }
  };

  if (medium === 'color') {
    /*
     * Elephant grey with a dirty blue in it.
     *
     * Not what the paint measures. Inside the outline it is `#40392C` — a
     * desaturated dark grey-olive, only twenty points between the channels —
     * and rendered at exactly that value it still read as a brown animal,
     * because the painting only makes it look cool by setting it against a blue
     * sky and this sets it on green grass. So it is pulled to where the eye
     * expects an elephant to be: a dirty grey. Barely any blue in the end —
     * a properly blue-grey came out looking like slate roofing, and what reads
     * as elephant is a muddy near-neutral with the faintest cool cast.
     */
    const hideColour = '#4e4e48';

    /*
     * Toenails under the feet, so the legs cover their tops.
     *
     * Sampled off the painting: the paint is a coral, `srgb(236,96,82)`, which
     * reads far pinker than the flat red I first put here and rather redder
     * than the pink I replaced it with.
     */
    ctx.fillStyle = '#ec6052';
    for (const [fx, w, foot] of legs) {
      for (const n of [-1, 0, 1]) {
        ctx.beginPath();
        // Big and round. Small ones read as a serrated red fringe along the
        // bottom of each leg rather than as toes.
        ctx.ellipse(fx + n * (w / 2.7), foot + 0.1, w / 5.2, 3.1, 0, 0, TAU);
        ctx.fill();
      }
    }

    /*
     * The whole animal as one path, filled once.
     *
     * This is the difference between it fading in and it *materialising*. Drawn
     * as separate shapes it looked fine at full opacity and horrible at every
     * value in between: each leg, the head, the trunk and both ears composited
     * against the body separately, so half way through the arrival you could
     * see straight through the body to the outline of everything inside it. One
     * path means one fill, and one fill means every pixel is painted exactly
     * once whatever the opacity happens to be.
     */
    ctx.beginPath();
    for (const [fx, w, foot] of legs) ctx.rect(fx - w / 2, -18, w, 18 + foot);
    // The far ear, behind everything.
    ctx.ellipse(-33, -43, 7.4, 8.4, -0.2, 0, TAU);
    body();
    head();
    trunk();
    // The near ear, leaning as it listens. Rotated in the path rather than by
    // the canvas, so that it can join the rest of it.
    ctx.ellipse(-25.5, -44, 8.2, 8.8, 0.18 + ear, 0, TAU);
    ctx.fillStyle = hideColour;
    ctx.fill();

    // A line between the ears, since they are now the same one shape.
    ctx.strokeStyle = '#3d3d38';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(-25.5, -44, 8.2, 8.8, 0.18 + ear, Math.PI * 0.72, Math.PI * 1.5);
    ctx.stroke();

    ctx.strokeStyle = hideColour;
    ctx.lineCap = 'round';
    tail(2.6);

    // The stripes down the trunk.
    ctx.fillStyle = '#23231e';
    for (const i of [0, 1, 2, 3, 4, 5]) {
      ctx.beginPath();
      ctx.ellipse(-32.8 + i * 0.6, -27 + i * 4.6, 2.5, 1.6, 0.1, 0, TAU);
      ctx.fill();
    }

    // Two green eyes, which is what the painting gives it.
    ctx.fillStyle = '#4e7a49';
    for (const ex of [-33.5, -26.5]) {
      ctx.beginPath();
      ctx.ellipse(ex, -36.5, 2.1, 1.6, 0.15, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
    return;
  }

  const k = 6100;
  ink(ctx, 0.5, 1.3);
  ctx.beginPath();
  body();
  ctx.stroke();
  ink(ctx, 0.5, 1.2);
  ctx.beginPath();
  head();
  ctx.stroke();
  ctx.beginPath();
  trunk();
  ctx.stroke();
  for (const [fx, w, foot] of legs) {
    inkLines(
      ctx,
      [
        [fx - w / 2, -16, fx - w / 2, foot],
        [fx + w / 2, -16, fx + w / 2, foot],
        [fx - w / 2, foot, fx + w / 2, foot],
      ],
      k + 10 + fx,
    );
  }
  ink(ctx, 0.45, 1.1);
  inkArc(ctx, -33, -43, 7.6, k + 30);
  inkArc(ctx, -25.5, -44, 8.4, k + 32);
  ink(ctx, 0.55, 1.2);
  tail(1.2);
  ink(ctx, 0.6, 1.6);
  for (const i of [0, 1, 2, 3, 4, 5]) {
    inkLine(ctx, -34.2 + i * 0.6, -27 + i * 4.6, -31.4 + i * 0.6, -26.6 + i * 4.6, k + 40 + i);
  }
  ink(ctx, 0.65, 1.5);
  for (const ex of [-33.5, -26.5]) inkArc(ctx, ex, -36.5, 1.7, k + 60 + ex);
  ctx.restore();
}
