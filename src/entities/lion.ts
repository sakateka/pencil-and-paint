import { TAU } from '../core/math';
import { ink, inkArc, jitter } from '../media/ink';
import { PAPER, PENCIL, type Medium } from '../media/medium';
import { groundShadow } from '../media/pencil';

/**
 * The lion, lying in the top corner of the map.
 *
 * The painting it comes from is a face and nothing else: a golden shield of a
 * head, wide-set pale eyes, a black nose, and a mane of red and green and
 * yellow strokes radiating out of it like a firework. So this is a lion lying
 * down and looking straight out at you, rather than a lion in profile going
 * about its business — the face is the whole picture and it should stay that
 * way.
 *
 * It does nothing. It is lying in the grass in the furthest corner of the
 * valley, and the entire reward for walking all the way up there is that it is
 * there at all.
 */

const GOLD = '#e8a83c';
const GOLD_DARK = '#cf8c26';
const MUZZLE = '#f2ece0';
const DARK = '#1d1712';

/** The seed every wobble in the graphite lion is drawn from. */
const K = 7300;

/** The mane, as it is painted: red, green, yellow, orange, over and over. */
const MANE = ['#d8412c', '#4f8f3a', '#f2c33e', '#d8412c', '#e8792a', '#4f8f3a'] as const;

/** How near you have to be before it bothers to lift its head. */
const NOTICES = 210;

export class Lion {
  /** Its own clock, which only runs while the colour has reached it. */
  clock = 0;

  /** Whether the colour has reached it. */
  awake = false;

  /**
   * Head up, 0 to 1.
   *
   * At 0 it is lying with its head down on its paws, eyes shut. At 1 it has
   * picked its head up and is looking at you. It only ever does the second
   * thing because you walked over, which is the entire content of its life.
   */
  alert = 0;

  constructor(
    readonly x: number,
    readonly y: number,
  ) {}

  update(dt: number, walkerX: number, walkerY: number, awake: boolean): void {
    this.awake = awake;
    // Asleep is asleep: out in the graphite the blink and the tail stop.
    if (awake) this.clock += dt;

    /*
     * The head goes down whether or not the colour is still on it.
     *
     * This used to return early when unlit, along with the clock — and that
     * left the lion frozen mid-stare with its head up for the rest of the
     * session, because walking away is exactly what takes the colour off it.
     * The pose is not animation; it is what the animal is doing, and what it is
     * doing when you leave is going back to sleep.
     *
     * Out of the colour it settles quickly, since nobody is there to watch it
     * happen and a pose still easing is a pose that will not hold still.
     */
    const near = awake && Math.hypot(walkerX - this.x, walkerY - this.y) < NOTICES;
    // Up quickly, down slowly — it wakes with a start and settles reluctantly.
    const rate = near ? 2.6 : awake ? 0.9 : 3;
    this.alert += ((near ? 1 : 0) - this.alert) * Math.min(1, rate * dt);
    if (this.alert < 0.004) this.alert = 0;
    if (this.alert > 0.996) this.alert = 1;
  }
}

/**
 * The lion in five pieces, because almost nothing it does is a drawing.
 *
 * It used to be one three-hundred-pixel canvas repainted whenever any of its
 * numbers moved, which was every frame you stood near it — twenty-three
 * megabytes a second for an animal whose entire performance is breathing and
 * the occasional blink. Taken apart, four of the five pieces turn out to be
 * transforms:
 *
 * - **the head lifting** is a translate. It does not change shape when it comes
 *   up off the paws; it travels, over and up onto its own body, so it can glide
 *   at sixty frames a second rather than step through a row of drawings;
 * - **the breath** is a vertical scale of everything but the shadow;
 * - **the tail** is a turn about its root, the same treatment the cow's already
 *   has;
 * - **the shadow** never changes at all.
 *
 * What is left to be pictures is the eyes, and a slow heavy blink genuinely is
 * a different drawing each time.
 */

/** Where the head sits, from chin-on-its-paws (0) to looking at you (1). */
export function lionHeadAt(alert: number): { x: number; y: number } {
  /*
   * Onto the body — over and to the right, so it lies with its chin on its own
   * back the way a cat does. Two earlier tries had it sink straight down and
   * roll onto its side, and a big round maned head tipped over in the grass
   * with nothing under it stops reading as a lion at all: it reads as a daisy
   * somebody has dropped. Resting it on the body is what makes it an animal
   * asleep rather than a flower, so it does not tilt, it moves.
   */
  const up = Math.max(0, Math.min(1, alert));
  return { x: -8 + (1 - up) * 6.5, y: -24 + (1 - up) * 11 };
}

