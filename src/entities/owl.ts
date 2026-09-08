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
 *
 * Once the valley is whole it will also speak, which is the same character
 * again rather than a second one: not a greeting and not an answer, just a
 * call every so often over the head of whoever has stayed to listen.
 */

/** How near you have to be before it takes an interest. */
const NOTICES = 230;

/** One quick double beat, back at rest before the hoot has died away. */
const FLAP_SECONDS = 0.8;

/**
 * The shortest and longest it will hold its tongue with somebody standing there.
 *
 * Varied, and widely, because a call on a fixed timer is a car alarm: the ear
 * finds the period after two of them and everything after that is a machine.
 * Long enough at the bottom end that the recording — near three seconds of it —
 * has been quiet a good while before the next one starts.
 */
const CALL_GAP = { least: 8, most: 16 };

export class Owl {
  /** Its own clock, which only runs while the colour has reached it. */
  clock = 0;

  /** Whether the colour has reached it. */
  awake = false;

  /** Which way the face is turned: -1 hard left, +1 hard right. */
  look = 1;

  /** Seconds left in the wing beat started by touching it. */
  flap = 0;

  /**
   * Seconds until it calls, or nothing while there is nobody to call to.
   *
   * Reset to nothing the moment the walker leaves, so the wait always starts
   * over: whatever was left of it is not banked against your coming back.
   */
  voice = 0;

  constructor(
    readonly x: number,
    readonly y: number,
    readonly scale: number,
  ) {}

  /**
   * A frame of owl, and whether it has just called.
   *
   * `answering` is the game's question, not the bird's: somebody is standing
   * near enough to be called to, and the valley is finished. The owl knows
   * about waiting and about wing beats; how far is near and what a finished
   * valley is are rules of the place, and they live there.
   */
  update(
    dt: number,
    walkerX: number,
    walkerY: number,
    awake: boolean,
    answering = false,
  ): boolean {
    this.awake = awake;
    /*
     * Asleep means asleep, as for every animal: no clock, no blink, no turn.
     * Out in the graphite it is a drawing of an owl and drawings hold still.
     */
    if (!awake) {
      this.flap = 0;
      this.voice = 0;
      return false;
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

    return this.waited(dt, answering);
  }

  hoot(): boolean {
    if (!this.awake) return false;
    this.flap = FLAP_SECONDS;
    return true;
  }

  /**
   * The wait between calls, and the end of one.
   *
   * Arriving is deliberately not what sets it off. A bird that hoots the
   * instant you are in range is answering the walker, and this one is not
   * answering anybody — it is an owl in a tree that says something every so
   * often, and you happen to be there for it. So the first thing company does
   * is start a wait; only standing through the wait gets you a call.
   */
  private waited(dt: number, answering: boolean): boolean {
    if (!answering) {
      this.voice = 0;
      return false;
    }
    if (this.voice === 0) {
      this.voice = gap();
      return false;
    }
    this.voice -= dt;
    if (this.voice > 0) return false;
    this.voice = gap();
    this.flap = FLAP_SECONDS;
    return true;
  }
}

/** How long until the next one. Never the same twice running. */
function gap(): number {
  return CALL_GAP.least + Math.random() * (CALL_GAP.most - CALL_GAP.least);
}

/** Rare, slow blinks, and the two eyes together. */
export function owlLid(owl: Owl): number {
  return Math.min(1, Math.max(0, Math.sin(owl.clock * 0.55) - 0.975) * 55);
}

/** Barely breathing. Any more and it looks like it is panting. */
export function owlBreath(owl: Owl): number {
  return 1 + Math.sin(owl.clock * 1.1) * 0.022;
}

/**
 * How far the face has swung across the head, in owl units.
 *
 * The head does not change shape as it comes round — the whole face slides
 * across it — so this is where it is, not which drawing of it to use.
 */
export function owlFaceX(owl: Owl): number {
  return Math.max(-1, Math.min(1, owl.look)) * 1.9;
}

/** How far through its wing beat it is, or nothing if it is not beating. */
export function owlFlapAge(owl: Owl): number | undefined {
  return owl.flap > 0 ? 1 - owl.flap / FLAP_SECONDS : undefined;
}

/**
 * The branch it sits on — and, in graphite, the paper it is cut out of.
 *
 * A tree in graphite is dense diagonal hatching, and an owl drawn as outlines
 * on top of it simply disappeared into the leaves. Filling its shape with the
 * paper colour before inking it is what somebody drawing this would do — leave
 * the bird unhatched — and it is the only thing that makes it read. It belongs
 * here rather than with the body because the branch is drawn over it and the
 * bird's own outline over that.
 */
export function drawOwlBranch(ctx: CanvasRenderingContext2D, medium: Medium): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

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
    ctx.restore();
    return;
  }

  ctx.fillStyle = PAPER;
  ctx.globalAlpha = 0.85;
  owlBodyPath(ctx);
  ctx.fill();
  ctx.globalAlpha = 1;

  ink(ctx, 0.5, 1.3);
  ctx.beginPath();
  ctx.moveTo(-17 + jitter(OWL_K, 0.7), -1.2);
  ctx.lineTo(15.5 + jitter(OWL_K + 1, 0.7), -2.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-9, 0.6);
  ctx.quadraticCurveTo(-14.5, 5, -20 + jitter(OWL_K + 2, 0.7), 6.4);
  ctx.stroke();
  ctx.restore();
}

