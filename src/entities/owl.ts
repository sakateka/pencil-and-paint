import { TAU } from '../core/math';
import { ink, inkArc, jitter } from '../media/ink';
import { PAPER, type Medium } from '../media/medium';

/**
 * The owl, up a tree in the wood.
 *
 * From one of the paintings: a cream bird with a dark edge to it, two enormous
 * round eyes, ear tufts and a yellow beak, sitting on a branch.
 *
 * It does one thing, and the whole point of it is that one thing — it watches
 * you. Come near and its head comes round to follow you, and holds. Everything
 * else in this valley either ignores the walker or runs from them; this is the
 * only thing that looks back.
 */

/** How near you have to be before it takes an interest. */
const NOTICES = 230;

export class Owl {
  /** Its own clock, which only runs while the colour has reached it. */
  clock = 0;

  /** Whether the colour has reached it. */
  awake = false;

  /** Which way the face is turned: -1 hard left, +1 hard right. */
  look = 1;

  constructor(
    readonly x: number,
    readonly y: number,
    readonly scale: number,
  ) {}

  update(dt: number, walkerX: number, walkerY: number, awake: boolean): void {
    this.awake = awake;
    /*
     * Asleep means asleep, as for every animal: no clock, no blink, no turn.
     * Out in the graphite it is a drawing of an owl and drawings hold still.
     */
    if (!awake) return;
    this.clock += dt;

    const noticed = Math.hypot(walkerX - this.x, walkerY - this.y) < NOTICES;
    // Watching you, or — left to itself — looking idly about every few seconds.
    const wanted = noticed
      ? Math.sign(walkerX - this.x) || this.look
      : Math.sin(this.clock * 0.23) > 0
        ? 1
        : -1;
    // Owls turn their heads in one deliberate movement rather than swivelling
    // to follow, so this is quick to arrive and then perfectly still.
    this.look += (wanted - this.look) * Math.min(1, dt * 4.5);
  }
}

