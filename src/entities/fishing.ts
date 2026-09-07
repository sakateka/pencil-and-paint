import { clamp, lerp, TAU } from '../core/math';
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

export type CatchKind =
  | 'roach'
  | 'crucian'
  | 'carp'
  | 'catfish'
  | 'boot'
  | 'shoe'
  | 'treasure';

interface CatchSpec {
  readonly kind: CatchKind;
  /** Relative likelihood; these are out of a hundred. */
  readonly weight: number;
}

/**
 * What is in this pond, and how often.
 *
 * Weighted so that the ordinary fish are ordinary: four times in five it is
 * something with fins, and the rest of the time the pond gives up something
 * somebody lost. The gold thing is one cast in a hundred, which is rare enough
 * that finding one is worth telling somebody about and common enough that it
 * happens.
 */
const CATCHES: readonly CatchSpec[] = [
  { kind: 'roach', weight: 32 },
  { kind: 'crucian', weight: 25 },
  { kind: 'carp', weight: 18 },
  { kind: 'catfish', weight: 13 },
  { kind: 'boot', weight: 6 },
  { kind: 'shoe', weight: 5 },
  { kind: 'treasure', weight: 1 },
];

const TOTAL_WEIGHT = CATCHES.reduce((sum, c) => sum + c.weight, 0);

/**
 * Everything the pond can give up, so the library can bake all of it.
 *
 * The list, not the odds: a picture library has to hold the one-in-a-hundred
 * gold thing as readily as the roach, or the rarest catch in the game would be
 * the one that stalls the frame it appears in.
 */
export const CATCH_KINDS: readonly CatchKind[] = CATCHES.map((c) => c.kind);

/** Draw one from the pond. */
function pickCatch(): CatchSpec {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const c of CATCHES) {
    roll -= c.weight;
    if (roll < 0) return c;
  }
  return CATCHES[0];
}

/** An empty ledger. */
function emptyTally(): Record<CatchKind, number> {
  return Object.fromEntries(CATCHES.map((c) => [c.kind, 0])) as Record<CatchKind, number>;
}



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

  /** How many things have been landed this playthrough, of any sort. */
  caught = 0;

  /** How many of each, kept for the tally shown when you pack up. */
  tally: Record<CatchKind, number> = emptyTally();

  /** What is on the line right now. */
  hooked: CatchKind = 'roach';

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

  /**
   * How far through landing a fish we are, 0 to 1. Zero at any other time.
   *
   * The catch is two movements in sequence — the rod comes up, and only then
   * does the fish clear the water — so the drawing needs to know where in the
   * catch it is, not merely that there is one.
   */
  get catchProgress(): number {
    if (this.phase !== 'caught') return 0;
    return clamp(1 - this.timer / RESULT_SECONDS, 0, 1);
  }

  /** Which phrase the prompt should show, as a dictionary key. */
  get labelKey(): string {
    switch (this.phase) {
      case 'waiting':
        return 'prompt.wait';
      case 'bite':
        return 'prompt.now';
      case 'caught':
        return `said.${this.hooked}`;
      case 'missed':
        return 'prompt.gotAway';
      case 'off':
        return 'prompt.fish';
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
    this.hooked = pickCatch().kind;
    this.tally[this.hooked]++;
    this.caught++;
    this.phase = 'caught';
    this.timer = RESULT_SECONDS;
    return true;
  }

  /**
   * What came up, in the order the table lists it — so the fish come before
   * the rubbish and the gold thing is last, which is where you want it.
   *
   * Kinds and counts only. Turning those into a sentence needs to know the
   * language, the plural rules and how that language joins a list, none of
   * which belongs down here with the pond.
   */
  get landed(): { kind: CatchKind; count: number }[] {
    return CATCHES.filter((c) => this.tally[c.kind] > 0).map((c) => ({
      kind: c.kind,
      count: this.tally[c.kind],
    }));
  }

  /** Everything back to nothing, for a new playthrough. */
  forget(): void {
    this.caught = 0;
    this.tally = emptyTally();
  }
}

