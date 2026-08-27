import { TAU } from '../core/math';
import { waterArea, type Ellipse } from '../world/terrain';

/**
 * Fishing at the pond, and the camp that comes with it.
 *
 * This is the only thing in the valley you cannot do straight away: it opens
 * when the last pot is found, so it is somewhere to be afterwards rather than
 * another errand to run. The ending already says *stay as long as you like* —
 * this is what there is to stay for.
 *
 * The camp belongs to the walker, not to the world. It is pitched wherever you
 * cast from and packs itself up when you wander off, which is why none of it is
 * baked into the world layers and none of it has a pencil version: like the
 * walker, it is always in colour.
 */

export type FishingPhase = 'off' | 'waiting' | 'bite' | 'caught' | 'missed';

/** How far you can wander before the camp packs itself up. */
const LEAVE_RADIUS = 130;

/** How long the float sits out there before anything happens. */
const WAIT_MIN = 5;
const WAIT_MAX = 15;

/**
 * How long you have to answer a bite.
 *
 * Generous on purpose. Missing one costs nothing but another cast, and the
 * point of the whole thing is to sit by a pond, not to be tested.
 */
const BITE_WINDOW = 1.5;

/** How long the result sits there before the line goes back out. */
const RESULT_SECONDS = 2.2;

/** Gameplay randomness, kept off the world's seeded generator. */
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** Is this point inside the water? `pad` shrinks the pond when negative. */
function inWater(x: number, y: number, pond: Ellipse, pad: number): boolean {
  const dx = (x - pond.x) / (pond.rx + pad);
  const dy = (y - pond.y) / (pond.ry + pad);
  return dx * dx + dy * dy < 1;
}

export class Fishing {
  phase: FishingPhase = 'off';

  /** Seconds left in the current phase. */
  private timer = 0;

  /** How many have been landed this playthrough. */
  caught = 0;

  /** Where the camp was pitched. */
  campX = 0;
  campY = 0;
  tentX = 0;
  tentY = 0;
  fireX = 0;
  fireY = 0;

  /** Where the float sits on the water. */
  floatX = 0;
  floatY = 0;

  /** Its own clock, for the fire's flicker and the float's bob. */
  clock = 0;

  /** How far the float has been pulled under, 0 to 1, eased. */
  dip = 0;

  get active(): boolean {
    return this.phase !== 'off';
  }

  /** What the prompt on screen says. */
  get label(): string {
    switch (this.phase) {
      case 'waiting':
        return 'wait for it…';
      case 'bite':
        return 'now!';
      case 'caught':
        return this.caught === 1 ? 'a fish!' : `${this.caught} fish`;
      case 'missed':
        return 'it got away';
      case 'off':
        return 'fish here';
    }
  }

  /** Pitch camp and cast. */
  start(x: number, y: number, pond: Ellipse): void {
    this.campX = x;
    this.campY = y;

    // The tent and the fire go behind you, one either side, so neither of them
    // ends up standing in the pond you are fishing.
    const dx = x - pond.x;
    const dy = y - pond.y;
    const away = Math.hypot(dx, dy) || 1;
    const ax = dx / away;
    const ay = dy / away;
    this.tentX = x + ax * 48 + ay * 34;
    this.tentY = y + ay * 48 - ax * 34;
    this.fireX = x + ax * 36 - ay * 32;
    this.fireY = y + ay * 36 + ax * 32;

    /*
     * Walk the line out from the bank until it is properly on the water.
     *
     * `waterArea`, not the pond itself: the pond's ellipse is its bank, and a
     * float placed just inside that lands in the reeds — which is exactly where
     * the first version of this put it.
     */
    const water = waterArea(pond);
    this.floatX = water.x;
    this.floatY = water.y;
    for (let t = 0.04; t <= 1; t += 0.02) {
      const fx = x + (water.x - x) * t;
      const fy = y + (water.y - y) * t;
      if (inWater(fx, fy, water, -12)) {
        // A little further in, so it is not right against the edge.
        const over = Math.min(1, t + 0.06);
        this.floatX = x + (water.x - x) * over;
        this.floatY = y + (water.y - y) * over;
        break;
      }
    }

    this.clock = 0;
    this.dip = 0;
    this.cast();
  }