/** The wings, both of them, at one point in a beat. */
export function drawOwlWings(ctx: CanvasRenderingContext2D, beat: number, medium: Medium): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (medium === 'color') {
    ctx.strokeStyle = '#2f2a26';
    owlWingPaths(ctx, 2.6, beat);
  } else {
    ink(ctx, 0.6, 1.5);
    owlWingPaths(ctx, 1.5, beat);
  }
  ctx.restore();
}

/** The bird itself, without its face. It never changes. */
export function drawOwlBody(ctx: CanvasRenderingContext2D, medium: Medium): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (medium === 'color') {
    ctx.strokeStyle = '#2f2a26';
    ctx.fillStyle = '#e9dcc2';
    owlBodyPath(ctx);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    // Firmly, and over the paper. It is a small shape sitting on a dense one,
    // and a polite line vanishes into the leaves however much paper is behind
    // it.
    ink(ctx, 0.72, 1.35);
    owlBodyPath(ctx);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The face: brow, eyes, lashes and beak, drawn about the middle of the head.
 *
 * Its own drawing because it is its own moving part — `owlFaceX` slides the
 * whole of it across the head — and because the eyes are the only thing on this
 * bird that is ever a different drawing. Graphite has no lid at all: out there
 * it is a sleeping owl on paper, drawn with its eyes open, and it holds still.
 */
export function drawOwlFace(ctx: CanvasRenderingContext2D, lid: number, medium: Medium): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (medium === 'color') {
    // The brow, one line arching over both eyes.
    ctx.strokeStyle = '#2f2a26';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8.4, -23);
    ctx.quadraticCurveTo(0, -29.6, 8.4, -23);
    ctx.stroke();

    // Eyes: big, close together, thin rimmed, with a lot of pupil.
    for (const side of [-1, 1]) {
      const ex = side * 4.1;
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
    owlLashes(ctx);

    // Beak: a small triangle tucked between the eyes.
    ctx.fillStyle = '#e8a53a';
    ctx.beginPath();
    ctx.moveTo(-2.1, -19.2);
    ctx.lineTo(2.1, -19.2);
    ctx.lineTo(0, -14.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.75, -18.4);
    ctx.lineTo(-0.75, -17);
    ctx.moveTo(0.75, -18.4);
    ctx.lineTo(0.75, -17);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ink(ctx, 0.42, 0.85);
  ctx.beginPath();
  ctx.moveTo(-8.4, -23);
  ctx.quadraticCurveTo(0, -29.6, 8.4, -23);
  ctx.stroke();
  ink(ctx, 0.7, 1.1);
  for (const side of [-1, 1]) inkArc(ctx, side * 4.1, -21.6, 3.9, OWL_K + 10 + side);
  ink(ctx, 0.85, 2.4);
  for (const side of [-1, 1]) inkArc(ctx, side * 4.1 - side * 0.5, -21.4, 2.1, OWL_K + 20 + side);
  ink(ctx, 0.4, 0.7);
  owlLashes(ctx);
  ink(ctx, 0.6, 1);
  ctx.beginPath();
  ctx.moveTo(-2.1, -19.2);
  ctx.lineTo(0, -14.8);
  ctx.lineTo(2.1, -19.2);
  ctx.stroke();
  ctx.restore();
}

/** The seed every pencil wobble on this bird is drawn from. */
const OWL_K = 4100;

/*
 * Traced off the painting, after getting it wrong twice.
 *
 * Two things about it are not what an owl usually has, and both are the whole
 * character of the drawing:
 *
 *  - the ears are small pointed corners **of the body outline itself**, more
 *    like a cat's than an owl's tufts. Drawn as separate sweeping horns they
 *    read as antennae stuck on a cartoon;
 *  - the wings are **separate** heavy strokes outside the body, running down
 *    each side to the branch, so it looks as though it is propping itself up
 *    on them. They are not part of the outline and not joined to the ears.
 */
function owlBodyPath(ctx: CanvasRenderingContext2D): void {
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
}

function owlWingPaths(ctx: CanvasRenderingContext2D, wide: number, beat: number): void {
  ctx.lineWidth = wide;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    // Starts underneath the body so lifting it can never open a white seam.
    ctx.moveTo(side * 7.4, -23.4);
    ctx.quadraticCurveTo(
      side * (14.4 + beat * 3),
      -15.4 - beat * 4,
      side * (9.6 + beat * 2.5),
      -5 - beat * 3,
    );
    ctx.stroke();
  }
}

/** Three short lashes over the outer top of each eye, as painted. */
function owlLashes(ctx: CanvasRenderingContext2D): void {
  for (const side of [-1, 1]) {
    const ex = side * 4.1;
    for (const i of [0, 1, 2]) {
      const a = (side > 0 ? -1.15 : -1.99) + side * i * 0.28;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(a) * 4, -21.6 + Math.sin(a) * 4);
      ctx.lineTo(ex + Math.cos(a) * 5.8, -21.6 + Math.sin(a) * 5.8);
      ctx.stroke();
    }
  }
}

