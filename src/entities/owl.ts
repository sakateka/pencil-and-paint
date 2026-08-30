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

/** One quick double beat, back at rest before the hoot has died away. */
const FLAP_SECONDS = 0.8;

export class Owl {
  /** Its own clock, which only runs while the colour has reached it. */
  clock = 0;

  /** Whether the colour has reached it. */
  awake = false;

  /** Which way the face is turned: -1 hard left, +1 hard right. */
  look = 1;

  /** Seconds left in the wing beat started by touching it. */
  flap = 0;

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
    if (!awake) {
      this.flap = 0;
      return;
    }
    this.clock += dt;
    this.flap = Math.max(0, this.flap - dt);

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

  hoot(): boolean {
    if (!this.awake) return false;
    this.flap = FLAP_SECONDS;
    return true;
  }
}

export function drawOwl(ctx: CanvasRenderingContext2D, owl: Owl, medium: Medium): void {
  const t = owl.clock;
  // Rare, slow blinks, and the two eyes together.
  const lid = Math.min(1, Math.max(0, Math.sin(t * 0.55) - 0.975) * 55);
  // Barely breathing. Any more and it looks like it is panting.
  const breath = 1 + Math.sin(t * 1.1) * 0.022;
  const look = Math.max(-1, Math.min(1, owl.look));
  const flapAge = 1 - owl.flap / FLAP_SECONDS;
  const wingBeat = owl.flap > 0 ? Math.sin(flapAge * Math.PI) : 0;
  // How far the face swings across the head.
  const fx = look * 1.9;

  ctx.save();
  ctx.translate(owl.x, owl.y);
  ctx.scale(owl.scale, owl.scale * breath);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  /*
   * Traced off the painting, after getting it wrong twice.
   *
   * Two things about it are not what an owl usually has, and both are the
   * whole character of the drawing:
   *
   *  - the ears are small pointed corners **of the body outline itself**, more
   *    like a cat's than an owl's tufts. Drawn as separate sweeping horns they
   *    read as antennae stuck on a cartoon;
   *  - the wings are **separate** heavy strokes outside the body, running down
   *    each side to the branch, so it looks as though it is propping itself up
   *    on them. They are not part of the outline and not joined to the ears.
   */
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-10.4, -6.6);
    ctx.quadraticCurveTo(-11.6, -19, -8, -26.4);
    ctx.lineTo(-9.4, -33.4);
    ctx.lineTo(-4, -28.6);
    ctx.quadraticCurveTo(0, -30.6, 4, -28.6);
    ctx.lineTo(9.4, -33.4);
    ctx.lineTo(8, -26.4);
    ctx.quadraticCurveTo(11.6, -19, 10.4, -6.6);
    // Sitting on the branch, the feathers of the underside breaking over it.
    ctx.quadraticCurveTo(8.6, -2.4, 4.4, -4.4);
    ctx.quadraticCurveTo(2, -1.2, 0, -3.6);
    ctx.quadraticCurveTo(-2, -1.2, -4.4, -4.4);
    ctx.quadraticCurveTo(-8.6, -2.4, -10.4, -6.6);
    ctx.closePath();
  };

  const wings = (wide: number) => {
    ctx.lineWidth = wide;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      // Starts underneath the body so lifting it can never open a white seam.
      ctx.moveTo(side * 7.4, -23.4);
      ctx.quadraticCurveTo(
        side * (14.4 + wingBeat * 3),
        -15.4 - wingBeat * 4,
        side * (9.6 + wingBeat * 2.5),
        -5 - wingBeat * 3,
      );
      ctx.stroke();
    }
  };

  /** Three short lashes over the outer top of each eye, as painted. */
  const lashes = (at: number) => {
    for (const side of [-1, 1]) {
      const ex = at + side * 4.1;
      for (const i of [0, 1, 2]) {
        const a = (side > 0 ? -1.15 : -1.99) + side * i * 0.28;
        ctx.beginPath();
        ctx.moveTo(ex + Math.cos(a) * 4, -21.6 + Math.sin(a) * 4);
        ctx.lineTo(ex + Math.cos(a) * 5.8, -21.6 + Math.sin(a) * 5.8);
        ctx.stroke();
      }
    }
  };

  if (medium === 'color') {
    // The branch: orange, and unapologetically so.
    ctx.strokeStyle = '#2f2a26';
    ctx.lineWidth = 6.4;
    ctx.beginPath();
    ctx.moveTo(-17, -1.2);
    ctx.lineTo(15.5, -2.4);
    ctx.stroke();
    ctx.strokeStyle = '#e8792a';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(-16.3, -1.2);
    ctx.lineTo(14.8, -2.4);
    ctx.stroke();
    // A second branch dropping away below it, as in the painting.
    ctx.strokeStyle = '#2f2a26';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, 0.6);
    ctx.quadraticCurveTo(-14.5, 5, -20, 6.4);
    ctx.stroke();

    // Wings first, so the body sits in front of them.
    ctx.strokeStyle = '#2f2a26';
    wings(2.6);

    ctx.fillStyle = '#e9dcc2';
    body();
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // The brow, one line arching over both eyes.
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx - 8.4, -23);
    ctx.quadraticCurveTo(fx, -29.6, fx + 8.4, -23);
    ctx.stroke();

    // Eyes: big, close together, thin rimmed, with a lot of pupil.
    for (const side of [-1, 1]) {
      const ex = fx + side * 4.1;
      ctx.fillStyle = '#f4ecd9';
      ctx.beginPath();
      ctx.arc(ex, -21.6, 4, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
      if (lid > 0.05) {
        ctx.fillStyle = '#e0d3b8';
        ctx.beginPath();
        ctx.ellipse(ex, -24.4 + lid * 2.2, 3.7, 3.7 * lid, 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = '#262019';
        ctx.beginPath();
        ctx.arc(ex - side * 0.5, -21.4, 2.5, 0, TAU);
        ctx.fill();
      }
    }

    ctx.strokeStyle = '#2f2a26';
    ctx.lineWidth = 0.7;
    lashes(fx);

    // Beak: a small triangle tucked between the eyes.
    ctx.fillStyle = '#e8a53a';
    ctx.beginPath();
    ctx.moveTo(fx - 2.1, -19.2);
    ctx.lineTo(fx + 2.1, -19.2);
    ctx.lineTo(fx, -14.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx - 0.75, -18.4);
    ctx.lineTo(fx - 0.75, -17);
    ctx.moveTo(fx + 0.75, -18.4);
    ctx.lineTo(fx + 0.75, -17);
    ctx.stroke();

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
  body();
  ctx.fill();
  ctx.globalAlpha = 1;

  ink(ctx, 0.5, 1.3);
  ctx.beginPath();
  ctx.moveTo(-17 + jitter(k, 0.7), -1.2);
  ctx.lineTo(15.5 + jitter(k + 1, 0.7), -2.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-9, 0.6);
  ctx.quadraticCurveTo(-14.5, 5, -20 + jitter(k + 2, 0.7), 6.4);
  ctx.stroke();

  ink(ctx, 0.6, 1.5);
  wings(1.5);
  // Firmly, and over the paper. It is a small shape sitting on a dense one, and
  // a polite line vanishes into the leaves however much paper is behind it.
  ink(ctx, 0.72, 1.35);
  body();
  ctx.stroke();

  ink(ctx, 0.42, 0.85);
  ctx.beginPath();
  ctx.moveTo(fx - 8.4, -23);
  ctx.quadraticCurveTo(fx, -29.6, fx + 8.4, -23);
  ctx.stroke();
  ink(ctx, 0.7, 1.1);
  for (const side of [-1, 1]) inkArc(ctx, fx + side * 4.1, -21.6, 3.9, k + 10 + side);
  ink(ctx, 0.85, 2.4);
  for (const side of [-1, 1]) inkArc(ctx, fx + side * 4.1 - side * 0.5, -21.4, 2.1, k + 20 + side);
  ink(ctx, 0.4, 0.7);
  lashes(fx);
  ink(ctx, 0.6, 1);
  ctx.beginPath();
  ctx.moveTo(fx - 2.1, -19.2);
  ctx.lineTo(fx, -14.8);
  ctx.lineTo(fx + 2.1, -19.2);
  ctx.stroke();
  ctx.restore();
}
