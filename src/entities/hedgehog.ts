import { TAU } from '../core/math';
import { ink, jitter } from '../media/ink';
import { type Medium } from '../media/medium';

/**
 * The hedgehog, in the bushes above the haystack.
 *
 * It will not come out for you. Walk up to the bush and there is nothing there
 * — the one thing in this valley you cannot go and look at. It comes out when
 * you lie back on the hay and stop, which is the only way anybody has ever seen
 * one: by being still for long enough that something small decides you are part
 * of the field.
 *
 * So it is the haystack's reward rather than its own thing, and it is deliberate
 * that getting up sends it straight back. The bench has nothing to wait for and
 * the stump has the elephant; this is what the hay is for.
 */

/** How long it takes to work up the nerve, once you are lying still. */
const EMERGING = 3.4;

/**
 * And how long it takes to wander back.
 *
 * Slower than coming out, not quicker. It bolted at first, which made standing
 * up feel like frightening it — and the whole point of the animal is that you
 * did the right thing by being still. It has no reason to panic; it just
 * eventually has somewhere else to be.
 */
const RETREAT = 6;

/**
 * How long it stays out after you get up.
 *
 * Standing up does not send it away. It carries on with whatever it was doing
 * for a while first, and only then thinks better of the open ground.
 */
const LINGER = 1.8;

/** How far into coming out it is still in the shadow under the bush. */
const UNDER_BUSH = 0.22;

/** How far it trundles out of the bush, in world units. */
const VENTURE = 34;

const SPINES = '#6b5643';
const SPINE_TIP = '#4a3a2c';
const FUR = '#c9a97f';
const SNOUT = '#8a6f52';
const NOSE = '#2f2723';
const EYE = '#2f2723';

export class Hedgehog {
  /** How far out of the bush it is: 0 hidden, 1 all the way. */
  out = 0;

  /** Its own clock, which only runs while the colour has reached it. */
  clock = 0;

  /** Whether the colour has reached it. */
  lit = false;

  /** Whether it has ever shown itself this session. */
  seen = false;

  /**
   * Which way it is pointed: -1 nose towards the hay, +1 back at the bush.
   *
   * Interpolated rather than switched, so it turns round on the spot instead of
   * flipping. Passing through zero is the turn, and a hedgehog seen end-on is
   * very nearly nothing, which is exactly right.
   */
  facing = -1;

  /** Seconds since the walker got up, for the pause before it goes. */
  private idle = 0;

  constructor(
    /** The bush it lives under. */
    readonly x: number,
    readonly y: number,
  ) {}

  reset(): void {
    this.out = 0;
    this.clock = 0;
    this.seen = false;
    this.facing = -1;
    this.idle = 0;
  }

  /** Where it actually is, having come this far out. */
  get atX(): number {
    return this.x - VENTURE * 0.62 * ease(this.out);
  }

  get atY(): number {
    return this.y + VENTURE * ease(this.out);
  }

  /**
   * Steps it on, and answers true on the frame it first comes right out.
   *
   * `lying` is the walker on the haystack — not the bench, and not merely
   * nearby. `lit` is the colour having reached the bush, which is the rule
   * everything in this valley obeys: out in the graphite it is a drawing of a
   * bush and drawings hold still.
   */
  update(dt: number, lying: boolean, lit: boolean): boolean {
    this.lit = lit;
    if (!lit) return false;
    this.clock += dt;

    const before = this.out;
    let going = false;
    if (lying) {
      this.idle = 0;
      this.out = Math.min(1, this.out + dt / EMERGING);
    } else {
      this.idle += dt;
      going = this.idle > LINGER && this.out > 0;
      if (going) this.out = Math.max(0, this.out - dt / RETREAT);
    }

    // Facing the way it is travelling, and turning before it sets off back.
    const wanted = going ? 1 : -1;
    this.facing += (wanted - this.facing) * Math.min(1, dt * 3.2);

    const arrived = before < 1 && this.out >= 1;
    if (arrived) this.seen = true;
    return arrived;
  }
}

/** Slow to start, slow to stop: the gait of something that is not sure. */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

