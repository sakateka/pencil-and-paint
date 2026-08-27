import { clamp, TAU } from '../core/math';
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

  /** Where the hammock is, once we are in it. */
  x = 0;
  y = 0;

  /** Whether the birds are out — which is to say, whether the valley is done. */
  birds = false;

  private readonly flock: Bird[] = [];

  constructor() {
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

  lieDown(x: number, y: number, birds: boolean): void {
    this.resting = true;
    this.birds = birds;
    this.x = x;
    this.y = y;
    this.clock = 0;
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
 * The occupied hammock, and whoever is in it.
 *
 * Drawn in colour only and over the top of the baked empty one, exactly like
 * the fishing camp: this belongs to the walker rather than to the valley.
 */
export function drawRest(ctx: CanvasRenderingContext2D, rest: Rest): void {
  if (!rest.visible) return;
  const { x, y } = rest;

  // A hammock swings, slowly, and less as it settles.
  const swing = Math.sin(rest.clock * 1.15) * 2.6 * (0.35 + (1 - rest.settled) * 0.9);
  const sag = EMPTY_SAG + LOADED_SAG * rest.settled;

  ctx.save();
  ctx.translate(swing, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  drawHammockCloth(ctx, x, y, sag, 'color');
  if (rest.settled > 0.05) drawSleeper(ctx, x, y, sag, rest);

  // The cloth's near edge again, over the legs, so they are *in* it.
  ctx.strokeStyle = '#cbbb98';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const p = hammockPoint(x, y, i / 20, sag);
    if (i === 0) ctx.moveTo(p.x, p.y + 12);
    else ctx.lineTo(p.x, p.y + 12);
  }
  ctx.stroke();
  ctx.restore();

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
  const head = hammockPoint(x, y, 0.26, sag);
  const hips = hammockPoint(x, y, 0.54, sag);
  const feet = hammockPoint(x, y, 0.84, sag);
  // Breathing, slow and shallow. Anything more and they look uncomfortable.
  const breath = Math.sin(rest.clock * 0.9) * 0.7;

  ctx.save();
  ctx.globalAlpha = fade;

  // Legs, bent over the far edge the way they are when a hammock holds you.
  ctx.strokeStyle = '#3a5a86';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(hips.x, hips.y + 2);
  ctx.quadraticCurveTo(feet.x - 12, feet.y - 4, feet.x, feet.y + 1);
  ctx.stroke();
  ctx.strokeStyle = '#4a3b30';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(feet.x - 2, feet.y + 1);
  ctx.lineTo(feet.x + 7, feet.y - 1);
  ctx.stroke();

  // Body, along the sag.
  ctx.strokeStyle = '#d9463c';
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(head.x + 5, head.y - 1 + breath);
  ctx.quadraticCurveTo((head.x + hips.x) / 2, head.y + 4 + breath, hips.x, hips.y + 1);
  ctx.stroke();

  // An arm folded up behind the head.
  ctx.strokeStyle = '#e8a06a';
  ctx.lineWidth = 4.6;
  ctx.beginPath();
  ctx.moveTo(head.x + 9, head.y + 2 + breath);
  ctx.quadraticCurveTo(head.x + 4, head.y - 12 + breath, head.x - 5, head.y - 8 + breath);
  ctx.stroke();

  // Head, tipped back into the cloth.
  ctx.fillStyle = '#e8a06a';
  ctx.beginPath();
  ctx.arc(head.x - 5, head.y - 3 + breath, 7.4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#4a3b30';
  ctx.beginPath();
  ctx.arc(head.x - 7.5, head.y - 6.5 + breath, 7, Math.PI * 0.75, Math.PI * 2.05);
  ctx.fill();
  // Eyes shut, because that is the whole point of lying down.
  ctx.strokeStyle = '#4a3b30';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(head.x - 2.5, head.y - 2 + breath, 1.9, 0.2, Math.PI - 0.2);
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
