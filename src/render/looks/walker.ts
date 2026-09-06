import {
  drawWalkerBrush,
  drawWalkerFigure,
  drawWalkerShadow,
  walkBob,
  type Facing,
  type Walker,
} from '../../entities/player';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';

/**
 * The walker, as three sprites instead of a repaint a frame.
 *
 * This was the last thing in the game still painting a canvas every single
 * frame, and the instrument found it first: standing perfectly still, doing
 * nothing, the game pushed a hundred kilobytes a frame to the GPU — six
 * megabytes a second on a figure that was not moving. A hundred and sixty
 * pixels square, of which the person occupies perhaps a fifth.
 *
 * It was left until last on purpose. The comment it replaces made the case:
 * the walker is what the eye is on, and a stepped walk cycle on the figure you
 * are steering reads as lag rather than as pencil. That case is still right,
 * and it is answered rather than overruled — by how much of the walker turns
 * out not to be a picture at all:
 *
 * - **where they are** is a position, so the figure glides as smoothly as it
 *   ever did no matter how few drawings the legs have;
 * - **the bob** is a translate, still computed from the unrounded phase, so it
 *   breathes at sixty frames a second;
 * - **which way they face** is a mirror;
 * - **the colour on the brush** is a tint, which is what saves this: fourteen
 *   paint pots would otherwise be fourteen walkers.
 *
 * What is left to be a drawing is the swing of the limbs, and a swing is a row
 * of drawings in every hand-drawn walk cycle ever made. At a full run the phase
 * turns three times a second, so eight per cycle is twenty-four changes of
 * drawing a second — which is not a frame rate the eye reads as steps.
 */

/** Drawings in one full cycle of the legs. */
const STEPS = 8;

const FACINGS: readonly Facing[] = ['down', 'up', 'side'];

interface WalkPose {
  readonly facing: Facing;
  readonly step: number;
}

/**
 * The swing this drawing is baked at.
 *
 * Quantised on the phase rather than on the swing itself, for the reason the
 * field learned: rounding the sine bunches the drawings up at the ends of the
 * stride, where the limbs are moving slowest and it shows least.
 */
function swingAt(step: number): number {
  return Math.sin((Math.PI * 2 * step) / STEPS);
}

/**
 * Two phases with the same swing are the same picture.
 *
 * A sine over eight steps takes five distinct values, so keying on the swing
 * rather than on the step bakes five drawings a facing instead of eight without
 * anyone having to notice which three were duplicates.
 */
function keyOf(pose: WalkPose): string {
  return `${pose.facing}w${swingAt(pose.step).toFixed(3)}`;
}

function* walkPoses(): Generator<WalkPose> {
  for (const facing of FACINGS) {
    for (let step = 0; step < STEPS; step++) yield { facing, step };
  }
}

/**
 * The figure: everything but the shadow under it and the paint on the brush.
 *
 * `reach` covers the brush arm at full swing, which is the furthest anything
 * gets from the walker's feet — about forty units up and thirty out. Sixty is
 * generous, and generosity here costs a scratch canvas at warm-up and nothing
 * afterwards.
 */
export const walkerLook: Look<WalkPose> = {
  id: 'walker',
  /* The walker carries the colour, so they are never drawn in graphite. */
  media: ['color'],
  reach: 60,
  poses: walkPoses,
  key: keyOf,
  draw: (ctx, pose) => drawWalkerFigure(ctx, pose.facing, swingAt(pose.step)),
};

/**
 * The loaded tip of the brush, white, so a sprite can be tinted to any pot.
 *
 * Its own look rather than its own offset: where the tip is depends on how far
 * the arm has swung and which shoulder it hangs from, and both of those are
 * already settled by the pose. Baking it in the figure's frame means the tint
 * rides exactly the same transform as the figure and cannot drift from the hand
 * holding it.
 */
export const walkerBrushLook: Look<WalkPose> = {
  id: 'walker:brush',
  media: ['color'],
  reach: 60,
  poses: walkPoses,
  key: keyOf,
  draw: (ctx, pose) => drawWalkerBrush(ctx, pose.facing, swingAt(pose.step), '#ffffff'),
};

/**
 * The shadow, which stays on the ground while the walker bobs above it.
 *
 * One picture. It was inside the same canvas as the figure before, which is why
 * it had to be repainted whenever anything about the figure changed.
 */
export const walkerShadowLook: Look<{ readonly only: 0 }> = {
  id: 'walker:shadow',
  media: ['color'],
  reach: 24,
  poses: () => [{ only: 0 }],
  key: () => 'flat',
  draw: (ctx) => drawWalkerShadow(ctx, 0, 0),
};

export function registerWalkerLooks(library: LookLibrary): void {
  library.register(walkerLook);
  library.register(walkerBrushLook);
  library.register(walkerShadowLook);
}

/** A colour the sprite can be tinted by, from the hex the walker is carrying. */
function tintOf(hex: string): number {
  const parsed = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(parsed) ? 0xffffff : parsed;
}

/**
 * Show the walker: a shadow on the ground, a figure over it, a tip over that.
 *
 * `depth` is the figure's; the shadow goes just under it and the brush just
 * over, by the same ten-thousandths the field uses to keep an animal's parts
 * together.
 */
export function showWalker(
  stage: Stage,
  library: LookLibrary,
  walker: Walker,
  layer: Layer,
  depth: number,
  elapsed: number,
): void {
  const moving = Math.hypot(walker.vx, walker.vy) > 6;
  const bob = walkBob(walker.step, moving, elapsed);
  const step = moving
    ? ((Math.round((walker.step / (Math.PI * 2)) * STEPS) % STEPS) + STEPS) % STEPS
    : 0;
  const pose: WalkPose = { facing: walker.facing, step };
  const poseKey = keyOf(pose);
  const flipX = walker.face < 0;

  stage.showLook({
    library,
    id: walkerShadowLook.id,
    poseKey: 'flat',
    medium: 'color',
    layer,
    x: walker.x,
    y: walker.y + 3,
    depth: depth - 0.000002,
  });

  const body = {
    library,
    medium: 'color',
    layer,
    x: walker.x,
    y: walker.y - bob,
    flipX,
  } as const;

  stage.showLook({ ...body, id: walkerLook.id, poseKey, depth });
  stage.showLook({
    ...body,
    id: walkerBrushLook.id,
    poseKey,
    depth: depth + 0.000002,
    tint: tintOf(walker.brush),
  });
}