export function drawOwl(ctx: CanvasRenderingContext2D, owl: Owl, medium: Medium): void {
  const t = owl.clock;
  // Rare, slow blinks, and the two eyes together.
  const lid = Math.min(1, Math.max(0, Math.sin(t * 0.55) - 0.975) * 55);
  // Barely breathing. Any more and it looks like it is panting.
  const breath = 1 + Math.sin(t * 1.1) * 0.022;
  const look = Math.max(-1, Math.min(1, owl.look));

  ctx.save();
  ctx.translate(owl.x, owl.y);
  ctx.scale(owl.scale, owl.scale * breath);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (medium === 'color') {
    // The branch it is sitting on, coming out of the tree behind it.
    ctx.strokeStyle = '#6b4a32';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-16, 3.4);
    ctx.quadraticCurveTo(-4, 2.2, 11, 1.2);
    ctx.stroke();

    // Feet, gripping it.
    ctx.strokeStyle = '#d8a13c';
    ctx.lineWidth = 1.6;
    for (const fx of [-2.6, 2.6]) {
      ctx.beginPath();
      ctx.moveTo(fx, -3.4);
      ctx.lineTo(fx, 1.4);
      ctx.stroke();
    }

    // Body: one rounded shape, wider at the bottom, the way an owl sits.
    ctx.fillStyle = '#efe3cb';
    ctx.strokeStyle = '#4a3524';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-7.4, -4);
    ctx.quadraticCurveTo(-9.2, -14, -6.4, -18.5);
    ctx.quadraticCurveTo(0, -23.5, 6.4, -18.5);
    ctx.quadraticCurveTo(9.2, -14, 7.4, -4);
    ctx.quadraticCurveTo(0, -0.6, -7.4, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // A wing folded down the side it is facing away from.
    ctx.strokeStyle = 'rgba(74,53,36,.5)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-look * 5.2, -15.5);
    ctx.quadraticCurveTo(-look * 7.4, -10, -look * 4.6, -5);
    ctx.stroke();

    // Ear tufts. They lean with the head, which is most of what sells the turn.
    ctx.strokeStyle = '#4a3524';
    ctx.lineWidth = 1.4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 4.6 + look * 0.8, -18.4);
      ctx.lineTo(side * 6.6 + look * 2.2, -23.2);
      ctx.stroke();
    }

    /*
     * The face: two huge discs and a beak between them, shifted bodily across
     * the head by `look`. An owl's face is a flat plate, so turning it is a
     * matter of the whole plate swinging rather than the eyes sliding about
     * inside it — which is why the tufts and the wing move with it.
     */
    const fx = look * 1.9;
    for (const side of [-1, 1]) {
      const ex = fx + side * 3.5;
      ctx.fillStyle = '#f7f0df';
      ctx.strokeStyle = '#4a3524';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(ex, -16.2, 3.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
      if (lid > 0.05) {
        // Lids come down from the top, as an owl's do.
        ctx.fillStyle = '#e3d4b8';
        ctx.beginPath();
        ctx.ellipse(ex, -18 + lid * 1.6, 3.1, 3.1 * lid, 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = '#2b2118';
        ctx.beginPath();
        ctx.arc(ex, -16.2, 1.8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.beginPath();
        ctx.arc(ex + 0.7, -17, 0.6, 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#e8b23c';
    ctx.beginPath();
    ctx.moveTo(fx - 1.4, -14.6);
    ctx.lineTo(fx + 1.4, -14.6);
    ctx.lineTo(fx, -11.4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    return;
  }

  const k = 4100;
  /*
   * Knocked out of the paper first.
   *
   * A tree in graphite is dense diagonal hatching, and an owl drawn as outlines
   * on top of it simply disappeared into the leaves. Filling its shape with the
   * paper colour before inking it is what somebody drawing this would do —
   * leave the bird unhatched — and it is the only thing that makes it read.
   */
  ctx.fillStyle = PAPER;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(-7.4, -3.4);
  ctx.quadraticCurveTo(-9.2, -14, -6.4, -18.5);
  ctx.quadraticCurveTo(0, -23.5, 6.4, -18.5);
  ctx.quadraticCurveTo(9.2, -14, 7.4, -3.4);
  ctx.quadraticCurveTo(0, 0, -7.4, -3.4);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ink(ctx, 0.55, 1.3);
  ctx.beginPath();
  ctx.moveTo(-16 + jitter(k, 0.6), 3.4);
  ctx.quadraticCurveTo(-4, 2.2, 11 + jitter(k + 1, 0.6), 1.2);
  ctx.stroke();
  // Firmly, and twice over. It is a small shape sitting on a dense one, and a
  // polite line vanishes into the leaves however much paper is behind it.
  ink(ctx, 0.72, 1.35);
  ctx.beginPath();
  ctx.moveTo(-7.4 + jitter(k + 2, 0.5), -4);
  ctx.quadraticCurveTo(-9.2, -14, -6.4, -18.5);
  ctx.quadraticCurveTo(0, -23.5, 6.4, -18.5);
  ctx.quadraticCurveTo(9.2, -14, 7.4 + jitter(k + 3, 0.5), -4);
  ctx.quadraticCurveTo(0, -0.6, -7.4, -4);
  ctx.stroke();
  ink(ctx, 0.65, 1.15);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 4.6 + look * 0.8, -18.4);
    ctx.lineTo(side * 6.6 + look * 2.2, -23.2);
    ctx.stroke();
  }
  const fxs = look * 1.9;
  ink(ctx, 0.7, 1.15);
  for (const side of [-1, 1]) inkArc(ctx, fxs + side * 3.5, -16.2, 3.4, k + 10 + side);
  ink(ctx, 0.85, 1.9);
  for (const side of [-1, 1]) inkArc(ctx, fxs + side * 3.5, -16.2, 1.3, k + 20 + side);
  ink(ctx, 0.65, 1.1);
  ctx.beginPath();
  ctx.moveTo(fxs - 1.4, -14.6);
  ctx.lineTo(fxs, -11.4);
  ctx.lineTo(fxs + 1.4, -14.6);
  ctx.stroke();
  ctx.restore();
}
