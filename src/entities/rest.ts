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

/** How many birds come out, once the valley is finished. */
const BIRD_COUNT = 5;

/** How long before the first bird dares. */
const BIRD_DELAY = 1.6;

interface Bird {
  /** Where it circles, relative to the hammock. */
  readonly orbitX: number;
  readonly orbitY: number;
  readonly radius: number;
  readonly speed: number;
  readonly phase: number;
  readonly size: number;
  /** When it joins in. */
  readonly after: number;
}

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

  /** Whether the birds are out — which is to say, whether the valley is done. */
  birds = false;

  private readonly flock: Bird[] = [];

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    for (let i = 0; i < BIRD_COUNT; i++) {
      // Fixed rather than random: the flock should look the same every time you
      // lie down, the way the birds in your own garden do.
      const t = i / BIRD_COUNT;
      this.flock.push({
        orbitX: Math.cos(t * TAU + 0.7) * 60,
        orbitY: -74 - (i % 3) * 22,
        radius: 46 + (i % 4) * 15,
        speed: 0.5 + (i % 3) * 0.14,
        phase: t * TAU,
        size: 3.2 + (i % 3) * 0.7,
        after: BIRD_DELAY + i * 0.8,
      });
    }
  }

  lieDown(birds: boolean): void {
    this.resting = true;
    this.birds = birds;
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

  update(dt: number): void {
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

  /** The birds that have joined in by now. */
  get present(): readonly Bird[] {
    if (!this.birds) return [];
    return this.flock.filter((b) => this.clock > b.after);
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
 * The birds, which are neither the valley's nor the hammock's.
 *
 * Drawn after the mask rather than through it: they only come out once every
 * pot is found, by which time the colour has flooded everything anyway.
 */
export function drawBirds(ctx: CanvasRenderingContext2D, rest: Rest): void {
  if (!rest.resting) return;
  for (const bird of rest.present) drawBird(ctx, rest, bird);
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

/** A bird, circling above and flapping. */
function drawBird(ctx: CanvasRenderingContext2D, rest: Rest, bird: Bird): void {
  const age = rest.clock - bird.after;
  const arrive = clamp(age / 1.2, 0, 1);
  const t = rest.clock * bird.speed + bird.phase;
  const cx = rest.x + bird.orbitX + Math.cos(t) * bird.radius;
  // Flattened, because a circle overhead is an ellipse from down here.
  const cy = rest.y + bird.orbitY + Math.sin(t) * bird.radius * 0.34 - (1 - arrive) * 40;

  // Wings beat in bursts with a glide between, the way small birds fly.
  const beat = Math.sin(rest.clock * 11 + bird.phase * 3);
  const glide = Math.sin(rest.clock * 0.7 + bird.phase) > 0.55 ? 0.25 : 1;
  const flap = beat * glide;
  const s = bird.size;

  ctx.save();
  ctx.globalAlpha = arrive * 0.85;
  ctx.translate(cx, cy);
  // Leaning into the turn, and facing the way it is going.
  ctx.scale(Math.cos(t) > 0 ? 1 : -1, 1);
  ctx.strokeStyle = '#4a4238';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(-s * 1.7, -flap * s * 0.75);
  ctx.quadraticCurveTo(-s * 0.6, flap * s * 0.5, 0, 0);
  ctx.quadraticCurveTo(s * 0.6, flap * s * 0.5, s * 1.7, -flap * s * 0.75);
  ctx.stroke();
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