/**
 * Where every moving part of the tackle is this frame.
 *
 * All of it worked out in one place and none of it drawn, because none of it
 * is a drawing: the rod is a stick turned about the hand, the line is a curve
 * through the air, the float is a position and a tilt. What used to be a
 * hundred and eighty kilobytes of canvas repainted at the boil's rate is these
 * numbers and a handful of sprites — see `render/looks/camp.ts`.
 *
 * Takes the walker's position because the rod is in their hands: the line has
 * to start where they are standing this frame, not where they pitched camp.
 */
export interface Tackle {
  /** How far the rod is swept up and back, 0 to 1. */
  readonly pull: number;
  /** How far through the leap whatever was caught is, 0 to 1. */
  readonly leap: number;
  readonly handX: number;
  readonly handY: number;
  readonly tipX: number;
  readonly tipY: number;
  readonly floatX: number;
  readonly floatY: number;
  /** How far the float is tipped over, in radians. */
  readonly floatAngle: number;
  /** Where the rings are, which is where the float rests rather than where it
   * has been dragged to: the water is not pulled up with it. */
  readonly ringX: number;
  readonly ringY: number;
  /** How far the line sags between the tip and the float, in world units. */
  readonly sag: number;
}

export function tackleOf(f: Fishing, walkerX: number, walkerY: number, face: -1 | 1): Tackle {
  const t = f.clock;
  /*
   * Landing a fish is two movements, in order.
   *
   * First the rod comes up and the line comes in — `pull` rises quickly, holds
   * while the fish is on its way, and settles back as the line goes out again.
   * Only once that is done does the fish clear the water, and it does it over
   * the walker rather than out where the float was: it is being lifted to the
   * bank, not leaping about in the middle of the pond.
   */
  const caught = f.catchProgress;
  const pull = bump(caught, 0.3, 0.72);
  const leap = caught > LEAP_AFTER ? (caught - LEAP_AFTER) / (1 - LEAP_AFTER) : 0;

  // The rod: held out at the water, swept up and back as it is pulled.
  const handX = walkerX + face * 9;
  const handY = walkerY - 25;
  const toFloat = Math.atan2(f.floatY - handY, f.floatX - handX);
  const reach = ROD_LENGTH * (1 - pull * 0.5);
  const tipX = handX + Math.cos(toFloat) * reach;
  const tipY = handY + Math.sin(toFloat) * reach - 10 - pull * 28;

  const bob = Math.sin(t * 1.6) * 1.4;
  // The float rides out of the water and in towards the rod as the line comes
  // in, then drops back as the next cast goes out.
  const restingY = f.floatY + bob + f.dip * 5;

  return {
    pull,
    leap,
    handX,
    handY,
    tipX,
    tipY,
    floatX: lerp(f.floatX, tipX, pull * 0.85),
    floatY: lerp(restingY, tipY + 9, pull * 0.85),
    floatAngle: f.dip * 0.7 + pull * 0.9,
    ringX: f.floatX,
    ringY: restingY,
    // A slack line sags. A straight one looks like wire — and it pulls taut as
    // the rod comes up, so the sag goes with it.
    sag: 9 * (1 - pull),
  };
}

/** The rod's own length, which the sweep shortens and the sprite scales to. */
export const ROD_LENGTH = 34;

/** The rod, lying along the x axis from the hand, to be turned and scaled. */
export function drawRod(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#6b4a2c';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(ROD_LENGTH, 0);
  ctx.stroke();
  ctx.restore();
}

/** How long a piece of line one baked strand is, before it is stretched. */
export const STRAND_LENGTH = 20;

/**
 * One straight piece of fishing line, along the x axis.
 *
 * The line as a whole is a sagging curve, and a curve is not a drawing — so it
 * is drawn as a few of these, each turned and stretched onto one chord of the
 * curve. Butt ends rather than round ones, so consecutive pieces meet exactly
 * instead of overlapping: two half-transparent ends laid over each other make
 * a dark bead, which is the same trap the mirage's petals set.
 */
export function drawStrand(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(70,64,54,.55)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(STRAND_LENGTH, 0);
  ctx.stroke();
  ctx.restore();
}