  packUp(): void {
    this.phase = 'off';
    this.dip = 0;
  }

  private cast(): void {
    this.phase = 'waiting';
    this.timer = between(WAIT_MIN, WAIT_MAX);
  }

  update(dt: number, walkerX: number, walkerY: number): void {
    if (this.phase === 'off') return;
    if (Math.hypot(walkerX - this.campX, walkerY - this.campY) > LEAVE_RADIUS) {
      this.packUp();
      return;
    }

    this.clock += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      switch (this.phase) {
        case 'waiting':
          this.phase = 'bite';
          this.timer = BITE_WINDOW;
          break;
        case 'bite':
          this.phase = 'missed';
          this.timer = RESULT_SECONDS * 0.7;
          break;
        case 'caught':
        case 'missed':
          this.cast();
          break;
      }
    }

    const wanted = this.phase === 'bite' ? 1 : 0;
    this.dip += (wanted - this.dip) * Math.min(1, 9 * dt);
  }

  /**
   * Answer a bite. True if a fish was landed.
   *
   * Striking early does nothing at all — no penalty, no scared fish. Punishing
   * an eager tap would be the one sharp edge in an otherwise gentle thing.
   */
  strike(): boolean {
    if (this.phase !== 'bite') return false;
    this.caught++;
    this.phase = 'caught';
    this.timer = RESULT_SECONDS;
    return true;
  }
}

/**
 * The camp, the rod, the line and the float — all in colour, all drawn live.
 *
 * Takes the walker's position because the rod is in their hands: the line has
 * to start where they are standing this frame, not where they pitched camp.
 */
