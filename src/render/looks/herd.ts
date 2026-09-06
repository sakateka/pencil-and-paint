import { TAU } from '../../core/math';
import {
  chickHinge,
  chickenHinge,
  cowHinge,
  cowTailAngle,
  COW_TAIL,
  drawChickBody,
  drawChickHead,
  drawChickenBody,
  drawChickenHead,
  drawCowBody,
  drawCowHead,
  drawCowTail,
  drawSheepBody,
  drawSheepHead,
  sheepHinge,
  type Animal,
} from '../../entities/animals';
import { withBoilAt } from '../../media/ink';
import type { Medium } from '../../media/medium';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';

/**
 * The field: sheep, cattle, hens and the chick, as a few dozen pictures.
 *
 * This is the biggest single saving in the game. Every animal used to carry a
 * 220-pixel-square canvas, repainted whenever the renderer guessed its pose had
 * moved on — a field of a dozen of them came to megabytes a second of upload,
 * nearly all of it the transparent air around a sheep.
 *
 * Splitting them up is not an optimisation, it is the drawing being honest
 * about itself. An animal is a body, a head on a neck, and in one case a tail,
 * and those three things move in three different ways:
 *
 * - The **body** is pictures. A walk cycle is a row of drawings and always has
 *   been; eight of them go round at whatever rate the legs are actually moving.
 * - The **head** is a transform. It hangs from a hinge and turns about it, so
 *   `headDown` — a float easing from nought to one — moves a sprite rather than
 *   choosing between frames of one. That is what makes a cow lowering its head
 *   into the grass smooth: nothing about it is quantised.
 * - The **tail** is a transform too, swinging about its root.
 *
 * Which way the animal faces is a mirror; how big it is, a scale. What is left
 * to be a picture is the hand that drew it — three inked variants, cycled while
 * the animal is awake, held still while it is only a drawing on paper.
 */

/** Inked variants of each drawing: the boil, and the differences between two
 * animals of the same kind. Three is what a hand-drawn cartoon uses. */
export const HANDS = 3;

/** Pictures in a walk cycle. */
const STEPS = 8;

/** The seed every wobble in one variant is drawn from. */
function seedOf(hand: number): number {
  return hand * 41;
}

/** The two colours a chicken comes in, and the two a cow is blotched with. */
const COATS = ['#f4efe3', '#c98a4b'] as const;
const PATCHES = ['#6b4a32', '#3f3830'] as const;

/**
 * A body in the middle of its walk, in one hand, in one colourway.
 *
 * The colourway only exists in paint — a graphite chicken is drawn the same
 * whether it is white or brown — and the hand only exists in graphite, because
 * nothing in the colour pass jitters. `key` says so, and the library bakes one
 * picture per distinct key, so neither dimension is paid for twice.
 */
interface BodyPose {
  readonly step: number;
  readonly hand: number;
  readonly variant: number;
}

/** A head or a tail: no walk cycle, otherwise the same. */
interface PartPose {
  readonly hand: number;
  readonly variant: number;
}

/**
 * Which colourway a part of this animal is actually drawn in.
 *
 * An animal carries one colourway, but its parts do not all have one: a cow is
 * blotched in one of two browns and its head and tail are not. Asking for a
 * picture that was never baked gets nothing back, and nothing back means the
 * part is simply missing — which is how a cow with the second patch colour
 * ended up standing in a field with no head and no tail.
 */
function colourway(variant: number, variants: number): number {
  return Math.min(variant, variants - 1);
}

function bodyLook(spec: {
  id: string;
  reach: number;
  variants: number;
  draw(ctx: CanvasRenderingContext2D, sw: number, medium: Medium, k: number, variant: number): void;
}): Look<BodyPose> {
  return {
    id: spec.id,
    media: ['sketch', 'color'],
    reach: spec.reach,

    *poses(): Generator<BodyPose> {
      for (let step = 0; step < STEPS; step++) {
        for (let hand = 0; hand < HANDS; hand++) {
          for (let variant = 0; variant < spec.variants; variant++) {
            yield { step, hand, variant };
          }
        }
      }
    },

    key(pose: BodyPose, medium: Medium): string {
      return medium === 'color'
        ? `s${pose.step}v${colourway(pose.variant, spec.variants)}`
        : `s${pose.step}h${pose.hand}`;
    },

    draw(ctx: CanvasRenderingContext2D, pose: BodyPose, medium: Medium): void {
      withBoilAt(pose.hand, () =>
        spec.draw(ctx, Math.sin((TAU * pose.step) / STEPS), medium, seedOf(pose.hand), pose.variant),
      );
    },
  };
}

