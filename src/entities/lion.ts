import { TAU } from '../core/math';
import { ink, inkArc, inkLine, jitter } from '../media/ink';
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

/** The mane, as it is painted: red, green, yellow, orange, over and over. */
const MANE = ['#d8412c', '#4f8f3a', '#f2c33e', '#d8412c', '#e8792a', '#4f8f3a'] as const;

export class Lion {
  /** Its own clock, which only runs while the colour has reached it. */
  clock = 0;

  /** Whether the colour has reached it. */
  awake = false;

  constructor(
    readonly x: number,
    readonly y: number,
  ) {}

  update(dt: number, awake: boolean): void {
    this.awake = awake;
    // Asleep is asleep: out in the graphite it is a drawing of a lion.
    if (awake) this.clock += dt;
  }
}

export function drawLion(ctx: CanvasRenderingContext2D, lion: Lion, medium: Medium): void {
  const t = lion.clock;
  // Slow, heavy blinks, and breathing you would miss if you were not waiting.
  const lid = Math.min(1, Math.max(0, Math.sin(t * 0.42) - 0.972) * 50);
  const breath = 1 + Math.sin(t * 0.85) * 0.016;
  const tail = Math.sin(t * 0.55) * 5;

  ctx.save();
  ctx.translate(lion.x, lion.y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  groundShadow(ctx, 0, 1, 26, 8, medium, true);
  ctx.scale(1, breath);

  if (medium === 'color') {
    // The tail, laid round behind it.
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(25, -9);
    ctx.quadraticCurveTo(34, -7, 31 + tail, 0.5);
    ctx.stroke();
    ctx.fillStyle = '#b8761c';
    ctx.beginPath();
    ctx.ellipse(31 + tail, 1.8, 2.4, 3, 0, 0, TAU);
    ctx.fill();

    /*
     * A very small body, on purpose, and drawn as one path.
     *
     * The painting is a face and nothing else, and the way to keep that when
     * you have to give it a body is to make the body far too small for the
     * head — the proportions of a cartoon rather than of a lion.
     *
     * One path for body and paws together, for the reason the elephant taught:
     * overlapping shapes composite against each other at anything but full
     * opacity, and the seams show.
     */
    ctx.fillStyle = GOLD_DARK;
    ctx.beginPath();
    ctx.ellipse(14, -7, 14, 7.5, 0, 0, TAU);
    ctx.ellipse(6, -2, 5.2, 3, -0.1, 0, TAU);
    ctx.ellipse(15, -1.6, 5.2, 3, 0.05, 0, TAU);
    ctx.fill();

    // The mane: strokes thrown outward all the way round the head.
    ctx.lineWidth = 3.4;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + 0.14;
      ctx.strokeStyle = MANE[i % MANE.length];
      ctx.beginPath();
      ctx.moveTo(-8 + Math.cos(a) * 13, -24 + Math.sin(a) * 12);
      ctx.lineTo(-8 + Math.cos(a) * 24, -24 + Math.sin(a) * 22);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(-8, -24);

    // The face: a shield, wide across the brow and narrow at the chin.
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(0, 13.5);
    ctx.quadraticCurveTo(-13, 6, -13.5, -5);
    ctx.quadraticCurveTo(-13, -13, -5.5, -12);
    ctx.quadraticCurveTo(0, -10, 5.5, -12);
    ctx.quadraticCurveTo(13, -13, 13.5, -5);
    ctx.quadraticCurveTo(13, 6, 0, 13.5);
    ctx.closePath();
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
    ctx.restore();
    ctx.restore();
    return;
  }

  const k = 7300;

  /*
   * Knocked out of the paper first, then drawn firmly.
   *
   * Left as bare outlines over the grain it came out as a hollow ring-eyed
   * scribble — genuinely unpleasant, which is not what a lion asleep in a
   * meadow should be. Filling its shape with the paper colour and then inking
   * over that is what anybody drawing this would do, and it turns it back into
   * a drawing of an animal rather than a face scratched into the page.
   */
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

  /*
   * The mane, in strokes of two lengths.
   *
   * All the same length and evenly spaced, they read as the legs of a spider
   * rather than as hair. Alternating long and short, and thicker than a hair
   * line, gives it the raggedness the painting has.
   */
  ink(ctx, 0.5, 1.5);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + 0.14;
    const out = i % 2 ? 24 : 20;
    inkLine(
      ctx,
      -8 + Math.cos(a) * 12,
      -24 + Math.sin(a) * 11,
      -8 + Math.cos(a) * out,
      -24 + Math.sin(a) * (out - 2),
      k + 20 + i,
    );
  }

  ctx.globalAlpha = 0.88;
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.ellipse(14, -7, 14, 7.5, 0, 0, TAU);
  ctx.ellipse(6, -2, 5.2, 3, -0.1, 0, TAU);
  ctx.ellipse(15, -1.6, 5.2, 3, 0.05, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(-8, -24);
  face();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;

  ink(ctx, 0.42, 1.1);
  ctx.beginPath();
  ctx.moveTo(25, -9);
  ctx.quadraticCurveTo(34, -7, 31 + tail + jitter(k, 0.5), 0.5);
  ctx.stroke();
  ink(ctx, 0.5, 1.2);
  ctx.beginPath();
  ctx.ellipse(14 + jitter(k + 1, 0.6), -7, 14, 7.5, 0, 0, TAU);
  ctx.stroke();
  ink(ctx, 0.42, 1);
  inkArc(ctx, 6, -2, 5.2, k + 4);
  inkArc(ctx, 15, -1.6, 5.2, k + 6);

  ctx.save();
  ctx.translate(-8, -24);
  ink(ctx, 0.62, 1.35);
  face();
  ctx.stroke();
  // Eyes: a light rim and a small solid pupil. Drawn as two rings they stared.
  ink(ctx, 0.4, 0.95);
  for (const side of [-1, 1]) inkArc(ctx, side * 6.4, -3.4, 4, k + 60 + side);
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = PENCIL;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * 6.4 + jitter(k + 64 + side, 0.3), -3, 1.5, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ink(ctx, 0.4, 0.95);
  inkArc(ctx, 0, 6.4, 5, k + 70);
  ink(ctx, 0.6, 1.2);
  ctx.beginPath();
  ctx.moveTo(-2.8, 1.6);
  ctx.lineTo(2.8, 1.6);
  ctx.lineTo(0, 4.8);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}
