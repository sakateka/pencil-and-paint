import { clamp, TAU } from '../core/math';
import { ink, inkArc, inkLine, inkLines, jitter } from '../media/ink';
import type { Medium } from '../media/medium';
import { groundShadow } from '../media/pencil';

/**
 * The stump in the northern wood, and what turns up if you wait by it.
 *
 * Sitting still is a long time to ask anyone to do nothing, and that is the
 * whole point: nothing else here is on a clock, and the one thing that is asks
 * for patience rather than for walking further. Stand up and it goes away
 * again.
 *
 * The elephant is from one of the paintings — dark brown, blocky, a striped
 * trunk, green eyes and red toenails — and there is nothing in this valley to
 * explain it. There does not need to be.
 */

/**
 * How long the cloud takes to become an elephant.
 *
 * Not a wait followed by an arrival — the ten seconds *are* the arrival. Sit
 * down and the shape in the sky begins resolving that instant and goes on
 * resolving the whole time you stay put, so there is never a stretch where
 * nothing is happening and you are simply being made to hold still.
 *
 * It was two minutes of nothing and then a three-second fade, which is the same
 * feature with all the pleasure taken out of it.
 */
export const VIGIL_SECONDS = 10;

/**
 * Seconds it takes to come apart again when you stand up.
 *
 * Nearly as long as it took to arrive. Two seconds was a light going out — you
 * stood up and it was simply gone, which made ten seconds of watching it gather
 * feel like it had been wasted.
 */
const LEAVING = 7;

/** How much of the cloud is there when nothing else is. Barely anything. */
const RESTING_CLOUD = 0.34;

/**
 * Shared by the elephant and the cloud it condenses out of.
 *
 * Keep this as one value: the two drawings occupy the same silhouette during
 * the transformation. Scaling either one independently makes the animal jump
 * in size halfway through its arrival.
 */
export const ELEPHANT_MIRAGE_SCALE = 4;

/** How far the cloud rides up and down on its own breath. */
const MIRAGE_BOB = 8 + 4.6;

/** The bob, which the body and the cloud both ride. Zero at the top. */
export function mirageBobAt(clock: number): number {
  return 8 + Math.sin(clock * 0.62) * 4.6;
}

/**
 * Lobes laid along the animal rather than heaped in a pile.
 *
 * A generic puff said "something is happening here". Tracing the body, the
 * head, the trunk and the four legs says "an elephant is happening here" —
 * which is the better hint, and is the kind of thing anybody has seen a cloud
 * do. Deliberately loose: it should be arguable, not obvious.
 *
 * Up here at module scope rather than inside the drawing, because how far the
 * cloud reaches is a question the game asks — see `MIRAGE_REACH` — and because
 * the baked picture of the cloud (`render/looks/mirage.ts`) is this same list
 * of lobes, drawn once and bent from then on.
 */
export const MIRAGE_LOBES = [
  [-2, -29, 15],
  [16, -27, 12],
  [-18, -28, 12],
  [24, -23, 10],
  [-6, -20, 13],
  [12, -19, 11],
  // Head, ears and the trunk hanging off the front.
  [-30, -35, 11],
  [-26, -44, 8],
  [-33, -22, 7],
  [-32, -11, 6],
  // Four legs.
  [-20, -11, 6],
  [-10, -10, 5],
  [13, -11, 5],
  [21, -10, 6],
] as const;

/**
 * How far the mirage reaches from its own origin, at full size.
 *
 * Measured off the lobes rather than guessed at, so that moving a leg or
 * changing the scale cannot quietly leave this behind. What it is for: the
 * cloud may only breathe when the colour covers all of it, and "all of it" is
 * this. A point test at the origin is not the same question — the drawing is
 * most of six hundred units across, and the colour reaches four hundred at its
 * widest, so the middle can be well inside the colour while the trunk is still
 * out in the graphite.
 */
export const MIRAGE_REACH = Math.max(
  ...MIRAGE_LOBES.map(([lx, ly, r]) => Math.hypot(lx, ly - MIRAGE_BOB) + r),
) * ELEPHANT_MIRAGE_SCALE;

const SKIN = '#f2c398';

/**
 * How much cloud there is, from how far the elephant has arrived.
 *
 * At rest there is always a hint of it — `RESTING_CLOUD` — and while the
 * animal gathers the cloud thickens, then burns off again as the animal
 * resolves. The one number both the old drawing and the baked one ask for.
 */