/** The float: red on top, white below, upright about its own middle. */
export function drawFloat(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#f7f2e6';
  ctx.beginPath();
  ctx.ellipse(0, 1.6, 2.6, 3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d9463c';
  ctx.beginPath();
  ctx.ellipse(0, -1.8, 2.8, 3.2, 0, 0, TAU);
  ctx.fill();
}

/**
 * Up over `rise`, held, and back down after `fall`. All in 0..1.
 *
 * Smoothstepped at both ends, so a movement built on this has no corner where
 * it starts or where it stops.
 */
function bump(p: number, rise: number, fall: number): number {
  if (p <= 0) return 0;
  const ease = (u: number) => u * u * (3 - 2 * u);
  if (p < rise) return ease(p / rise);
  if (p > fall) return ease(Math.max(0, 1 - (p - fall) / (1 - fall)));
  return 1;
}

/** How far into the catch the fish clears the water. The rod goes first. */
const LEAP_AFTER = 0.38;

/**
 * Rings spreading from the float, and a hard one the moment it is pulled.
 *
 * A ring that spreads is a size, not a drawing, so what is baked is a ladder of
 * rings a third apart and the size in between is a scale — which keeps the
 * spread perfectly smooth, at the price of a hairline that runs about a tenth
 * of a pixel thick either side of its 1.1. The alternative, a picture per
 * radius fine enough not to step, is thirty drawings of a hairline.
 */
export const RIPPLE_BANDS: readonly number[] = [3, 4.05, 5.5, 7.4, 10, 13.5, 18.1, 24.5, 33];

/** One ring, at one of the baked sizes, opaque: the fading is the sprite's. */
export function drawRipple(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.strokeStyle = 'rgb(232,244,250)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.38, 0, 0, TAU);
  ctx.stroke();
}

/** The three rings on the water: how big each is, and how far it has faded. */
export function ripplesAt(t: number, dip: number): { radius: number; alpha: number }[] {
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const age = (t * 0.55 + i / 3) % 1;
    rings.push({
      radius: 3 + age * (14 + dip * 12),
      // The stroke's own alpha and the ring's, which the canvas multiplied
      // together and a sprite carries as one number.
      alpha: (0.34 + dip * 0.4) * (1 - age) * (0.5 + dip * 0.5),
    });
  }
  return rings;
}

/*
 * Whatever came up, over the walker for a moment and gone again.
 *
 * `u` runs 0 to 1 across the leap alone, which is the fix for what this used to
 * do: it was driven from the camp's own clock, so the arc had nothing to do
 * with when anything was caught and the fish simply appeared mid-flight.
 *
 * The arc and the turn are transforms; only the animal is a drawing.
 */

/** How high whatever was caught is above the walker's head, at `u`. */
export function catchHeight(u: number): number {
  return Math.sin(Math.min(1, u) * Math.PI) * 40;
}

/**
 * How far it is turned over at `u`.
 *
 * A fish turns as it goes — head up on the way, head down coming back. An old
 * boot does not: it hangs off the line and swings, which is most of what makes
 * it read as rubbish rather than as a catch.
 */
export function catchAngle(u: number, kind: CatchKind): number {
  const alive = kind !== 'boot' && kind !== 'shoe' && kind !== 'treasure';
  return alive
    ? -Math.cos(Math.min(1, u) * Math.PI) * 0.75
    : 0.35 + Math.sin(u * Math.PI * 2.4) * 0.22;
}

/** Whatever came up, drawn about its own middle and facing east. */
export function drawCatchKind(ctx: CanvasRenderingContext2D, kind: CatchKind): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (kind) {
    case 'roach':
      drawRoach(ctx);
      break;
    case 'crucian':
      drawCrucian(ctx);
      break;
    case 'carp':
      drawCarp(ctx);
      break;
    case 'catfish':
      drawCatfish(ctx);
      break;
    case 'boot':
      drawBoot(ctx);
      break;
    case 'shoe':
      drawShoe(ctx);
      break;
    case 'treasure':
      drawTreasure(ctx);
      break;
  }
  ctx.restore();
}

