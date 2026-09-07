import { TAU } from '../../core/math';
import {
  drawHedgehogBody,
  drawHedgehogFeet,
  hedgehogShowing,
  hedgehogSniff,
  hedgehogWaddle,
  HEDGEHOG_PADDLE,
  HEDGEHOG_SCALE,
  HEDGEHOG_SNIFF,
  type Hedgehog,
  type HedgehogLook,
} from '../../entities/hedgehog';
import { boilTick, withBoilAt } from '../../media/ink';
import type { Medium } from '../../media/medium';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';

/**
 * The hedgehog, as a coat and a set of paws.
 *
 * It is out for a minute or two of a whole session and it was one of the more
 * expensive things in the game while it was: a cel a hundred and sixty units
 * square, repainted every frame it was visible, for an animal that occupies
 * twenty-five units by fifteen. Every frame, because its pose string carried
 * `positionX`, `out` and `lyingFor` — all of which move continuously — so the
 * step counter that is meant to hold a drawing still had nothing to hold on to.
 *
 * Almost none of it is a picture:
 *
 * - **where it is** and **which way it points** are a position and a mirror;
 * - **coming out of the shadow under the bush** is the sprite's alpha, and in
 *   graphite it now works at all — `ink` sets `globalAlpha` per stroke, so the
 *   pencil copy used to ignore the fade it was given and switch straight on;
 * - **the waddle** is a rotation about its feet;
 * - **the paws** are a cycle of eight, which is what a walk cycle has always
 *   been.
 *
 * What is left is the sniff, and it is a picture only because there is nothing
 * else it could be: it stretches the snout from a fixed root, which is neither
 * a translate nor a scale of the drawing. Five of them span the whole of it,
 * and the whole of it is under half a pixel — measured on the nose tip, the
 * furthest-travelled point, at the size it is drawn.
 */

/**
 * Sniffs baked across the range.
 *
 * The sniff moves the nose by a fifth of a unit either way, so the gap between
 * two of these is about a tenth of a screen pixel — well inside the "no step
 * bigger than a pixel" the instruments hold everything else to.
 */
const SNIFFS = 5;

/** Drawings in one full cycle of the paws. */
const STEPS = 8;

/**
 * Inked variants of the quill coat, cycled at the ink's own rate in paint.
 *
 * Only the field drawing has any: its quills are struck with `jitter`, and they
 * are the one thing on this animal that has ever boiled. The cartoon coat is
 * the same drawing at every tick, so it says so in `key` and bakes one picture
 * rather than three of the same thing.
 *
 * Graphite bakes a single hand and holds it, the rule the field and the paint
 * pots both had to learn: out of the colour it is pencil on paper, and under
 * the colour it is the underlay whose one-pixel fringe shivers if it boils.
 */
const HANDS = 3;

const LOOKS: readonly HedgehogLook[] = ['field', 'hybrid'];

interface BodyPose {
  readonly look: HedgehogLook;
  readonly sniff: number;
  readonly hand: number;
}

interface FeetPose {
  readonly look: HedgehogLook;
  readonly step: number;
}

/** Where in its range a baked sniff sits: level zero is fully down. */
function sniffAt(level: number): number {
  return ((level / (SNIFFS - 1)) * 2 - 1) * HEDGEHOG_SNIFF;
}

/** And which of them a live sniff is nearest to. */
function sniffLevel(sniff: number): number {
  const along = ((sniff / HEDGEHOG_SNIFF + 1) / 2) * (SNIFFS - 1);
  return Math.min(SNIFFS - 1, Math.max(0, Math.round(along)));
}

/** Where in the cycle a baked step is, in radians of paddling. */
function strideAt(step: number): number {
  return (TAU * step) / STEPS;
}

/**
 * Which drawing of the paws this is.
 *
 * Quantised on the phase rather than on the swing, for the reason the field
 * learned: rounding the sine bunches the drawings up at the ends of the stride
 * where the paws are moving slowest.
 */
function strideStep(clock: number): number {
  const turns = (clock * HEDGEHOG_PADDLE) / TAU;
  return ((Math.round(turns * STEPS) % STEPS) + STEPS) % STEPS;
}

