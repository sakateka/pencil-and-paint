import { clamp, TAU } from '../core/math';
import type { Medium } from '../media/medium';
import { BOARD_H, BOARD_W, EASEL_HEIGHT } from '../world/easel';
import { EMPTY_SAG, drawHammockCloth, hammockPoint } from '../world/hammock';

/**
 * Lying in the hammock.
 *
 * The one thing here you can do at any point: the pots do not gate it, because
 * the whole idea of a hammock is that you have stopped. What the pots gate is
 * the birds — an unfinished valley is a drawing, and drawings are silent.
 *
 * Like the fishing camp, the occupied hammock is drawn live over the empty one
 * baked into the world, and none of this exists when nobody is in it.
 */

/** How long the sway takes to settle when somebody lies down, and to lift. */
const SETTLE_SECONDS = 1.1;

/** How far the cloth drops under a person, on top of its own hang. */
const LOADED_SAG = 26;

/**
 * How long after the valley is finished before the bird turns up.
 *
 * Short. It belongs to the finished valley rather than to the hammock — the
 * moment the last pot is in, something comes back to the tree — and a long wait
 * for it only reads as a delay, since by then you are usually walking away.
 */
const BIRD_DELAY = 0.6;

/** How long it takes to drop in and settle once it has decided to. */
const BIRD_LANDING = 0.9;

/**
 * Where it sits: the top of the right-hand tree's crown, from the hammock.
 *
 * The tree stands half a span to the right at the same ground line, and its
 * upper leaf clump tops out about here.
 */
const PERCH_X = 62;
const PERCH_Y = -110;

export class Rest {
  /** Whether anybody is lying down. */
  resting = false;

  /** Seconds spent in the hammock this lie-down. */
  clock = 0;

  /** How far into the hammock they are, 0 to 1, eased. Drives the sag. */
  settled = 0;

  /**
   * Where the hammock is. Known always, not only while somebody is in it —
   * the cloth is drawn every frame whether or not anybody is lying in it.
   */
  readonly x: number;
  readonly y: number;

  /** Whether the valley is done, which is what the bird waits for. */
  birds = false;

  /**
   * The bird's own clock, which runs from the moment the valley is finished.
   *
   * Separate from `clock`, which only runs while somebody is lying down: the
   * bird is on the tree whether or not anybody is in the hammock. What the
   * hammock decides is whether you are close enough and still enough to hear it.
   */
  private birdClock = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  lieDown(): void {
    this.resting = true;
    this.clock = 0;
  }

  /** How far the cloth is hanging: its own weight, plus whoever is in it. */
  get sag(): number {
    return EMPTY_SAG + LOADED_SAG * this.settled;
  }

  /** How far it has swung, which is more the moment somebody gets in. */
  get swing(): number {
    return Math.sin(this.clock * 1.15) * 2.6 * (0.35 + (1 - this.settled) * 0.9);
  }

  getUp(): void {
    this.resting = false;
    this.clock = 0;
  }

  update(dt: number, won: boolean): void {
    // The bird comes when the valley is finished and goes when it is unfinished
    // again, which only happens on a restart.
    this.birds = won;
    this.birdClock = won ? this.birdClock + dt : 0;

    // The sag eases both ways, so getting up lifts the cloth rather than
    // snapping it flat while the person is still drawn in it.
    const wanted = this.resting ? 1 : 0;
    this.settled += (wanted - this.settled) * Math.min(1, dt / SETTLE_SECONDS * 3.2);
    if (!this.resting) return;
    this.clock += dt;
  }

  /** Whether there is anything to draw, including the last of the lift. */
  get visible(): boolean {
    return this.resting || this.settled > 0.02;
  }

  /** Whether the bird has come. Nothing to do with the hammock. */
  get perched(): boolean {
    return this.birds && this.birdClock > BIRD_DELAY;
  }

  /** How far through landing it is, 0 to 1. */
  get landed(): number {
    return clamp((this.birdClock - BIRD_DELAY) / BIRD_LANDING, 0, 1);
  }

  /** Its own clock, for the small things it does while it sits there. */
  get birdTime(): number {
    return this.birdClock;
  }

  /** Where it sits, in world coordinates. */
  get perchX(): number {
    return this.x + PERCH_X;
  }

  get perchY(): number {
    return this.y + PERCH_Y;
  }
}