/** Breathing you would miss if you were not waiting for it. */
export function lionBreath(clock: number): number {
  return 1 + Math.sin(clock * 0.85) * 0.016;
}

/** How far the tip of the tail has swung, in the lion's own units. */
export function lionSwish(clock: number): number {
  return Math.sin(clock * 0.55) * 5;
}

/** Where the tail hangs from. */
export const LION_TAIL = { x: 20, y: -9 } as const;

/**
 * The same swish, as a turn about the root.
 *
 * The tail used to be swung by sliding its far end sideways. Its tip sits nine
 * and a half units abeam of the root, so that slide is this angle — and an
 * angle is a transform, which stays smooth however few pictures there are.
 */
export function lionTailAngle(swish: number): number {
  return -swish / 9.5;
}

/**
 * How far shut the eyes are: 1 closed, 0 open.
 *
 * Two things close them. The blink is a brief pulse every fifteen seconds; the
 * head being down shuts them altogether, because a lion with its chin on its
 * own back is asleep.
 */
export function lionLid(clock: number, alert: number): number {
  const up = Math.max(0, Math.min(1, alert));
  return Math.max(1 - up * 1.6, Math.min(1, Math.max(0, Math.sin(clock * 0.42) - 0.972) * 50));
}

/** The patch of ground it lies on. It does not breathe with the animal. */
export function drawLionShadow(ctx: CanvasRenderingContext2D, medium: Medium): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  groundShadow(ctx, 0, 1, 26, 8, medium, true);
}

/** The tail, drawn from its own root at the origin so it can turn about it. */
export function drawLionTail(ctx: CanvasRenderingContext2D, medium: Medium): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (medium === 'color') {
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(8, 2, 5, 9.5);
    ctx.stroke();
    ctx.fillStyle = '#b8761c';
    ctx.beginPath();
    ctx.ellipse(5, 10.8, 2.3, 2.9, 0, 0, TAU);
    ctx.fill();
    return;
  }
  ink(ctx, 0.42, 1.1);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(8, 2, 5 + jitter(K, 0.5), 9.5);
  ctx.stroke();
}

/**
 * A very small body, on purpose, and drawn as one path.
 *
 * The painting is a face and nothing else, and the way to keep that when you
 * have to give it a body is to make the body far too small for the head — the
 * proportions of a cartoon rather than of a lion.
 *
 * One path for body and paws together, for the reason the elephant taught:
 * overlapping shapes composite against each other at anything but full opacity,
 * and the seams show.
 */
export function drawLionBody(ctx: CanvasRenderingContext2D, medium: Medium): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const shape = () => {
    ctx.beginPath();
    ctx.ellipse(9, -8, 12.5, 7, 0, 0, TAU);
    ctx.ellipse(2, -2.4, 5, 2.9, -0.1, 0, TAU);
    ctx.ellipse(10, -2, 5, 2.9, 0.05, 0, TAU);
  };

  if (medium === 'color') {
    ctx.fillStyle = GOLD_DARK;
    shape();
    ctx.fill();
    return;
  }

  ctx.globalAlpha = 0.88;
  ctx.fillStyle = PAPER;
  shape();
  ctx.fill();
  ctx.globalAlpha = 1;

  ink(ctx, 0.5, 1.2);
  ctx.beginPath();
  ctx.ellipse(9 + jitter(K + 1, 0.6), -8, 12.5, 7, 0, 0, TAU);
  ctx.stroke();
  ink(ctx, 0.42, 1);
  inkArc(ctx, 2, -2.4, 5, K + 4);
  inkArc(ctx, 10, -2, 5, K + 6);
}

/**
 * The mane, about the head's own origin so that it travels with the head.
 *
 * In colour it is the painting's own thrown strokes, and that reads as hair. In
 * graphite the same strokes came out as hard tapered points sticking out of the
 * skull — the word for it was nails — and no amount of softening the line fixed
 * that, because the shape itself was the problem. Rounded lobes laid round the
 * head read as a mane, or at worst as a daisy, which is a very much better
 * thing for a lion in a meadow to resemble.
 */