function partLook(spec: {
  id: string;
  reach: number;
  variants: number;
  draw(ctx: CanvasRenderingContext2D, medium: Medium, k: number, variant: number): void;
}): Look<PartPose> {
  return {
    id: spec.id,
    media: ['sketch', 'color'],
    reach: spec.reach,

    *poses(): Generator<PartPose> {
      for (let hand = 0; hand < HANDS; hand++) {
        for (let variant = 0; variant < spec.variants; variant++) yield { hand, variant };
      }
    },

    key(pose: PartPose, medium: Medium): string {
      return medium === 'color' ? `v${colourway(pose.variant, spec.variants)}` : `h${pose.hand}`;
    },

    draw(ctx: CanvasRenderingContext2D, pose: PartPose, medium: Medium): void {
      withBoilAt(pose.hand, () => spec.draw(ctx, medium, seedOf(pose.hand), pose.variant));
    },
  };
}

const sheepBody = bodyLook({
  id: 'sheep',
  reach: 40,
  variants: 1,
  draw: (ctx, sw, medium, k) => drawSheepBody(ctx, sw, medium, k),
});
const sheepHead = partLook({
  id: 'sheep:head',
  reach: 16,
  variants: 1,
  draw: (ctx, medium, k) => drawSheepHead(ctx, medium, k),
});

const cowBody = bodyLook({
  id: 'cow',
  reach: 52,
  variants: PATCHES.length,
  draw: (ctx, sw, medium, k, variant) =>
    drawCowBody(ctx, sw, medium, k, COATS[0], PATCHES[variant]),
});
const cowHead = partLook({
  id: 'cow:head',
  reach: 24,
  variants: 1,
  draw: (ctx, medium, k) => drawCowHead(ctx, medium, k, COATS[0]),
});
const cowTail = partLook({
  id: 'cow:tail',
  reach: 32,
  variants: 1,
  draw: (ctx, medium, k) => drawCowTail(ctx, medium, k),
});

const chickenBody = bodyLook({
  id: 'chicken',
  reach: 26,
  variants: COATS.length,
  draw: (ctx, sw, medium, k, variant) => drawChickenBody(ctx, sw, medium, k, COATS[variant]),
});
const chickenHead = partLook({
  id: 'chicken:head',
  reach: 14,
  variants: COATS.length,
  draw: (ctx, medium, k, variant) => drawChickenHead(ctx, medium, k, COATS[variant]),
});

const chickBody = bodyLook({
  id: 'chick',
  reach: 16,
  variants: 1,
  draw: (ctx, sw, medium, k) => drawChickBody(ctx, sw, medium, k),
});
const chickHead = partLook({
  id: 'chick:head',
  reach: 10,
  variants: 1,
  draw: (ctx, medium, k) => drawChickHead(ctx, medium, k),
});

/** Everything the field bakes. Called once, at warm-up. */
export function registerHerdLooks(library: LookLibrary): void {
  library.register(sheepBody);
  library.register(sheepHead);
  library.register(cowBody);
  library.register(cowHead);
  library.register(cowTail);
  library.register(chickenBody);
  library.register(chickenHead);
  library.register(chickBody);
  library.register(chickHead);
}

/** Which kinds have moved to the pose library. The rest keep the old path. */
export function hasHerdLook(a: Animal): boolean {
  return a.kind === 'sheep' || a.kind === 'cow' || a.kind === 'chicken' || a.kind === 'hen' ||
    a.kind === 'chick';
}

/**
 * How fast each kind's legs go round relative to its walk phase, copied from
 * the drawing that used to read `Math.sin(a.walkPhase * n)`.
 */
function walkRate(a: Animal): number {
  if (a.kind === 'chick') return 2.1;
  if (a.kind === 'chicken' || a.kind === 'hen') return 1.7;
  return 1;
}

/**
 * Which picture of the walk this is.
 *
 * Quantised on the phase rather than on the leg position, so the cycle goes
 * round at an even rate — quantising the sine instead bunches the pictures up
 * at the ends of the swing, where the legs are moving slowest and it shows
 * least, and spreads them out through the middle, where it shows most.
 */