/**
 * The size it is drawn at, baked in rather than applied to the sprite.
 *
 * A hedgehog is a couple of dozen units across and every one of them is spent
 * on a face; recording it at the resolution it is shown at is free here, and
 * scaling a picture up afterwards is not.
 */
function atSize(ctx: CanvasRenderingContext2D, paint: () => void): void {
  ctx.save();
  ctx.scale(HEDGEHOG_SCALE, HEDGEHOG_SCALE);
  paint();
  ctx.restore();
}

/** Which hand a picture was really drawn by: none, out in the graphite. */
function handOf(pose: BodyPose, medium: Medium): number {
  return medium === 'color' && pose.look === 'field' ? pose.hand : 0;
}

export const hedgehogBodyLook: Look<BodyPose> = {
  id: 'hedgehog',
  media: ['sketch', 'color'],
  /*
   * The coat reaches thirteen units from the animal's feet and is baked a third
   * again as big, so the ink stops just short of twenty. Measured after the
   * scale, as the mirage and the sitter both had to be.
   */
  reach: 30,
  *poses(): Generator<BodyPose> {
    for (const look of LOOKS) {
      for (let sniff = 0; sniff < SNIFFS; sniff++) {
        for (let hand = 0; hand < HANDS; hand++) yield { look, sniff, hand };
      }
    }
  },
  key: (pose, medium) => `${pose.look}s${pose.sniff}h${handOf(pose, medium)}`,
  draw: (ctx, pose, medium) =>
    withBoilAt(handOf(pose, medium), () =>
      atSize(ctx, () => drawHedgehogBody(ctx, pose.look, sniffAt(pose.sniff), medium)),
    ),
};

export const hedgehogFeetLook: Look<FeetPose> = {
  id: 'hedgehog:feet',
  media: ['sketch', 'color'],
  /** Four short strokes on the ground under it, ten units out at the widest. */
  reach: 20,
  *poses(): Generator<FeetPose> {
    for (const look of LOOKS) {
      for (let step = 0; step < STEPS; step++) yield { look, step };
    }
  },
  /** Nothing on a paw is inked by hand, so there is no boil to name here. */
  key: (pose) => `${pose.look}w${pose.step}`,
  draw: (ctx, pose, medium) =>
    atSize(ctx, () => drawHedgehogFeet(ctx, pose.look, strideAt(pose.step), medium)),
};

export function registerHedgehogLooks(library: LookLibrary): void {
  library.register(hedgehogBodyLook);
  library.register(hedgehogFeetLook);
}

/**
 * Show the hedgehog: its paws on the ground, its coat over them.
 *
 * The waddle turns both about the same point — the animal's feet, which is
 * where its origin is — so they rock together the way they did when they shared
 * a canvas.
 */
export function showHedgehog(
  stage: Stage,
  library: LookLibrary,
  h: Hedgehog,
  medium: Medium,
  layer: Layer,
  depth: number,
): void {
  const alpha = hedgehogShowing(h);
  if (alpha <= 0) return;

  const common = {
    library,
    medium,
    layer,
    x: h.atX,
    y: h.atY,
    alpha,
    rotation: hedgehogWaddle(h),
    // It was drawn nose-right and comes out of its bush walking left, so left
    // uncorrected it trundles out backwards.
    flipX: h.facing < 0,
  } as const;

  // Only while it is taking a step: a hedgehog at rest tucks its feet away.
  if (h.moving) {
    stage.showLook({
      ...common,
      id: hedgehogFeetLook.id,
      poseKey: hedgehogFeetLook.key({ look: h.look, step: strideStep(h.clock) }, medium),
      depth: depth - 0.000002,
    });
  }

  const pose: BodyPose = {
    look: h.look,
    sniff: sniffLevel(hedgehogSniff(h)),
    hand: ((boilTick() % HANDS) + HANDS) % HANDS,
  };
  stage.showLook({
    ...common,
    id: hedgehogBodyLook.id,
    poseKey: hedgehogBodyLook.key(pose, medium),
    depth,
  });
}