export function drawLionMane(ctx: CanvasRenderingContext2D, medium: Medium): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (medium === 'color') {
    ctx.lineWidth = 3.4;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + 0.14;
      ctx.strokeStyle = MANE[i % MANE.length];
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 13, Math.sin(a) * 12);
      ctx.lineTo(Math.cos(a) * 24, Math.sin(a) * 22);
      ctx.stroke();
    }
    return;
  }

  const petals = 13;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU + 0.2;
    ctx.save();
    ctx.rotate(a);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.ellipse(18, 0, 6.2, 4, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ink(ctx, 0.46, 1.15);
    ctx.beginPath();
    ctx.ellipse(18 + jitter(K + 20 + i, 0.4), jitter(K + 40 + i, 0.4), 6.2, 4, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/** The face, about the head's own origin. `lid` is 1 shut and 0 wide open. */
export function drawLionFace(
  ctx: CanvasRenderingContext2D,
  lid: number,
  medium: Medium,
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  /** A shield, wide across the brow and narrow at the chin. */
  const face = () => {
    ctx.beginPath();
    ctx.moveTo(0, 13.5);
    ctx.quadraticCurveTo(-13, 6, -13.5, -5);
    ctx.quadraticCurveTo(-13, -13, -5.5, -12);
    ctx.quadraticCurveTo(0, -10, 5.5, -12);
    ctx.quadraticCurveTo(13, -13, 13.5, -5);
    ctx.quadraticCurveTo(13, 6, 0, 13.5);
    ctx.closePath();
  };

  if (medium === 'color') {
    ctx.fillStyle = GOLD;
    face();
    ctx.fill();

    // Eyes, set wide and high, with a lot of white to them.
    for (const side of [-1, 1]) {
      ctx.fillStyle = MUZZLE;
      ctx.beginPath();
      ctx.ellipse(side * 6.4, -3.4, 4.2, 3.4, side * 0.2, 0, TAU);
      ctx.fill();
      if (lid > 0.05) {
        ctx.fillStyle = GOLD;
        ctx.beginPath();
        ctx.ellipse(side * 6.4, -5.4 + lid * 1.6, 3.9, 3.4 * lid, 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = DARK;
        ctx.beginPath();
        ctx.ellipse(side * 6.4, -3, 1.9, 2.1, 0, 0, TAU);
        ctx.fill();
      }
    }

    // Muzzle, and the nose sitting on top of it.
    ctx.fillStyle = MUZZLE;
    ctx.beginPath();
    ctx.ellipse(0, 6.4, 5.4, 4.4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = DARK;
    ctx.beginPath();
    ctx.moveTo(-2.8, 1.6);
    ctx.lineTo(2.8, 1.6);
    ctx.lineTo(0, 4.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 4.8);
    ctx.lineTo(0, 7.2);
    ctx.stroke();
    return;
  }

  /*
   * Knocked out of the paper first, then drawn firmly.
   *
   * Left as bare outlines over the grain it came out as a hollow ring-eyed
   * scribble — genuinely unpleasant, which is not what a lion asleep in a
   * meadow should be. Filling its shape with the paper colour and then inking
   * over that is what anybody drawing this would do, and it turns it back into
   * a drawing of an animal rather than a face scratched into the page.
   */
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = PAPER;
  face();
  ctx.fill();
  ctx.globalAlpha = 1;

  ink(ctx, 0.62, 1.35);
  face();
  ctx.stroke();

  /*
   * Eyes, open or shut, and in graphite they are nearly always shut.
   *
   * The pencil version ignored the lid altogether and drew a staring eye
   * whatever the animal was doing — so the lion lay there with its head down,
   * fast asleep, gazing at you. Out of the colour it is far away, and far away
   * means its head is down, so this is the pose it is almost always in.
   */
  if (lid > 0.5) {
    ink(ctx, 0.5, 1.15);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * 6.4 + jitter(K + 60 + side, 0.3), -4.8, 3.6, 0.3, Math.PI - 0.3);
      ctx.stroke();
    }
  } else {
    // Open: a light rim and a small solid pupil. Two rings and it stared.
    ink(ctx, 0.4, 0.95);
    for (const side of [-1, 1]) inkArc(ctx, side * 6.4, -3.4, 4, K + 60 + side);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = PENCIL;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * 6.4 + jitter(K + 64 + side, 0.3), -3, 1.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ink(ctx, 0.4, 0.95);
  inkArc(ctx, 0, 6.4, 5, K + 70);
  ink(ctx, 0.6, 1.2);
  ctx.beginPath();
  ctx.moveTo(-2.8, 1.6);
  ctx.lineTo(2.8, 1.6);
  ctx.lineTo(0, 4.8);
  ctx.closePath();
  ctx.stroke();
}