export function drawHedgehog(ctx: CanvasRenderingContext2D, h: Hedgehog, medium: Medium): void {
  if (h.out <= 0.001) return;

  const t = h.clock;
  /*
   * Rocking side to side as it goes, and stopping when it stops.
   *
   * Four very short legs under a heavy body: a hedgehog does not glide, it
   * bustles. The waddle is keyed to how far out it is rather than to the clock,
   * so it settles the moment it arrives instead of trundling on the spot.
   */
  const moving = h.out > 0.02 && h.out < 0.995;
  /*
   * Fading up out of the shadow under the bush rather than switching on.
   *
   * Without this the whole animal arrived at once, fully drawn, at the foot of
   * the bush and then walked out of itself. The bush is baked into the world
   * and the hedgehog is drawn live on top of it, so it cannot actually be
   * hidden behind the leaves — this is the next best thing, and it is what
   * coming out of a shadow looks like anyway.
   */
  const showing = Math.min(1, h.out / UNDER_BUSH);
  const waddle = moving ? Math.sin(t * 11) * 1.5 : 0;
  // Once it is out and still, it sniffs. That is the whole performance.
  const sniff = moving ? 0 : Math.sin(t * 4.4) * 0.5 + Math.sin(t * 7.1) * 0.25;

  ctx.save();
  ctx.globalAlpha = showing;
  ctx.translate(h.atX, h.atY);
  ctx.rotate(waddle * 0.012);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  /*
   * Bigger than a hedgehog. Correct scale next to this walker is about ten
   * units, which at arm's length from the screen is a smudge — and a smudge you
   * waited three seconds for is worse than nothing. This is a cosy game and the
   * animal has to read.
   */
  // Mirrored to face its direction of travel. It was drawn nose-right and
  // walks left, so left uncorrected it trundled out backwards.
  ctx.scale(h.facing * 1.35, 1.35);

  /** The body: a dome, flat underneath, higher at the rump than the nose. */
  const dome = (): void => {
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.quadraticCurveTo(-12.4, -8.6, -4.6, -10.2);
    ctx.quadraticCurveTo(2.6, -11.4, 7.2, -7.4);
    ctx.quadraticCurveTo(9.6, -5.4, 10.4, 0);
    ctx.closePath();
  };

  /** The face end: a blunt cone off the front of the dome, tipped with a nose. */
  const snout = (): void => {
    ctx.beginPath();
    ctx.moveTo(7.4, -7.6);
    ctx.quadraticCurveTo(13.4, -6.6, 15.2, -2.6 + sniff * 0.3);
    ctx.quadraticCurveTo(13.6, 0, 9.4, 0);
    ctx.closePath();
  };

  /*
   * Spines, as separate strokes off the back rather than a serrated outline.
   *
   * A zigzag edge reads as a saw or a cartoon sun. Strokes leaning back off a
   * smooth dome read as prickles, and they are the whole silhouette of the
   * animal, so they get drawn in both media.
   */
  const spines = (): void => {
    for (let i = 0; i < 14; i++) {
      const p = i / 13;
      /*
       * Around the *top* of the dome, from the rump forward to the shoulder.
       *
       * Canvas y runs downwards, so the back is where sine is subtracted rather
       * than added — got this the wrong way round first time and the animal
       * came out wearing a comb under its belly.
       */
      const a = Math.PI * (0.97 - p * 0.77);
      const bx = -0.6 + Math.cos(a) * 10.4;
      const by = -2.4 - Math.sin(a) * 8;
      // Out along the surface and swept back towards the rump, longest over the
      // shoulders where the animal is highest.
      const lean = 3.2 + Math.sin(p * Math.PI) * 1.9;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(
        bx + Math.cos(a) * lean - lean * 0.55 + jitter(710 + i, 0.4),
        by - Math.sin(a) * lean,
      );
      ctx.stroke();
    }
  };

  /** Four feet, barely showing under the skirt of the body. */
  const feet = (): void => {
    for (const [i, fx] of [-6.4, -2.2, 3.4, 7].entries()) {
      const step = moving ? Math.sin(t * 11 + i * 1.6) * 0.9 : 0;
      ctx.beginPath();
      ctx.moveTo(fx, -0.6);
      ctx.lineTo(fx + step, 2.1);
      ctx.stroke();
    }
  };

  if (medium === 'color') {
    ctx.strokeStyle = SNOUT;
    ctx.lineWidth = 1.6;
    feet();

    ctx.fillStyle = SNOUT;
    snout();
    ctx.fill();

    ctx.fillStyle = SPINES;
    dome();
    ctx.fill();

    // A paler underside, so the dome is not one flat brown lump.
    ctx.save();
    dome();
    ctx.clip();
    ctx.fillStyle = FUR;
    ctx.beginPath();
    ctx.ellipse(-1, -0.6, 10.6, 3.4, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = SPINE_TIP;
    ctx.lineWidth = 1.5;
    spines();

    // The nose, and one small eye. Both are most of the face.
    ctx.fillStyle = NOSE;
    ctx.beginPath();
    ctx.arc(15.1, -2.6 + sniff * 0.3, 1.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = EYE;
    ctx.beginPath();
    ctx.arc(8.4, -6.2, 1.15, 0, TAU);
    ctx.fill();
    // The catchlight is what turns a dot into an eye.
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.arc(8.8, -6.6, 0.42, 0, TAU);
    ctx.fill();
  } else {
    ink(ctx, 0.34, 1.1);
    snout();
    ctx.stroke();
    dome();
    ctx.stroke();
    ink(ctx, 0.3, 1);
    spines();
    feet();
    ink(ctx, 0.42, 1.4);
    ctx.beginPath();
    ctx.arc(15.1, -2.6, 1.2, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(8.4, -6.2, 0.9, 0, TAU);
    ctx.stroke();
  }

  ctx.restore();
}