export function drawCamp(
  ctx: CanvasRenderingContext2D,
  f: Fishing,
  walkerX: number,
  walkerY: number,
  face: -1 | 1,
): void {
  if (!f.active) return;
  const t = f.clock;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  drawTent(ctx, f.tentX, f.tentY);
  drawFire(ctx, f.fireX, f.fireY, t);

  // The rod, held out towards the water, and the line hanging from its tip.
  const handX = walkerX + face * 9;
  const handY = walkerY - 25;
  const toFloat = Math.atan2(f.floatY - handY, f.floatX - handX);
  const tipX = handX + Math.cos(toFloat) * 34;
  const tipY = handY + Math.sin(toFloat) * 34 - 10;

  ctx.strokeStyle = '#6b4a2c';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(handX, handY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  const bob = Math.sin(t * 1.6) * 1.4;
  const floatY = f.floatY + bob + f.dip * 5;

  ctx.strokeStyle = 'rgba(70,64,54,.55)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  // A slack line sags. A straight one looks like wire.
  ctx.quadraticCurveTo((tipX + f.floatX) / 2, (tipY + floatY) / 2 + 9, f.floatX, floatY);
  ctx.stroke();

  drawRipples(ctx, f.floatX, floatY, t, f.dip);

  // The float: red on top, white below, tipping as it is pulled under.
  ctx.save();
  ctx.translate(f.floatX, floatY);
  ctx.rotate(f.dip * 0.7);
  ctx.fillStyle = '#f7f2e6';
  ctx.beginPath();
  ctx.ellipse(0, 1.6, 2.6, 3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d9463c';
  ctx.beginPath();
  ctx.ellipse(0, -1.8, 2.8, 3.2, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (f.phase === 'caught') drawCatch(ctx, f, floatY);
  ctx.restore();
}

/** Rings spreading from the float, and a hard one the moment it is pulled. */
function drawRipples(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  dip: number,
): void {
  ctx.strokeStyle = `rgba(232,244,250,${0.34 + dip * 0.4})`;
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 3; i++) {
    const age = (t * 0.55 + i / 3) % 1;
    const r = 3 + age * (14 + dip * 12);
    ctx.globalAlpha = (1 - age) * (0.5 + dip * 0.5);
    ctx.beginPath();
    ctx.ellipse(x, y + 1, r, r * 0.38, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A fish, out of the water for a moment and gone again. */
function drawCatch(ctx: CanvasRenderingContext2D, f: Fishing, floatY: number): void {
  // Eased so it leaps and falls rather than sliding up and down.
  const lift = Math.sin(Math.min(1, (2.2 - f.clock) % 2.2) * Math.PI);
  const arc = Math.sin(Math.min(1, f.clock % 2.2) * Math.PI);
  const height = Math.max(lift, arc) * 26;
  if (height < 0.5) return;

  ctx.save();
  ctx.translate(f.floatX + 6, floatY - height);
  ctx.rotate(-0.5);
  ctx.fillStyle = '#8fb6c9';
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 3.6, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(-12, -3.4);
  ctx.lineTo(-12, 3.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2e2b26';
  ctx.beginPath();
  ctx.arc(4.4, -0.9, 0.8, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A small ridge tent, pitched facing the fire. */
function drawTent(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = 'rgba(60,55,45,.16)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 30, 8, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#c9714f';
  ctx.beginPath();
  ctx.moveTo(x - 26, y);
  ctx.lineTo(x, y - 34);
  ctx.lineTo(x + 26, y);
  ctx.closePath();
  ctx.fill();

  // The lit side, and the dark mouth of it.
  ctx.fillStyle = 'rgba(255,236,200,.20)';
  ctx.beginPath();
  ctx.moveTo(x, y - 34);
  ctx.lineTo(x + 26, y);
  ctx.lineTo(x + 4, y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#4a3b30';
  ctx.beginPath();
  ctx.moveTo(x - 9, y);
  ctx.lineTo(x, y - 21);
  ctx.lineTo(x + 9, y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#8a6a3f';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, y - 34);
  ctx.lineTo(x - 34, y + 1);
  ctx.stroke();
}

/** Stones, two logs and a flame that never repeats itself. */
function drawFire(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  // The glow first, under everything, so the grass around it warms up.
  const flicker = 0.82 + Math.sin(t * 7.3) * 0.09 + Math.sin(t * 11.7) * 0.06;
  const glow = ctx.createRadialGradient(x, y - 4, 2, x, y - 4, 46 * flicker);
  glow.addColorStop(0, 'rgba(255,196,96,.42)');
  glow.addColorStop(1, 'rgba(255,196,96,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(x, y - 2, 46, 30, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#7a5a38';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(x - 11, y + 2);
  ctx.lineTo(x + 9, y - 4);
  ctx.moveTo(x - 8, y - 4);
  ctx.lineTo(x + 11, y + 2);
  ctx.stroke();

  ctx.fillStyle = '#9c968a';
  for (const a of [0.4, 1.5, 2.6, 3.7, 4.8, 5.9]) {
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * 15, y + 1 + Math.sin(a) * 6, 3.6, 2.6, a, 0, TAU);
    ctx.fill();
  }

  // Three tongues at different rates: nothing here lines up twice.
  for (const [i, colour] of (['#e8563f', '#f7a13b', '#ffd98a'] as const).entries()) {
    const sway = Math.sin(t * (5.4 + i * 1.9) + i) * (3 - i);
    const height = (16 - i * 4) * (0.85 + Math.sin(t * (8.1 + i * 2.3) + i * 2) * 0.15);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(x - (6 - i * 1.6), y - 3);
    ctx.quadraticCurveTo(x + sway - 4, y - height * 0.6, x + sway * 0.6, y - height);
    ctx.quadraticCurveTo(x + sway + 4, y - height * 0.6, x + (6 - i * 1.6), y - 3);
    ctx.closePath();
    ctx.fill();
  }
}
