import { TAU } from '../../core/math';
import {
  catStir,
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
  drawCatBody,
  drawCatHead,
  drawCatTail,
  drawFrogBody,
  drawFrogSplash,
  drawSheepBody,
  drawSheepHead,
  frogBlink,
  frogBreath,
  frogHop,
  frogRing,
  frogShrink,
  frogThroat,
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

/**
 * The cat, in three parts, and the purr in two of them.
 *
 * Everything a purr does to her is under a pixel — the ears turn, the eyes fold
 * a little further shut, a small smile comes and goes — so those are pictures,
 * and a handful is plenty. The breath is not: it is a vertical scale of the
 * whole cat about the ground she lies on, and it stays a transform.
 *
 * Only paint carries any of it. In graphite she is always the sleeping one: a
 * cat the colour has reached is drawn in paint, and one it has not is pencil on
 * paper, which does not move.
 */
const CAT_EARS = [-0.7, 0, 0.7];
const CAT_SETTLES = [0, 0.34, 0.67, 1];
const CAT_FLICKS = [-2.6, -1.7, -0.9, 0, 0.9, 1.7, 2.6];

interface CatFace {
  readonly ear: number;
  readonly settle: number;
  readonly hand: number;
}

const catBody = partLook({
  id: 'cat',
  reach: 30,
  variants: 1,
  draw: (ctx, medium, k) => drawCatBody(ctx, medium, k),
});

const catTail: Look<{ flick: number; hand: number }> = {
  id: 'cat:tail',
  media: ['sketch', 'color'],
  reach: 30,
  *poses() {
    for (let flick = 0; flick < CAT_FLICKS.length; flick++) {
      for (let hand = 0; hand < HANDS; hand++) yield { flick, hand };
    }
  },
  key: (pose, medium) => (medium === 'color' ? `f${pose.flick}` : `h${pose.hand}`),
  draw: (ctx, pose, medium) =>
    withBoilAt(pose.hand, () =>
      // Still, in graphite: a sleeping cat's tail is wrapped round her.
      drawCatTail(ctx, medium === 'color' ? CAT_FLICKS[pose.flick] : 0, medium, seedOf(pose.hand)),
    ),
};

const catHead: Look<CatFace> = {
  id: 'cat:head',
  media: ['sketch', 'color'],
  reach: 30,
  *poses() {
    for (let ear = 0; ear < CAT_EARS.length; ear++) {
      for (let settle = 0; settle < CAT_SETTLES.length; settle++) {
        for (let hand = 0; hand < HANDS; hand++) yield { ear, settle, hand };
      }
    }
  },
  key: (pose, medium) =>
    medium === 'color' ? `e${pose.ear}s${pose.settle}` : `h${pose.hand}`,
  draw: (ctx, pose, medium) =>
    withBoilAt(pose.hand, () =>
      drawCatHead(
        ctx,
        medium === 'color' ? CAT_EARS[pose.ear] : 0,
        medium === 'color' ? CAT_SETTLES[pose.settle] : 0,
        medium,
        seedOf(pose.hand),
      ),
    ),
};

/**
 * The frog, whose whole leap is a transform.
 *
 * It goes up and along, it shrinks, it fades, and none of that is a drawing —
 * which is the point, because the leap lasts a third of a second and the old
 * path gave it four frames. What is left to be a picture is the blink and the
 * pulse of its throat, and both are quiet enough that a handful covers them.
 * Graphite has neither: at that size a graphite frog is a dome, two eyes and a
 * mouth.
 */
const FROG_LIDS = [0, 0.34, 0.67, 1];
const FROG_THROATS = [0.94, 1, 1.06];

const frogBody: Look<{ lid: number; throat: number; hand: number }> = {
  id: 'frog',
  media: ['sketch', 'color'],
  reach: 24,
  *poses() {
    for (let lid = 0; lid < FROG_LIDS.length; lid++) {
      for (let throat = 0; throat < FROG_THROATS.length; throat++) {
        for (let hand = 0; hand < HANDS; hand++) yield { lid, throat, hand };
      }
    }
  },
  key: (pose, medium) =>
    medium === 'color' ? `l${pose.lid}t${pose.throat}` : `h${pose.hand}`,
  draw: (ctx, pose, medium) =>
    withBoilAt(pose.hand, () =>
      drawFrogBody(
        ctx,
        FROG_THROATS[pose.throat],
        FROG_LIDS[pose.lid],
        medium,
        seedOf(pose.hand),
      ),
    ),
};

/** The ring on the water, opening and closing again. */
const SPLASH_RINGS = 8;

const frogSplash: Look<{ ring: number }> = {
  id: 'frog:splash',
  media: ['sketch', 'color'],
  reach: 30,
  *poses() {
    for (let ring = 0; ring < SPLASH_RINGS; ring++) yield { ring };
  },
  key: (pose) => `r${pose.ring}`,
  draw: (ctx, pose, medium) => drawFrogSplash(ctx, (pose.ring + 0.5) / SPLASH_RINGS, medium),
};

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
  library.register(catBody);
  library.register(catTail);
  library.register(catHead);
  library.register(frogBody);
  library.register(frogSplash);
}

/** The whole field is on the pose library now. Nothing falls back. */
export function hasHerdLook(_a: Animal): boolean {
  return true;
}