/**
 * The hammock: the cloth, whoever is in it, and the near edge over their legs.
 *
 * All of it drawn with the live things, in whichever medium, so that it is
 * masked by the light like everything else. The first version drew the sleeper
 * and the near edge in the pass that comes after the mask — the one the walker
 * is drawn in, which is always in colour — and from across the field you could
 * see a full-colour person lying in a graphite valley.
 */
export function drawHammock(ctx: CanvasRenderingContext2D, rest: Rest, medium: Medium): void {
  const { x, y } = rest;
  const sag = rest.sag;

  ctx.save();
  ctx.translate(rest.swing, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  drawHammockCloth(ctx, x, y, sag, medium);
  // Only while somebody is actually in it: the cloth lifts gently once they
  // get out, but a person fading away in mid-air is a ghost, not a movement.
  if (medium === 'color' && rest.resting) drawSleeper(ctx, x, y, sag, rest);

  // The cloth's near edge again, over the legs, so they are *in* it.
  if (medium === 'color') {
    ctx.strokeStyle = '#cbbb98';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const p = hammockPoint(x, y, i / 20, sag);
      if (i === 0) ctx.moveTo(p.x, p.y + 12);
      else ctx.lineTo(p.x, p.y + 12);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The bird, which is neither the valley's nor the hammock's.
 *
 * Drawn after the mask rather than through it — it only comes once every pot is
 * found, by which time the colour has flooded everything anyway — and after the
 * occluders, because it is sitting on top of a tree that is one of them.
 */
export function drawBirds(ctx: CanvasRenderingContext2D, rest: Rest): void {
  if (!rest.perched) return;
  drawPerchedBird(ctx, rest);
}

/** The walker, lying along the curve with their hands behind their head. */
function drawSleeper(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sag: number,
  rest: Rest,
): void {
  const fade = clamp((rest.settled - 0.05) / 0.4, 0, 1);
  /*
   * Where the body lies along the cloth, as fractions across it.
   *
   * These were nearly twice as far apart and the sleeper came out about two
   * metres long — a stick man stretched from one tree to the other. A person is
   * roughly as long lying down as they are tall standing up, and the walker is
   * some fifty units tall, which over this span is a bit over a quarter of it.
   */
  const head = hammockPoint(x, y, 0.35, sag);
  const hips = hammockPoint(x, y, 0.5, sag);
  const feet = hammockPoint(x, y, 0.63, sag);
  // Breathing, slow and shallow. Anything more and they look uncomfortable.
  const breath = Math.sin(rest.clock * 0.9) * 0.7;

  ctx.save();
  ctx.globalAlpha = fade;

  // Legs, bent over the far edge the way they are when a hammock holds you.
  ctx.strokeStyle = '#3a5a86';
  ctx.lineWidth = 6.4;
  ctx.beginPath();
  ctx.moveTo(hips.x, hips.y + 2);
  ctx.quadraticCurveTo(feet.x - 6, feet.y - 3, feet.x, feet.y);
  ctx.stroke();
  ctx.strokeStyle = '#4a3b30';
  ctx.lineWidth = 4.6;
  ctx.beginPath();
  ctx.moveTo(feet.x - 1, feet.y);
  ctx.lineTo(feet.x + 5, feet.y - 1.5);
  ctx.stroke();

  // Body, along the sag.
  ctx.strokeStyle = '#d9463c';
  ctx.lineWidth = 11.5;
  ctx.beginPath();
  ctx.moveTo(head.x + 4, head.y + breath);
  ctx.quadraticCurveTo((head.x + hips.x) / 2, head.y + 3.5 + breath, hips.x, hips.y + 1);
  ctx.stroke();

  // An arm folded up behind the head.
  ctx.strokeStyle = '#e8a06a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(head.x + 7, head.y + 2 + breath);
  ctx.quadraticCurveTo(head.x + 3, head.y - 10 + breath, head.x - 4, head.y - 7 + breath);
  ctx.stroke();

  // Head, tipped back into the cloth.
  ctx.fillStyle = '#e8a06a';
  ctx.beginPath();
  ctx.arc(head.x - 4, head.y - 2.5 + breath, 6.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#4a3b30';
  ctx.beginPath();
  ctx.arc(head.x - 6, head.y - 5.5 + breath, 6.3, Math.PI * 0.75, Math.PI * 2.05);
  ctx.fill();
  // Eyes shut, because that is the whole point of lying down.
  ctx.strokeStyle = '#4a3b30';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(head.x - 1.8, head.y - 1.6 + breath, 1.7, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.restore();
}

/**
 * The bird, sitting on the tree the hammock is tied to.
 *
 * There used to be five of these and they circled, which at this size and rate
 * turned out to look less like birds than like a cloud of midges over somebody
 * having a nap. One bird, sitting still, doing the small things a sitting bird
 * does, is worth more than five doing laps.
 */
function drawPerchedBird(ctx: CanvasRenderingContext2D, rest: Rest): void {
  const settle = rest.landed;
  const t = rest.birdTime;
  const x = rest.perchX;
  // Drops the last little way in, rather than appearing on the branch.
  const y = rest.perchY - (1 - settle) * 26;

  /*
   * What a sitting bird actually does: almost nothing, slowly, and then all at
   * once. The bob is barely there, the head turns every few seconds and holds,
   * and the tail flicks on its own schedule so the two never line up.
   */
  const bob = Math.sin(t * 1.4) * 0.7;
  const turn = Math.sin(t * 0.37) > 0 ? 1 : -1;
  const flick = Math.max(0, Math.sin(t * 0.9) - 0.93) * 34;
  // Wings only while it is still arriving.
  const flutter = (1 - settle) * Math.sin(t * 22) * 5;

  ctx.save();
  ctx.globalAlpha = Math.min(1, settle * 2.5);
  ctx.translate(x, y + bob);
  ctx.scale(turn, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Legs, gripping whatever it is standing on.
  ctx.strokeStyle = '#6b5a44';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-1, 3.2);
  ctx.lineTo(-1.6, 5.4);
  ctx.moveTo(1, 3.2);
  ctx.lineTo(1.4, 5.4);
  ctx.stroke();

  // Tail, up and back, flicking now and then.
  ctx.save();
  ctx.rotate(flick * 0.05);
  ctx.fillStyle = '#6f6152';
  ctx.beginPath();
  ctx.moveTo(-3, -0.5);
  ctx.lineTo(-10.5, -3.6);
  ctx.lineTo(-9.5, -0.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Body: brown back, warm breast.
  ctx.fillStyle = '#7a6a58';
  ctx.beginPath();
  ctx.ellipse(-1, 0, 5.4, 4.2, -0.18, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e08b4a';
  ctx.beginPath();
  ctx.ellipse(0.4, 1.2, 3.8, 3, -0.1, 0, TAU);
  ctx.fill();

  // A wing, folded — or beating, if it is still coming in.
  ctx.save();
  ctx.rotate(flutter * 0.09);
  ctx.fillStyle = '#6f6152';
  ctx.beginPath();
  ctx.ellipse(-1.6, -0.4, 3.6, 2, 0.25, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Head, beak, eye.
  ctx.fillStyle = '#7a6a58';
  ctx.beginPath();
  ctx.arc(4, -2.6, 3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e8c06a';
  ctx.beginPath();
  ctx.moveTo(6.4, -2.8);
  ctx.lineTo(9.4, -2);
  ctx.lineTo(6.4, -1.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2e2b26';
  ctx.beginPath();
  ctx.arc(5.2, -3.4, 0.9, 0, TAU);
  ctx.fill();

  ctx.restore();
}

/**
 * Whatever was last drawn at the easel, standing on it.
 *
 * Live and colour-only, and so only visible once the light has reached it. In
 * pencil it is the half-finished valley baked into the board — which is the
 * right way round: from across the field the easel holds the drawing somebody
 * abandoned, and up close it holds yours.
 */
export function drawEaselPicture(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  x: number,
  y: number,
): void {
  if (!image?.complete || image.naturalWidth === 0) return;
  const top = y - EASEL_HEIGHT;
  ctx.save();
  // Inside the board's frame, not over it.
  ctx.drawImage(image, x - BOARD_W / 2 + 3, top + 3, BOARD_W - 6, BOARD_H - 6);
  ctx.strokeStyle = 'rgba(60,55,45,.35)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x - BOARD_W / 2 + 3, top + 3, BOARD_W - 6, BOARD_H - 6);
  ctx.restore();
}