export function mirageAmount(elephant: number): number {
  const here = clamp(elephant, 0, 1);
  const gathering = Math.min(here / 0.22, 1) * clamp((0.92 - here) / 0.46, 0, 1);
  return RESTING_CLOUD + gathering * 0.62;
}
const HAIR = '#4a3527';
const SHIRT = '#e8563f';
const SHIRT_SHADE = '#c9452f';
const TROUSERS = '#3a5a86';
const SCARF = '#f7c14b';
const EYE = '#3a2f26';

export class Vigil {
  sitting = false;

  /** Seconds sat, which goes back to nothing the moment you stand up. */
  clock = 0;

  /** How far the elephant has arrived: 0 nothing there, 1 fully here. */
  elephant = 0;

  /** Whether it has ever shown itself this session. */
  seen = false;

  /**
   * Whether the colour has reached the elephant.
   *
   * Its ear and its tail move on `beastClock`, and out in the graphite they
   * must not: everything else in this valley holds perfectly still once the
   * colour has left it, because it is a drawing again.
   */
  lit = false;

  /** The elephant's own clock, for the ear and the tail. Runs while it is here. */
  beastClock = 0;

  constructor(
    readonly x: number,
    readonly y: number,
    readonly elephantX: number,
    readonly elephantY: number,
  ) {}

  sitDown(): void {
    this.sitting = true;
  }

  getUp(): void {
    this.sitting = false;
    this.clock = 0;
  }

  reset(): void {
    this.getUp();
    this.elephant = 0;
    this.beastClock = 0;
    this.seen = false;
  }

  /** How far through the wait you are, for anything that wants to hint at it. */
  get patience(): number {
    return clamp(this.clock / VIGIL_SECONDS, 0, 1);
  }

  /**
   * Steps the wait on, and answers true on the frame it first shows itself.
   *
   * `mayArrive` is the whole map being coloured. Until then the stump is only
   * somewhere to sit: nothing in this valley happens where the colour has not
   * reached, and the animal turns up four hundred and seventy units from the
   * seat — out in the graphite, at every stage of the game but the last.
   */
  update(dt: number, mayArrive: boolean): boolean {
    /*
     * The beast's clock runs whenever the colour is on that patch of sky, not
     * only when the animal is there: the cloud it comes out of is always there
     * and drifts on the same clock. Frozen out of the colour, like everything.
     */
    if (this.lit) this.beastClock += dt;

    if (!this.sitting || !mayArrive) {
      this.elephant = Math.max(0, this.elephant - dt / LEAVING);
      // Time sat before the map is finished counts for nothing, so the wait
      // begins at zero when it finally does — not part-way through.
      if (!mayArrive) this.clock = 0;
      return false;
    }

    // Straight off the clock: every second sitting there is a second more of
    // elephant and a second less of cloud.
    this.clock += dt;
    const before = this.elephant;
    this.elephant = Math.min(1, this.clock / VIGIL_SECONDS);
    const arrived = before < 1 && this.elephant >= 1;
    if (arrived) this.seen = true;
    return arrived;
  }
}

/**
 * The stump.
 *
 * Drawn at its own origin, for the picture library to bake once and place —
 * the stump never changes, and a canvas this size was being repainted twelve
 * times a second for a drawing that has nothing to say. Whoever is sitting on
 * it is a separate picture; see `drawSitter`.
 */