/** Which of a list of levels a continuous value is nearest to. */
function nearest(levels: readonly number[], value: number): number {
  let best = 0;
  let gap = Infinity;
  for (let i = 0; i < levels.length; i++) {
    const d = Math.abs(levels[i] - value);
    if (d < gap) {
      gap = d;
      best = i;
    }
  }
  return best;
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
 * Which inked variant this animal is showing. One, for as long as it stands
 * there — but its own, so a field of sheep is not one drawing stamped out
 * twelve times.
 *
 * It used to step with the live boil while the animal was awake, which is what
 * the boil is for and was wrong here for a reason that only appeared once the
 * field moved onto this library. The hand is a *graphite* dimension: `key`
 * throws it away in paint, because nothing in the colour pass jitters. So the
 * boil moved the pencil copy alone — and the pencil copy of an awake animal is
 * the underlay beneath its paint, showing through only where the paint has not
 * quite covered it, which is a one-pixel fringe along the silhouette. The
 * pencil outline jittering three-quarters of a pixel in and out from under the
 * painted one, seven times a second, is the shimmer that was reported along the
 * cows' backs. Measured on a still, paused cow: fifty pixels changing on a
 * three-tick cycle, and none at all once the paint covered the pencil.
 *
 * This is the same rule the scenery already keeps — see `still` in the renderer
 * — and the field is simply the last thing to learn it.
 */
function handOf(a: Animal): number {
  return a.slot % HANDS;
}

/** Which colourway. Only paint has one; graphite ignores it. */
function variantOf(a: Animal): number {
  const among: readonly string[] = a.kind === 'cow' ? PATCHES : COATS;
  const mine = a.kind === 'cow' ? a.patch : a.coat;
  return Math.max(0, among.indexOf(mine));
}

/** Show one animal, as its two or three baked parts. */
export function showHerdAnimal(
  stage: Stage,
  library: LookLibrary,
  a: Animal,
  medium: Medium,
  layer: Layer,
  depth: number,
): boolean {
  const hand = handOf(a);
  if (a.kind === 'cat') return showCat(stage, library, a, medium, layer, depth, hand);
  if (a.kind === 'frog') return showFrog(stage, library, a, medium, layer, depth, hand);

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

/**
 * The cat, and how far into her purr she is.
 *
 * The breath is a scale and the leap of faith of this whole design: a drawing
 * that swells and settles without a single repaint.
 */
function showCat(
  stage: Stage,
  library: LookLibrary,
  a: Animal,
  medium: Medium,
  layer: Layer,
  depth: number,
  hand: number,
): boolean {
  const { breath, flick, ear, settled } = catStir(a, a.clock);
  const flipX = a.face < 0;
  const common = {
    library,
    medium,
    layer,
    x: a.x,
    y: a.y,
    scale: a.scale,
    scaleY: a.scale * breath,
    flipX,
  } as const;

  stage.showLook({
    ...common,
    id: catBody.id,
    poseKey: catBody.key({ hand, variant: 0 }, medium),
    depth,
  });
  const tail = { flick: nearest(CAT_FLICKS, flick), hand };
  stage.showLook({
    ...common,
    id: catTail.id,
    poseKey: catTail.key(tail, medium),
    depth: depth + 0.000002,
  });
  const face = { ear: nearest(CAT_EARS, ear), settle: nearest(CAT_SETTLES, settled), hand };
  stage.showLook({
    ...common,
    id: catHead.id,
    poseKey: catHead.key(face, medium),
    depth: depth + 0.000004,
  });
  return true;
}

/**
 * The frog, and its leap.
 *
 * Under the water there is nothing to draw, which is the whole effect. On the
 * way there it rises, travels, shrinks and fades, and every one of those is a
 * number handed to a sprite — so the leap is as smooth as the clock, where the
 * old path quantised a third of a second into four frames.
 */
function showFrog(
  stage: Stage,
  library: LookLibrary,
  a: Animal,
  medium: Medium,
  layer: Layer,
  depth: number,
  hand: number,
): boolean {
  const ring = frogRing(a.dive);
  if (ring !== undefined) {
    stage.showLook({
      library,
      id: frogSplash.id,
      poseKey: frogSplash.key({ ring: Math.min(SPLASH_RINGS - 1, Math.floor(ring * SPLASH_RINGS)) }, medium),
      medium,
      layer,
      x: a.x + a.face * 13 * a.scale,
      y: a.y + 1,
      depth: depth - 0.000002,
      scale: a.scale,
    });
  }
  if (a.dive >= 1) return true;

  const shrink = frogShrink(a.dive);
  stage.showLook({
    library,
    id: frogBody.id,
    poseKey: frogBody.key(
      {
        lid: nearest(FROG_LIDS, Math.min(1, frogBlink(a, a.clock))),
        throat: nearest(FROG_THROATS, frogThroat(a, a.clock)),
        hand,
      },
      medium,
    ),
    medium,
    layer,
    x: a.x + a.face * 13 * a.scale * a.dive,
    y: a.y - frogHop(a.dive) * a.scale,
    depth,
    scale: a.scale * shrink,
    scaleY: a.scale * frogBreath(a, a.clock) * shrink,
    flipX: a.face < 0,
    alpha: 1 - a.dive * 0.35,
  });
  return true;
}
