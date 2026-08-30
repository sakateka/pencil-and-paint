import { TAU } from '../core/math';
import { rnd, rr } from '../core/rng';
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

/** How long you must lie still before it dares to leave the bush. */
const WAIT_ON_HAY = 5;

/** How long it takes to cover the whole little path. */
const EMERGING = 3.4;

/** How far the old straight patrol reached from the bush. */
const VENTURE = 34;
const OLD_PATH_X = -VENTURE * 0.9;
const OLD_PATH_Y = VENTURE;

/**
 * A circular patch whose diameter is exactly the length of that old path.
 * The bush and the old far endpoint sit at opposite edges of the circle.
 */
const PATCH_DIAMETER = Math.hypot(OLD_PATH_X, OLD_PATH_Y);
const PATCH_RADIUS = PATCH_DIAMETER / 2;
const PATCH_CENTRE_X = OLD_PATH_X / 2;
const PATCH_CENTRE_Y = OLD_PATH_Y / 2;
const PATROL_SPEED = PATCH_DIAMETER / EMERGING;
const MIN_WALK = 8;

/** Like the livestock, it spends longer standing around than walking. */
const PATROL_PAUSE = [2.5, 5] as const;

/**
 * And how long it takes to wander back.
 *
 * Slower than coming out, not quicker. It bolted at first, which made standing
 * up feel like frightening it — and the whole point of the animal is that you
 * did the right thing by being still. It has no reason to panic; it just
 * eventually has somewhere else to be.
 */
const RETREAT = 6;
const RETREAT_SPEED = PATCH_DIAMETER / RETREAT;

/**
 * How long it stays out after you get up.
 *
 * Standing up does not send it away. It carries on with whatever it was doing
 * for a while first, and only then thinks better of the open ground.
 */
const LINGER = 1.8;

/** How far into coming out it is still in the shadow under the bush. */
const UNDER_BUSH = 0.22;
const MIN_FROM_BUSH = PATCH_DIAMETER * UNDER_BUSH;

const SPINES = '#7b6047';
const SPINE_TIP = '#a48160';
const SNOUT = '#b8926b';
const NOSE = '#2f2723';
const EYE = '#2f2723';

/** The two approved drawings, chosen afresh for each new world. */
export type HedgehogLook = 'field' | 'hybrid';

export class Hedgehog {
  /** Which of the two approved drawing treatments this world received. */
  look: HedgehogLook = 'field';

  /** How far out of the bush it is: 0 hidden, 1 all the way. */
  out = 0;

  /** Its own clock, which only runs while the colour has reached it. */
  clock = 0;

  /** Whether the colour has reached it. */
  lit = false;

  /** Whether it has ever shown itself this session. */
  seen = false;

  /** Which way it is pointed: -1 nose towards the hay, +1 back at the bush. */
  facing = -1;

  /** Whether its feet are moving this frame. */
  moving = false;

  /** Seconds since the walker got up, for the pause before it goes. */
  private idle = 0;

  /** Uninterrupted seconds spent lying on the hay. */
  private lyingFor = 0;

  /** Its actual position and current destination inside the circular patch. */
  private positionX: number;
  private positionY: number;
  private targetX: number;
  private targetY: number;
  private hasTarget = false;

  /** Seconds left to stand and sniff at the end of its little walk. */
  private patrolPause = 0;

  /** Whether getting up has started its final walk home. */
  private retreating = false;

  constructor(
    /** The bush it lives under. */
    readonly x: number,
    readonly y: number,
  ) {
    this.positionX = this.targetX = x;
    this.positionY = this.targetY = y;
  }

  reset(): void {
    this.look = rr(0, 1) < 0.5 ? 'field' : 'hybrid';
    this.out = 0;
    this.clock = 0;
    this.seen = false;
    this.facing = -1;
    this.moving = false;
    this.idle = 0;
    this.lyingFor = 0;
    this.positionX = this.targetX = this.x;
    this.positionY = this.targetY = this.y;
    this.hasTarget = false;
    this.patrolPause = 0;
    this.retreating = false;
  }

  /** Where it actually is, having come this far out. */
  get atX(): number {
    return this.positionX;
  }

  get atY(): number {
    return this.positionY;
  }