function walkStep(a: Animal): number {
  if (!a.moving) return 0;
  const turns = (a.walkPhase * walkRate(a)) / TAU;
  return ((Math.round(turns * STEPS) % STEPS) + STEPS) % STEPS;
}

/**
 * Which inked variant this animal is showing.
 *
 * Awake, it steps with the boil, so the hand keeps moving. Asleep, it is pencil
 * on paper and paper does not move — but each animal still gets its own hand,
 * so a field of sleeping sheep is not the same drawing stamped out twelve
 * times.
 */
function handOf(a: Animal, tick: number): number {
  return a.awake ? (a.slot + tick) % HANDS : a.slot % HANDS;
}

/** Which colourway. Only paint has one; graphite ignores it. */
function variantOf(a: Animal): number {
  const among: readonly string[] = a.kind === 'cow' ? PATCHES : COATS;
  const mine = a.kind === 'cow' ? a.patch : a.coat;
  return Math.max(0, among.indexOf(mine));
}

/**
 * Show one animal, as its two or three baked parts.
 *
 * Returns false for the kinds that have not moved over yet, so the caller can
 * fall back to painting them into a canvas.
 */
export function showHerdAnimal(
  stage: Stage,
  library: LookLibrary,
  a: Animal,
  medium: Medium,
  layer: Layer,
  depth: number,
  tick: number,
): boolean {
  if (!hasHerdLook(a)) return false;

  const hand = handOf(a, tick);
  const variant = variantOf(a);
  const step = walkStep(a);
  const flipX = a.face < 0;
  const scale = a.scale;
  const pose: BodyPose = { step, hand, variant };
  const part: PartPose = { hand, variant };

  const body =
    a.kind === 'sheep' ? sheepBody
      : a.kind === 'cow' ? cowBody
        : a.kind === 'chick' ? chickBody
          : chickenBody;
  const head =
    a.kind === 'sheep' ? sheepHead
      : a.kind === 'cow' ? cowHead
        : a.kind === 'chick' ? chickHead
          : chickenHead;

  /*
   * The tail first, because it hangs behind the cow, then the body, then the
   * head over the top of both. The offsets are a ten-thousandth of the gap the
   * herd leaves between one animal and the next, so an animal's parts stay
   * together however the field is arranged.
   */
  if (a.kind === 'cow') {
    const swish = Math.sin(a.clock * 2.1 + a.phase) * 4;
    stage.showLook({
      library,
      id: cowTail.id,
      poseKey: cowTail.key(part, medium),
      medium,
      layer,
      x: a.x + (flipX ? -1 : 1) * COW_TAIL.x * scale,
      y: a.y + COW_TAIL.y * scale,
      depth: depth - 0.000002,
      scale,
      flipX,
      rotation: cowTailAngle(swish),
    });
  }

  stage.showLook({
    library,
    id: body.id,
    poseKey: body.key(pose, medium),
    medium,
    layer,
    x: a.x,
    y: a.y,
    depth,
    scale,
    flipX,
  });

  const hinge = hingeOf(a);
  stage.showLook({
    library,
    id: head.id,
    poseKey: head.key(part, medium),
    medium,
    layer,
    x: a.x + (flipX ? -1 : 1) * hinge.x * scale,
    y: a.y + hinge.y * scale,
    depth: depth + 0.000002,
    scale,
    flipX,
    rotation: hinge.angle,
  });

  return true;
}

/**
 * Where this animal's head is and how far it has turned, right now.
 *
 * A bird's peck used to be gated on `state === 'graze'`, which meant the head
 * snapped upright the instant a hen decided to wander off. It is scaled by the
 * same eased `headDown` the grazers use instead, so the peck fades out with the
 * decision rather than being cut off by it.
 */
function hingeOf(a: Animal): { x: number; y: number; angle: number } {
  if (a.kind === 'sheep') return sheepHinge(a.headDown);
  if (a.kind === 'cow') return cowHinge(a.headDown);
  if (a.kind === 'chick') {
    return chickHinge((0.5 + 0.5 * Math.sin(a.clock * 6.5 + a.phase)) * a.headDown);
  }
  return chickenHinge((0.5 + 0.5 * Math.sin(a.clock * 5.5 + a.phase)) * a.headDown);
}