/** The body and tail every fish here is built from. */
function fishBody(
  ctx: CanvasRenderingContext2D,
  length: number,
  depth: number,
  colour: string,
  belly: string,
): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.ellipse(0, 0, length, depth, 0, 0, TAU);
  ctx.fill();

  // The pale underside every fish has, clipped to the body so it reads as
  // light on a curve rather than a stripe painted on.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, length, depth, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(0, depth * 0.72, length * 0.92, depth * 0.55, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function tail(ctx: CanvasRenderingContext2D, at: number, span: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(at, 0);
  ctx.lineTo(at - span, -span * 0.8);
  ctx.lineTo(at - span * 0.55, 0);
  ctx.lineTo(at - span, span * 0.8);
  ctx.closePath();
  ctx.fill();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ring?: string): void {
  if (ring) {
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.9, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#2e2b26';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** Small, silver, red-finned. The one you catch most days. */
function drawRoach(ctx: CanvasRenderingContext2D): void {
  const fin = '#d9603c';
  ctx.fillStyle = fin;
  ctx.beginPath();
  ctx.moveTo(-1, 3);
  ctx.lineTo(-4, 8);
  ctx.lineTo(3, 4);
  ctx.closePath();
  ctx.fill();
  fishBody(ctx, 9, 4, '#c3cfd6', '#eef3f5');
  tail(ctx, -9, 6, fin);
  ctx.fillStyle = fin;
  ctx.beginPath();
  ctx.moveTo(-2, -3.4);
  ctx.lineTo(1, -8);
  ctx.lineTo(4, -3);
  ctx.closePath();
  ctx.fill();
  eye(ctx, 5.4, -1, 1.1, '#e8b23c');
}

/** Deep, round and bronze — a pond fish that has done well for itself. */
function drawCrucian(ctx: CanvasRenderingContext2D): void {
  const fin = '#8a6a3f';
  fishBody(ctx, 9.5, 6.4, '#b9884a', '#e6c98a');
  tail(ctx, -9.5, 6.5, fin);
  ctx.fillStyle = fin;
  ctx.beginPath();
  ctx.moveTo(-4, -5.6);
  ctx.quadraticCurveTo(0, -11, 4, -4.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-2, 5.4);
  ctx.lineTo(-4, 9);
  ctx.lineTo(2, 5);
  ctx.closePath();
  ctx.fill();
  eye(ctx, 6, -1.6, 1.1, '#f0d79a');
}

/** Bigger, golden, scaled, and whiskered at the corners of its mouth. */
function drawCarp(ctx: CanvasRenderingContext2D): void {
  const fin = '#9c6c33';
  fishBody(ctx, 12.5, 6.8, '#cf9646', '#f0d492');
  tail(ctx, -12.5, 8, fin);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, 12.5, 6.8, 0, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = 'rgba(120,84,34,.4)';
  ctx.lineWidth = 0.9;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(i * 4.4 - 1, 0, 4.6, -1.1, 1.1);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = fin;
  ctx.beginPath();
  ctx.moveTo(-6, -6);
  ctx.quadraticCurveTo(0, -12.5, 6, -4.8);
  ctx.closePath();
  ctx.fill();

  // The barbels, which are the whole reason a carp looks like a carp.
  ctx.strokeStyle = '#9c6c33';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(11.5, 2);
  ctx.quadraticCurveTo(14.5, 3.6, 13.6, 6.4);
  ctx.moveTo(11.8, 0.6);
  ctx.quadraticCurveTo(15.4, 1.4, 15.4, 4);
  ctx.stroke();
  eye(ctx, 8, -1.8, 1.2, '#f7e6b4');
}

/** Long, flat-headed, dark, and mostly whiskers. */
function drawCatfish(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#5f6b58';
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.quadraticCurveTo(11, -6.2, 2, -5.4);
  ctx.quadraticCurveTo(-8, -4.6, -14, -2.4);
  ctx.quadraticCurveTo(-9, 0, -14, 2.4);
  ctx.quadraticCurveTo(-8, 5.2, 2, 5.8);
  ctx.quadraticCurveTo(11, 6.4, 14, 0);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.quadraticCurveTo(11, -6.2, 2, -5.4);
  ctx.quadraticCurveTo(-8, -4.6, -14, -2.4);
  ctx.quadraticCurveTo(-9, 0, -14, 2.4);
  ctx.quadraticCurveTo(-8, 5.2, 2, 5.8);
  ctx.quadraticCurveTo(11, 6.4, 14, 0);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#a8ad86';
  ctx.beginPath();
  ctx.ellipse(0, 5.4, 12, 3.2, 0, 0, TAU);
  ctx.fill();
  // The mottling that says river bottom.
  ctx.fillStyle = 'rgba(40,48,38,.32)';
  for (const [mx, my, mr] of [[-6, -2, 2.6], [1, -3, 2], [6, -1, 1.6], [-2, 1, 2.2]] as const) {
    ctx.beginPath();
    ctx.ellipse(mx, my, mr, mr * 0.7, 0.3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = '#5f6b58';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(12.6, -1.6);
  ctx.quadraticCurveTo(19, -6, 21.5, -3);
  ctx.moveTo(12.8, 0.4);
  ctx.quadraticCurveTo(18, 2.4, 20, 6);
  ctx.moveTo(12.4, 1.8);
  ctx.quadraticCurveTo(15.4, 5.4, 14.6, 8.4);
  ctx.stroke();
  eye(ctx, 9.6, -2.6, 1, '#c9c48e');
}

/** Weed and all. */
function drawWeed(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = '#5f7f4a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - 4, y + 6, x - 1, y + 11);
  ctx.moveTo(x + 2, y);
  ctx.quadraticCurveTo(x + 6, y + 5, x + 3, y + 9);
  ctx.stroke();
}

/** A wellington, filled with pond. */
function drawBoot(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#4a3f38';
  ctx.beginPath();
  ctx.moveTo(-4, -11);
  ctx.lineTo(4.5, -11);
  ctx.lineTo(5, 3);
  ctx.lineTo(13, 4);
  ctx.quadraticCurveTo(15, 5.4, 13, 8);
  ctx.lineTo(-4.5, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#31292470';
  ctx.beginPath();
  ctx.ellipse(0.2, -10.6, 4.4, 1.8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2f2a25';
  ctx.beginPath();
  ctx.moveTo(-4.5, 5.4);
  ctx.lineTo(13.4, 6.2);
  ctx.lineTo(13, 8);
  ctx.lineTo(-4.5, 8);
  ctx.closePath();
  ctx.fill();
  drawWeed(ctx, 8, 6);
}

/** Somebody's shoe, one of a pair that is now one. */
function drawShoe(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#8a6a4f';
  ctx.beginPath();
  ctx.moveTo(-8, -3);
  ctx.quadraticCurveTo(-9, 3, -7, 5);
  ctx.lineTo(10, 5.6);
  ctx.quadraticCurveTo(13, 4, 10.5, 1);
  ctx.quadraticCurveTo(4, -1.4, 0, -4.6);
  ctx.quadraticCurveTo(-4, -6, -8, -3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#efe8d8';
  ctx.beginPath();
  ctx.moveTo(-7.6, 4.4);
  ctx.lineTo(10.6, 5.2);
  ctx.quadraticCurveTo(13, 4.2, 10.6, 2.2);
  ctx.lineTo(-7.4, 1.8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#efe8d8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-5, -2.4);
  ctx.lineTo(-1.6, -0.6);
  ctx.moveTo(-4.6, -0.4);
  ctx.lineTo(-1.2, -2.6);
  ctx.stroke();
  drawWeed(ctx, 4, 4.4);
}

/** Something gold, and one cast in a hundred. */
function drawTreasure(ctx: CanvasRenderingContext2D): void {
  /*
   * Stroked, not a disc with a hole punched in it.
   *
   * `destination-out` would have made a proper ring, and it would also have
   * erased the valley behind it — the composite applies to everything already
   * on the canvas, not just to this fish's worth of gold.
   */
  ctx.strokeStyle = '#c98a2c';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.arc(0, 0, 4.9, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = '#f7e6b4';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 4.9, -2.5, -0.7);
  ctx.stroke();

  ctx.fillStyle = '#9fd8ea';
  ctx.beginPath();
  ctx.moveTo(0, -10.6);
  ctx.lineTo(2.6, -7.2);
  ctx.lineTo(0, -4.4);
  ctx.lineTo(-2.6, -7.2);
  ctx.closePath();
  ctx.fill();

}

/**
 * A glint that crosses the gold ring once, rather than twinkling all the way
 * up. How wide it is opened is a scale and how bright it is an alpha, so this
 * is one drawing: a cross of arms `GLINT_ARM` long.
 */
export const GLINT_ARM = 12;

export function drawGlint(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fffdf2';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-GLINT_ARM, 0);
  ctx.lineTo(GLINT_ARM, 0);
  ctx.moveTo(0, -GLINT_ARM);
  ctx.lineTo(0, GLINT_ARM);
  ctx.stroke();
  ctx.restore();
}

/** How far through its one crossing the glint is at `u`: 0 to 1. */
export function glintAt(u: number): number {
  return Math.sin(Math.min(1, u * 1.6) * Math.PI);
}

/** A small ridge tent, pitched facing the fire. One drawing, for ever. */
export function drawTent(ctx: CanvasRenderingContext2D, x = 0, y = 0): void {
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

/**
 * How brightly the fire is burning at this instant, about nine tenths.
 *
 * Continuous, and so a scale on the glow rather than a picture of it: the glow
 * is a soft blob with no detail in it at all, and shrinking it by a tenth is
 * exactly what pulling its gradient in by a tenth did.
 */
export function fireFlicker(t: number): number {
  return 0.82 + Math.sin(t * 7.3) * 0.09 + Math.sin(t * 11.7) * 0.06;
}

/** The warmth on the grass, at full flicker. Under everything else. */
export function drawFireGlow(ctx: CanvasRenderingContext2D, x = 0, y = 0): void {
  const glow = ctx.createRadialGradient(x, y - 4, 2, x, y - 4, 46);
  glow.addColorStop(0, 'rgba(255,196,96,.42)');
  glow.addColorStop(1, 'rgba(255,196,96,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(x, y - 2, 46, 30, 0, 0, TAU);
  ctx.fill();
}

/** Stones and two logs: the part of a fire that holds still. */
export function drawHearth(ctx: CanvasRenderingContext2D, x = 0, y = 0): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
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
  ctx.restore();
}

/**
 * How long the flame takes to come back round to where it started.
 *
 * A flame is the one thing in this valley that really is a different drawing
 * every instant: three tongues, each swaying and rising on its own pair of
 * sines, and the note over them said *nothing here lines up twice*. Nothing
 * that never repeats can be listed, and what cannot be listed cannot be baked.
 *
 * So the rates are pulled onto multiples of one period and the flame is drawn
 * as every hand-drawn fire has ever been drawn: a loop. Two and two fifths of a
 * second is long enough that the eye does not catch the join, and every rate
 * moved by less than a seventh to get there — the tongues sway and gutter at
 * the speeds they always did.
 */
export const FLAME_PERIOD = 2.4;

/** Drawings in one loop. Twelve and a half a second, a hand-drawn fire's rate. */
export const FLAME_FRAMES = 30;

/** The base rate of the loop, and every tongue is a whole multiple of it. */
const FLAME_BASE = TAU / FLAME_PERIOD;

/** Which drawing of the loop belongs to this moment. */
export function flameFrame(t: number): number {
  const step = Math.floor((t / FLAME_PERIOD) * FLAME_FRAMES);
  return ((step % FLAME_FRAMES) + FLAME_FRAMES) % FLAME_FRAMES;
}

/** Three tongues, at one moment of the loop. */
export function drawFlames(ctx: CanvasRenderingContext2D, t: number, x = 0, y = 0): void {
  ctx.save();
  ctx.lineJoin = 'round';
  for (const [i, colour] of (['#e8563f', '#f7a13b', '#ffd98a'] as const).entries()) {
    const sway = Math.sin(t * FLAME_BASE * (2 + i) + i) * (3 - i);
    const height =
      (16 - i * 4) * (0.85 + Math.sin(t * FLAME_BASE * (3 + i) + i * 2) * 0.15);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(x - (6 - i * 1.6), y - 3);
    ctx.quadraticCurveTo(x + sway - 4, y - height * 0.6, x + sway * 0.6, y - height);
    ctx.quadraticCurveTo(x + sway + 4, y - height * 0.6, x + (6 - i * 1.6), y - 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