  /** Pick a point uniformly by area, exactly as livestock choose pasture spots. */
  private beginPatrol(): void {
    const centreX = this.x + PATCH_CENTRE_X;
    const centreY = this.y + PATCH_CENTRE_Y;
    let targetX = centreX;
    let targetY = centreY;

    // Do not accept a useless shuffle or a stop still underneath the bush.
    // Rejection does not bias the remaining patch; it only cuts those holes
    // out of the same uniform disk used by cows and sheep.
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = rnd() * TAU;
      const distance = Math.sqrt(rnd()) * PATCH_RADIUS;
      targetX = centreX + Math.cos(angle) * distance;
      targetY = centreY + Math.sin(angle) * distance;
      if (
        Math.hypot(targetX - this.positionX, targetY - this.positionY) >= MIN_WALK &&
        Math.hypot(targetX - this.x, targetY - this.y) >= MIN_FROM_BUSH
      ) {
        break;
      }
    }

    this.targetX = targetX;
    this.targetY = targetY;
    this.hasTarget = true;
    if (Math.abs(targetX - this.positionX) > 1) {
      this.facing = targetX < this.positionX ? -1 : 1;
    }
  }

  /** Walk home from the exact point where the player stopped watching. */
  private beginRetreat(): void {
    this.targetX = this.x;
    this.targetY = this.y;
    this.hasTarget = true;
    this.retreating = true;
    if (Math.abs(this.x - this.positionX) > 1) {
      this.facing = this.x < this.positionX ? -1 : 1;
    }
  }

  /** Move at a livestock-like constant pace and report arrival. */
  private walk(dt: number, speed: number): boolean {
    const dx = this.targetX - this.positionX;
    const dy = this.targetY - this.positionY;
    const distance = Math.hypot(dx, dy);
    const step = speed * dt;
    this.moving = true;

    if (distance <= step || distance < 0.001) {
      this.positionX = this.targetX;
      this.positionY = this.targetY;
      this.hasTarget = false;
      this.moving = false;
      this.updateDistance();
      return true;
    }

    this.positionX += (dx / distance) * step;
    this.positionY += (dy / distance) * step;
    this.updateDistance();
    return false;
  }

  /** `out` remains the reveal amount and distance home, not a patrol rail. */
  private updateDistance(): void {
    this.out = Math.min(1, Math.hypot(this.positionX - this.x, this.positionY - this.y) / PATCH_DIAMETER);
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

    let arrived = false;
    this.moving = false;
    if (lying) {
      this.idle = 0;
      this.lyingFor += dt;

      // If somebody lies back down while it is leaving, it first settles in
      // place. Its next decision will be to turn back out into the grass.
      if (this.retreating) {
        this.retreating = false;
        this.hasTarget = false;
        this.patrolPause = rr(PATROL_PAUSE[0], PATROL_PAUSE[1]);
      }

      // Five full seconds of stillness first. After that it ambles along the
      // same small patch, like the livestock wandering around their pasture.
      if (this.lyingFor >= WAIT_ON_HAY) {
        if (this.patrolPause > 0) {
          this.patrolPause = Math.max(0, this.patrolPause - dt);
        }
        if (this.patrolPause === 0) {
          if (!this.hasTarget) this.beginPatrol();
          if (this.walk(dt, PATROL_SPEED)) {
            this.patrolPause = rr(PATROL_PAUSE[0], PATROL_PAUSE[1]);
            if (!this.seen) {
              this.seen = true;
              arrived = true;
            }
          }
        }
      }
    } else {
      this.lyingFor = 0;
      this.patrolPause = 0;
      this.idle += dt;
      if (this.idle > LINGER && this.out > 0) {
        if (!this.retreating) this.beginRetreat();
        if (this.walk(dt, RETREAT_SPEED)) {
          this.out = 0;
          this.retreating = false;
          this.facing = -1;
        }
      }
    }

    return arrived;
  }
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
  const moving = h.moving;
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

  if (h.look === 'hybrid') {
    drawHybridHedgehog(ctx, medium, moving, t, sniff);
    ctx.restore();
    return;
  }

  /** A tucked underside and small points across the back: low, but not a melon. */
  const dome = (): void => {
    ctx.beginPath();
    ctx.moveTo(-11.8, -0.4);
    ctx.quadraticCurveTo(-13.1, -5.9, -9.9, -9);
    ctx.lineTo(-10.5, -11.1);
    ctx.lineTo(-7.8, -10.3);
    ctx.lineTo(-6.7, -12.1);
    ctx.lineTo(-3.9, -11.2);
    ctx.lineTo(-2.1, -12.8);
    ctx.lineTo(0.3, -11.5);
    ctx.lineTo(2.4, -12.3);
    ctx.lineTo(4.3, -10.5);
    ctx.quadraticCurveTo(9.1, -8.2, 10.4, -1.8);
    ctx.quadraticCurveTo(0.2, -0.3, -11.8, -0.4);
    ctx.closePath();
  };

  /** A small rounded face, tucked into the quill coat rather than stuck onto it. */
  const snout = (): void => {
    ctx.beginPath();
    ctx.moveTo(4.7, -7.8);
    ctx.quadraticCurveTo(8.2, -8.7, 11.8, -3.2 + sniff * 0.22);
    ctx.quadraticCurveTo(10.8, -1.35, 7.5, -1.45);
    ctx.quadraticCurveTo(5.2, -3.5, 4.7, -7.8);
    ctx.closePath();
  };

  /** The quill coat comes forward over the crown, as it does on the reference. */
  const crown = (): void => {
    ctx.beginPath();
    ctx.moveTo(2.2, -11.2);
    ctx.quadraticCurveTo(6.3, -11.7, 8.8, -8.5);
    ctx.quadraticCurveTo(7.3, -7.4, 5.4, -6.8);
    ctx.quadraticCurveTo(3.8, -9.4, 2.2, -11.2);
    ctx.closePath();
  };

  /** Short quill marks contained by the round silhouette: prickly, not a mohawk. */
  const spines = (): void => {
    const quills: readonly (readonly [number, number, number])[] = [
      [-9.6, -5.1, -1], [-7.5, -9, -0.7], [-4.5, -10.8, -0.4], [-1.2, -11.1, -0.1],
      [1.8, -10.1, 0.2], [-10.1, -2.3, -0.9], [-7.2, -5.9, -0.6], [-4.1, -7.7, -0.3],
      [-0.9, -8.2, 0], [1.8, -7, 0.25], [-6.8, -2.8, -0.55], [-3.6, -4.6, -0.25],
      [-0.2, -5, 0.05], [2.2, -3.7, 0.3],
    ];
    for (const [i, [x, y, lean]] of quills.entries()) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2.7 + jitter(710 + i, 0.25), y + lean * 0.75);
      ctx.stroke();
    }
  };

  /** Only the tips of the paws peek out, and only while it is taking a step. */
  const walkingFeet = (): void => {
    if (!moving) return;
    for (const [i, fx] of [-6.8, -2.4, 3.2, 6.8].entries()) {
      const step = Math.sin(t * 11 + i * 1.6) * 0.55;
      ctx.beginPath();
      ctx.moveTo(fx, -0.1);
      ctx.lineTo(fx + step, 1.35);
      ctx.stroke();
    }
  };

  if (medium === 'color') {
    ctx.strokeStyle = SNOUT;
    ctx.lineWidth = 1.35;
    walkingFeet();

    ctx.fillStyle = SPINES;
    dome();
    ctx.fill();

    ctx.strokeStyle = SPINE_TIP;
    ctx.lineWidth = 1.25;
    spines();

    ctx.fillStyle = SNOUT;
    snout();
    ctx.fill();

    ctx.fillStyle = SPINES;
    crown();
    ctx.fill();

    // The nose, and one small eye. Both are most of the face.
    ctx.fillStyle = NOSE;
    ctx.beginPath();
    ctx.arc(11.8, -3.2 + sniff * 0.22, 1.15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = EYE;
    ctx.beginPath();
    ctx.arc(8.2, -4.85, 1.2, 0, TAU);
    ctx.fill();
    // The catchlight is what turns a dot into an eye.
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.arc(8.6, -5.25, 0.55, 0, TAU);
    ctx.fill();
  } else {
    ink(ctx, 0.34, 1.1);
    walkingFeet();
    dome();
    ctx.stroke();
    ink(ctx, 0.3, 1);
    spines();
    snout();
    ctx.stroke();
    crown();
    ctx.stroke();
    ink(ctx, 0.42, 1.4);
    ctx.beginPath();
    ctx.arc(11.8, -3.2, 0.95, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(8.2, -4.85, 0.9, 0, TAU);
    ctx.stroke();
  }

  ctx.restore();
}

/** Cartoon coat with the smaller, darker face and forehead of `tmp/ezik.png`. */
function drawHybridHedgehog(
  ctx: CanvasRenderingContext2D,
  medium: Medium,
  moving: boolean,
  t: number,
  sniff: number,
): void {
  const coat = (): void => {
    const points: readonly (readonly [number, number])[] = [
      [-12, -0.4], [-12.8, -5.2], [-10.8, -6.7], [-12, -8.5], [-9.3, -8.3],
      [-9.5, -11.1], [-7.1, -9.8], [-6.1, -12.2], [-3.8, -10.6], [-2, -12.7],
      [0, -10.9], [2.4, -12], [3.5, -9.8], [6.2, -10.1], [5.5, -7.8],
      [8.2, -7.1], [6.7, -5.5], [9.2, -4], [7.2, -2.8], [8.2, -1.1],
    ];
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.quadraticCurveTo(-0.5, -0.2, -12, -0.4);
    ctx.closePath();
  };
  const face = (): void => {
    ctx.beginPath();
    ctx.moveTo(4.4, -7.6);
    ctx.quadraticCurveTo(8.3, -8.1, 12.1, -3.1 + sniff * 0.2);
    ctx.quadraticCurveTo(10.7, -1.25, 7.1, -1.35);
    ctx.quadraticCurveTo(5.1, -3.4, 4.4, -7.6);
    ctx.closePath();
  };
  const crown = (): void => {
    ctx.beginPath();
    ctx.moveTo(1.8, -10.8);
    ctx.lineTo(4, -10.2);
    ctx.lineTo(4.8, -9.2);
    ctx.lineTo(6.1, -9.5);
    ctx.lineTo(6.4, -8.2);
    ctx.lineTo(8, -8.1);
    ctx.lineTo(7.1, -6.8);
    ctx.lineTo(5.2, -6.4);
    ctx.quadraticCurveTo(3.8, -8.8, 1.8, -10.8);
    ctx.closePath();
  };
  const marks = (): void => {
    const lines: readonly (readonly [number, number, number, number])[] = [
      [-8.5, -7.5, -6.2, -8.4], [-5.1, -9.2, -2.8, -10], [-1.4, -8.4, 1, -8.8],
      [2.1, -7, 4.4, -6.5], [-8.6, -4.2, -6.2, -4.8], [-4.8, -5.7, -2.2, -5.9],
      [-1.2, -4.7, 1.2, -4.3], [2.5, -3.5, 4.5, -2.8], [-5.6, -2.5, -3.2, -2.8],
    ];
    for (const [x0, y0, x1, y1] of lines) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 0.5, x1, y1);
      ctx.stroke();
    }
  };
  const feet = (): void => {
    if (!moving) return;
    for (const [i, x] of [-6.2, -2.1, 3, 6].entries()) {
      const step = Math.sin(t * 11 + i * 1.5) * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, -0.1);
      ctx.lineTo(x + step, 1.25);
      ctx.stroke();
    }
  };

  if (medium === 'color') {
    ctx.strokeStyle = '#c9904d';
    ctx.lineWidth = 1.25;
    feet();
    ctx.fillStyle = '#985526';
    coat();
    ctx.fill();
    ctx.strokeStyle = '#6e3d20';
    ctx.lineWidth = 1.1;
    marks();
    ctx.fillStyle = '#8d6d53';
    face();
    ctx.fill();

    // The coat reaches over the forehead, like the real hedgehog reference.
    ctx.fillStyle = '#985526';
    crown();
    ctx.fill();

    ctx.fillStyle = '#251d1a';
    ctx.beginPath();
    ctx.arc(8.25, -4.75, 1.05, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(12.1, -3.1 + sniff * 0.2, 1.05, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.beginPath();
    ctx.arc(8.58, -5.08, 0.42, 0, TAU);
    ctx.fill();
    return;
  }

  ink(ctx, 0.35, 1.05);
  feet();
  coat();
  ctx.stroke();
  ink(ctx, 0.26, 0.8);
  marks();
  face();
  ctx.stroke();
  crown();
  ctx.stroke();
  ink(ctx, 0.42, 1.15);
  ctx.beginPath();
  ctx.arc(8.25, -4.75, 0.8, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(12.1, -3.1, 0.9, 0, TAU);
  ctx.stroke();
}