export function drawStump(ctx: CanvasRenderingContext2D, medium: Medium): void {
  groundShadow(ctx, 0, 2, 17, 6, medium, true);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (medium === 'color') {
    // The side of it, then the cut face on top, then the rings.
    ctx.fillStyle = '#6b4a32';
    ctx.beginPath();
    ctx.moveTo(-13, -9);
    ctx.lineTo(-12.4, -1);
    ctx.quadraticCurveTo(0, 3.4, 12.4, -1);
    ctx.lineTo(13, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a8845c';
    ctx.beginPath();
    ctx.ellipse(0, -9.5, 13, 5.2, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,63,42,.55)';
    ctx.lineWidth = 0.9;
    for (const r of [0.32, 0.58, 0.82]) {
      ctx.beginPath();
      ctx.ellipse(-0.8, -9.5, 13 * r, 5.2 * r, 0, 0, TAU);
      ctx.stroke();
    }
    // Bark, one or two vertical splits.
    ctx.strokeStyle = 'rgba(58,40,26,.5)';
    ctx.lineWidth = 1;
    for (const bx of [-7, 2.5, 8]) {
      ctx.beginPath();
      ctx.moveTo(bx, -8.4);
      ctx.lineTo(bx + 0.8, -1.4);
      ctx.stroke();
    }
  } else {
    const k = 5300;
    ink(ctx, 0.55, 1.15);
    ctx.beginPath();
    ctx.ellipse(jitter(k, 0.5), -9.5 + jitter(k + 1, 0.5), 13, 5.2, 0, 0, TAU);
    ctx.stroke();
    inkLines(
      ctx,
      [
        [-13, -9, -12.4, -1],
        [13, -9, 12.4, -1],
      ],
      k + 4,
    );
    ink(ctx, 0.45, 1);
    ctx.beginPath();
    ctx.moveTo(-12.4, -1);
    ctx.quadraticCurveTo(0, 3.4, 12.4, -1);
    ctx.stroke();
    ink(ctx, 0.3, 0.75);
    for (const r of [0.34, 0.62, 0.86]) {
      ctx.beginPath();
      ctx.ellipse(-0.8, -9.5, 13 * r, 5.2 * r, 0, 0, TAU);
      ctx.stroke();
    }
    for (const bx of [-7, 2.5, 8]) inkLine(ctx, bx, -8.4, bx + 0.8, -1.4, k + 20 + bx);
  }
}

/**
 * The walker, sat down with their knees up.
 *
 * Exported, because the bench wants exactly the same figure — one drawing of
 * this person sitting, used wherever they sit.
 *
 * Drawn here rather than by `drawWalker`, the same way the sleeper in the
 * hammock is: the standing figure would otherwise be planted through the middle
 * of the stump, and a person sitting is not a person standing with a shorter
 * gap between their feet.
 *
 * Drawn about the seat — the point their hips rest on — and about the way they
 * face, `face` being ±1: the mirror is part of the drawing, and the caller's
 * offset (the bench's seat is twenty above its origin, the stump's seat is the
 * stump) stays with the caller.
 */
export function drawSitter(
  ctx: CanvasRenderingContext2D,
  face: -1 | 1,
  medium: Medium,
): void {
  /*
   * Built off the standing walker's own proportions, because the first version
   * of this was not: its head was a 4.6 disc where the walker's is 9.2, so
   * sitting down halved them. Hips at the seat, shoulders twelve above, head
   * centre ten above that — the same spacing `player.ts` uses standing.
   */
  ctx.save();
  ctx.translate(-face, -10);
  ctx.scale(face, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (medium === 'color') {
    // Legs: thigh forward off the seat, shin down to the ground.
    ctx.strokeStyle = '#33507a';
    ctx.lineWidth = 6.4;
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(9.5, -1.5);
    ctx.lineTo(11.5, 9);
    ctx.stroke();
    ctx.strokeStyle = TROUSERS;
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.lineTo(11, 0.5);
    ctx.lineTo(13.5, 10.5);
    ctx.stroke();
    ctx.strokeStyle = '#4a3b30';
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(11.5, 9.6);
    ctx.lineTo(15.5, 10.2);
    ctx.moveTo(13.5, 11);
    ctx.lineTo(17.5, 11.6);
    ctx.stroke();

    // Body, leaning back the way you do when you have stopped walking.
    ctx.fillStyle = SHIRT;
    ctx.beginPath();
    ctx.moveTo(-5.4, 0.5);
    ctx.quadraticCurveTo(-7.4, -7, -5.6, -13);
    ctx.lineTo(4.4, -12);
    ctx.quadraticCurveTo(6, -6, 5.2, 0.5);
    ctx.closePath();
    ctx.fill();
    // The scarf, which is what says it is the same person.
    ctx.strokeStyle = SCARF;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-5.2, -11.4);
    ctx.quadraticCurveTo(0, -9.4, 4.6, -11);
    ctx.stroke();
    // An arm, propped back on the stump.
    ctx.strokeStyle = SHIRT_SHADE;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(-4.4, -10.5);
    ctx.quadraticCurveTo(-9.5, -6, -9, -0.5);
    ctx.stroke();
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(-9, 0.6, 2.6, 0, TAU);
    ctx.fill();

    /*
     * Head: the walker's own, at the walker's own size, and their own haircut —
     * a fringe rather than a helmet. Drawn as a plain arc it swallowed the
     * whole face and left a pale band under a brown lump.
     */
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(1, -22, 9.2, 0, TAU);
    ctx.fill();
    // The haircut and the eye at exactly the offsets `player.ts` uses, so it is
    // recognisably the same person and not a doll of them.
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.arc(1, -22.5, 9.4, Math.PI * 0.98, Math.PI * 2.12);
    ctx.quadraticCurveTo(7, -20, 9.6, -18.5);
    ctx.quadraticCurveTo(5, -21.5, -1, -20.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = EYE;
    ctx.beginPath();
    ctx.arc(5.2, -21.6, 1.25, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(230,140,120,.35)';
    ctx.beginPath();
    ctx.arc(7.2, -19.6, 2.2, 0, TAU);
    ctx.fill();
  } else {
    const k = 5400;
    ink(ctx, 0.5, 1.25);
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.lineTo(11 + jitter(k, 0.5), 0.5);
    ctx.lineTo(13.5, 10.5);
    ctx.moveTo(0, -1);
    ctx.lineTo(9.5, -1.5);
    ctx.lineTo(11.5 + jitter(k + 1, 0.5), 9);
    ctx.stroke();
    ink(ctx, 0.55, 1.3);
    ctx.beginPath();
    ctx.moveTo(-5.4 + jitter(k + 2, 0.5), 0.5);
    ctx.quadraticCurveTo(-7.4, -7, -5.6, -13);
    ctx.lineTo(4.4, -12);
    ctx.quadraticCurveTo(6, -6, 5.2, 0.5);
    ctx.closePath();
    ctx.stroke();
    ink(ctx, 0.45, 1.1);
    ctx.beginPath();
    ctx.moveTo(-4.4, -10.5);
    ctx.quadraticCurveTo(-9.5, -6, -9, -0.5);
    ctx.stroke();
    ink(ctx, 0.55, 1.25);
    inkArc(ctx, 1, -22, 9.2, k + 8);
    // Hair, hatched rather than filled, as everywhere else in graphite.
    ink(ctx, 0.34, 0.9);
    inkLines(
      ctx,
      [0, 1, 2, 3, 4].map((i) => [-6.6 + i * 3, -29.4, -4.6 + i * 3, -24.4] as const),
      k + 14,
    );
  }
  ctx.restore();
}

/**
 * The elephant, from the painting.
 *
 * Side on and facing left, dark brown and blocky, with the ears set high on the
 * head, a long trunk hanging down with stripes across it, small green eyes and
 * red toenails. Nothing about it is to scale with anything else here, which is
 * true of the painting too.
 *
 * Drawn in the animal's own small units, at its own origin, for the picture
 * library (`render/looks/mirage.ts`) to bake once and then move by transform —
 * the way every animal in the herd is drawn. What used to be the per-frame
 * drawing here kept repainting a canvas the size of the whole mirage for
 * motion that was never a new picture: the bob is a position, the heat
 * shimmer is a lean, the arrival is an alpha, and the tail is one picture
 * swung about its root.
 */

/** Where the tail is rooted, in the animal's own units. See `drawElephantTail`. */
export const ELEPHANT_TAIL_ROOT = { x: 22.5, y: -32 } as const;

/**
 * The body: toenails, legs, both ears, body, head and trunk.
 *
 * Everything that never changes. It used to include the near ear's slow flap
 * (±0.09 rad about every eight seconds, three pixels at the tip); a flap is a
 * rotation of one part, and one part of a translucent whole cannot rotate as a
 * sprite without compositing against the body it overlaps — the seam problem
 * the one-path fill below exists to prevent. Three pixels a week is not worth
 * reintroducing it. The tail still moves; see `drawElephantTail`.
 */
export function drawElephantBody(ctx: CanvasRenderingContext2D, medium: Medium): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  /*
   * The shape, measured off the painting rather than remembered.
   *
   * What makes it that elephant and not a generic one: the body is a deep slab
   * with a domed back, not an oval; the head and the trunk are a single tall
   * mass hanging off the front of it, and the trunk is nearly as wide as the
   * head. The first version had a tail — it was simply drawn inside the body
   * outline, so nobody ever saw it.
   */
  const body = () => {
    ctx.moveTo(-27, -15);
    ctx.quadraticCurveTo(-29, -33, -16, -37);
    ctx.quadraticCurveTo(2, -41, 18, -37);
    ctx.quadraticCurveTo(27, -33, 26, -15);
    ctx.quadraticCurveTo(0, -11, -27, -15);
    ctx.closePath();
  };

  /*
   * Head and trunk, filled as two paths rather than two subpaths of one.
   *
   * As one path they punched a hole in each other: canvas fills by the non-zero
   * winding rule, and the two loops happened to run in opposite directions, so
   * where the trunk met the head the overlap was cut straight out and the face
   * had a gap in it.
   */
  const head = () => {
    ctx.moveTo(-22, -24);
    ctx.quadraticCurveTo(-40, -26, -38, -38);
    ctx.quadraticCurveTo(-36, -47, -27, -46);
    ctx.quadraticCurveTo(-20, -45, -20, -34);
    ctx.closePath();
  };

  /**
   * Wide at the top, barely tapering, hanging almost to the ground.
   *
   * Wound the same way round as everything else, deliberately. All of these go
   * into one path and are filled in one go, and the non-zero rule cuts a hole
   * wherever two overlapping loops disagree about their direction. This one
   * used to run the other way, which is what put a hole through the face.
   */
  const trunk = () => {
    ctx.moveTo(-26, -33);
    ctx.quadraticCurveTo(-27.5, -19, -28, -3.4);
    ctx.quadraticCurveTo(-31.5, -0.8, -35, -3);
    ctx.quadraticCurveTo(-38, -18, -37, -34);
    ctx.closePath();
  };

  /*
   * Four legs, and the back pair stop short of the front pair's feet.
   *
   * Straight off the painting, where the hind feet sit a good way higher up the
   * page than the fore feet. It is not perspective and it is not a mistake —
   * it is what makes the animal look as though it is barely touching the
   * ground, which is the whole character of the drawing.
   *
   * Set well apart, too, with daylight between each pair. Butted together they
   * read as two slabs rather than four legs, and in the painting you can see
   * the sky between them.
   *
   * Each entry is the leg's centre, its width, and how far down its foot goes.
   */
  const legs = [
    [-21, 8, -1.5],
    [-11, 7.5, -2.4],
    [13, 7.5, -7],
    [21, 8, -6.2],
  ] as const;

  if (medium === 'color') {
    /*
     * Elephant grey with a dirty blue in it.
     *
     * Not what the paint measures. Inside the outline it is `#40392C` — a
     * desaturated dark grey-olive, only twenty points between the channels —
     * and rendered at exactly that value it still read as a brown animal,
     * because the painting only makes it look cool by setting it against a blue
     * sky and this sets it on green grass. So it is pulled to where the eye
     * expects an elephant to be: a dirty grey. Barely any blue in the end —
     * a properly blue-grey came out looking like slate roofing, and what reads
     * as elephant is a muddy near-neutral with the faintest cool cast.
     */
    const hideColour = '#4e4e48';

    /*
     * Toenails under the feet, so the legs cover their tops.
     *
     * Sampled off the painting: the paint is a coral, `srgb(236,96,82)`, which
     * reads far pinker than the flat red I first put here and rather redder
     * than the pink I replaced it with.
     */
    ctx.fillStyle = '#ec6052';
    for (const [fx, w, foot] of legs) {
      for (const n of [-1, 0, 1]) {
        ctx.beginPath();
        // Big and round. Small ones read as a serrated red fringe along the
        // bottom of each leg rather than as toes.
        ctx.ellipse(fx + n * (w / 2.7), foot + 0.1, w / 5.2, 3.1, 0, 0, TAU);
        ctx.fill();
      }
    }

    /*
     * The whole animal as one path, filled once.
     *
     * This is the difference between it fading in and it *materialising*. Drawn
     * as separate shapes it looked fine at full opacity and horrible at every
     * value in between: each leg, the head, the trunk and both ears composited
     * against the body separately, so half way through the arrival you could
     * see straight through the body to the outline of everything inside it. One
     * path means one fill, and one fill means every pixel is painted exactly
     * once whatever the opacity happens to be — and it is what lets the fade
     * itself be the sprite's alpha now.
     */
    ctx.beginPath();
    for (const [fx, w, foot] of legs) ctx.rect(fx - w / 2, -18, w, 18 + foot);
    // The far ear, behind everything. `moveTo` first: `ellipse` would otherwise
    // run a chord from the last leg's corner into it.
    ctx.moveTo(-33 + 7.4, -43);
    ctx.ellipse(-33, -43, 7.4, 8.4, -0.2, 0, TAU);
    body();
    head();
    trunk();
    // The near ear, leaning as it listens. Rotated in the path rather than by
    // the canvas, so that it can join the rest of it.
    ctx.moveTo(-25.5 + 8.2, -44);
    ctx.ellipse(-25.5, -44, 8.2, 8.8, 0.18, 0, TAU);
    ctx.fillStyle = hideColour;
    ctx.fill();

    // A line between the ears, since they are now the same one shape.
    ctx.strokeStyle = '#3d3d38';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(-25.5, -44, 8.2, 8.8, 0.18, Math.PI * 0.72, Math.PI * 1.5);
    ctx.stroke();

    // The stripes down the trunk.
    ctx.fillStyle = '#23231e';
    for (const i of [0, 1, 2, 3, 4, 5]) {
      ctx.beginPath();
      ctx.ellipse(-32.8 + i * 0.6, -27 + i * 4.6, 2.5, 1.6, 0.1, 0, TAU);
      ctx.fill();
    }

    // Two green eyes, which is what the painting gives it.
    ctx.fillStyle = '#4e7a49';
    for (const ex of [-33.5, -26.5]) {
      ctx.beginPath();
      ctx.ellipse(ex, -36.5, 2.1, 1.6, 0.15, 0, TAU);
      ctx.fill();
    }
    return;
  }

  const k = 6100;
  ink(ctx, 0.5, 1.3);
  ctx.beginPath();
  body();
  ctx.stroke();
  ink(ctx, 0.5, 1.2);
  ctx.beginPath();
  head();
  ctx.stroke();
  ctx.beginPath();
  trunk();
  ctx.stroke();
  for (const [fx, w, foot] of legs) {
    inkLines(
      ctx,
      [
        [fx - w / 2, -16, fx - w / 2, foot],
        [fx + w / 2, -16, fx + w / 2, foot],
        [fx - w / 2, foot, fx + w / 2, foot],
      ],
      k + 10 + fx,
    );
  }
  ink(ctx, 0.45, 1.1);
  inkArc(ctx, -33, -43, 7.6, k + 30);
  inkArc(ctx, -25.5, -44, 8.4, k + 32);
  ink(ctx, 0.6, 1.6);
  for (const i of [0, 1, 2, 3, 4, 5]) {
    inkLine(ctx, -34.2 + i * 0.6, -27 + i * 4.6, -31.4 + i * 0.6, -26.6 + i * 4.6, k + 40 + i);
  }
  ink(ctx, 0.65, 1.5);
  for (const ex of [-33.5, -26.5]) inkArc(ctx, ex, -36.5, 1.7, k + 60 + ex);
}

/**
 * The tail: off the rump, down and out, ending in a splayed brush.
 *
 * Drawn about its own root — `ELEPHANT_TAIL_ROOT` — because the root is the
 * hinge the swing turns about. The root sits four units inside the rump, as it
 * always did: at the silhouette edge a shallow root reads as detached the
 * moment the swing leans it either way, and the joint is hidden by the body
 * however far the tail turns. The old drawing's comment stands: the control
 * and lower end stay where they were, giving it a slight turn.
 *
 * The swish itself is not drawn: how far the tail has swung is the show's
 * rotation, not anybody's picture.
 */
export function drawElephantTail(ctx: CanvasRenderingContext2D, medium: Medium): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const swing = (wide: number) => {
    ctx.lineWidth = wide;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(8.5, 6, 8, 16);
    ctx.stroke();
    ctx.lineWidth = wide * 0.7;
    for (const a of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(8, 16);
      ctx.lineTo(8 + Math.sin(a) * 4, 16 + Math.cos(a) * 6);
      ctx.stroke();
    }
  };

  if (medium === 'color') {
    ctx.strokeStyle = '#4e4e48';
    swing(2.6);
    return;
  }
  ink(ctx, 0.55, 1.2);
  swing(1.2);
}
