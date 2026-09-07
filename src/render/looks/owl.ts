import {
  drawOwlBody,
  drawOwlBranch,
  drawOwlFace,
  drawOwlWings,
  owlBreath,
  owlFaceX,
  owlFlapAge,
  owlLid,
  type Owl,
} from '../../entities/owl';
import { withBoilAt } from '../../media/ink';
import type { Medium } from '../../media/medium';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';

/**
 * The owl, as four pictures on one perch.
 *
 * It was the most expensive thing left in the game and for the plainest reason:
 * its cel was marked `animated`, which repaints unconditionally, so a two
 * hundred and twenty pixel square went to the GPU sixty times a second for the
 * whole time it was on screen — measured at up to 7.9MB a second, twenty-two
 * megabytes over a walk past its tree.
 *
 * What it actually does is watch you, and watching is not a drawing:
 *
 * - **the face comes round** — and it comes round by sliding across the head,
 *   which is a translate. The head does not change shape;
 * - **it breathes** — a vertical scale of two per cent, exactly as the lion's;
 * - **the branch and the body** never change at all, so they are one picture
 *   each, for ever.
 *
 * That leaves two things that are genuinely different drawings, and they are
 * the two things it is worth watching for: the blink, and the wing beat when
 * you hoot at it. Both are baked out in full.
 *
 * The split follows the order the strokes were laid down in, so the picture is
 * unchanged: in graphite the bird is knocked out of the hatched tree with a
 * patch of paper *before* the branch is drawn over it, and its own outline goes
 * over both — so the paper patch travels with the branch rather than with the
 * body it is the shape of.
 */

/**
 * Drawings across one wing beat, and levels of a closing eyelid.
 *
 * Both chosen by measurement rather than by taste — `tmp/bakedsteps.mjs`, which
 * asks the pictures themselves how far the ink moves from one to the next,
 * because on screen these are a few pixels of dark against a dark tree:
 *
 * - the beat throws the wing about, and no two consecutive drawings of it are
 *   more than 0.43px apart;
 * - the lid comes down 5.9 units in the two tenths of a second it takes to
 *   shut, which at eight levels was a whole pixel a step — one level per frame
 *   and a half, and the only number here that was ever near the limit. Twelve
 *   puts it at 0.54px and a level a frame, which is as smooth as the easing
 *   underneath it, and costs four drawings the size of a thumbnail.
 *
 * Sine is symmetric, so twenty-four phases of the beat bake as thirteen
 * pictures: going up and coming down are the same drawings.
 */
const BEATS = 24;
const LIDS = 12;

const BRANCH = 'owl:branch';
const WINGS = 'owl:wings';
const BODY = 'owl:body';
const FACE = 'owl:face';

interface WingPose {
  readonly step: number;
}

interface FacePose {
  readonly lid: number;
}

/** How far the wing is thrown at one phase of the beat. */
function beatAt(step: number): number {
  return Math.sin((step / BEATS) * Math.PI);
}

/**
 * Which phase of the beat this is.
 *
 * Quantised on the phase and not on the throw, the rule the field and the
 * walker both landed on: rounding the sine itself bunches the drawings up at
 * the top of the beat, where the wing is barely moving and it shows least.
 */
function beatStep(age: number): number {
  return ((Math.round(age * BEATS) % BEATS) + BEATS) % BEATS;
}

function lidAt(level: number): number {
  return level / (LIDS - 1);
}

/**
 * A sleeping owl is a drawing on paper.
 *
 * Out in the graphite it has no clock — `update` returns before the blink or
 * the beat can move, and it refuses to be hooted at — so every pose it can be
 * in out there is the same one. Saying so here is what stops the library baking
 * a dozen pencil owls that differ in nothing.
 */
function asleep(medium: Medium): boolean {
  return medium !== 'color';
}

function wingKey(pose: WingPose, medium: Medium): string {
  return `b${(asleep(medium) ? 0 : beatAt(pose.step)).toFixed(3)}`;
}

function faceKey(pose: FacePose, medium: Medium): string {
  return `l${asleep(medium) ? 0 : pose.lid}`;
}

/**
 * Every picture of the owl, recorded at the size it will be drawn.
 *
 * This is why the looks are built here rather than declared, and registered at
 * the bake rather than with the rest: how big the bird is depends on how big
 * the tree it was given turned out to be, and that is a number the valley makes
 * up as it lays itself out. It is fixed for the life of the page — the owl is
 * made once, from that tree, and a restart does not lay the wood out again.
 *
 * Bake at one-to-one in the owl's own units instead and every picture is
 * stretched a few per cent on the way to the screen, which is a resample of the
 * whole bird. Measured against the build before this one: a fifth of the fully
 * dark pixels gone and the weighted centre of the drawing half a pixel out of
 * place. Handing the bake its `grain` costs a few per cent of texture and puts
 * the picture back where it was.
 */
export function registerOwlLooks(library: LookLibrary, scale: number): void {
  /* One baked pixel to one screen pixel, at the size this bird is drawn. */
  const grain = () => 1 / scale;

  const branch: Look<{ readonly only: 0 }> = {
    id: BRANCH,
    media: ['sketch', 'color'],
    grain,
    /** The paper patch is the body's own shape, which reaches highest. */
    reach: 45,
    poses: () => [{ only: 0 }],
    key: () => 'one',
    draw: (ctx, _pose, medium) => withBoilAt(0, () => drawOwlBranch(ctx, medium)),
  };

  const wings: Look<WingPose> = {
    id: WINGS,
    media: ['sketch', 'color'],
    grain,
    reach: 30,
    *poses(): Generator<WingPose> {
      for (let step = 0; step < BEATS; step++) yield { step };
    },
    key: wingKey,
    draw: (ctx, pose, medium) =>
      withBoilAt(0, () => drawOwlWings(ctx, asleep(medium) ? 0 : beatAt(pose.step), medium)),
  };

  const body: Look<{ readonly only: 0 }> = {
    id: BODY,
    media: ['sketch', 'color'],
    grain,
    reach: 40,
    poses: () => [{ only: 0 }],
    key: () => 'one',
    draw: (ctx, _pose, medium) => withBoilAt(0, () => drawOwlBody(ctx, medium)),
  };

  const face: Look<FacePose> = {
    id: FACE,
    media: ['sketch', 'color'],
    grain,
    /** The lashes reach ten units out from the middle of the face, the brow up. */
    reach: 35,
    *poses(): Generator<FacePose> {
      for (let lid = 0; lid < LIDS; lid++) yield { lid };
    },
    key: faceKey,
    draw: (ctx, pose, medium) =>
      withBoilAt(0, () => drawOwlFace(ctx, asleep(medium) ? 0 : lidAt(pose.lid), medium)),
  };

  library.register(branch);
  library.register(wings);
  library.register(body);
  library.register(face);
}

/**
 * Show the owl: branch, wings, body, face, in the order they were painted.
 *
 * Its medium is its own. This is drawn past the colour mask, where nothing is
 * cut, so an owl the colour has not reached has to be *drawn* as a pencil
 * drawing rather than simply appearing in paint on a grey hillside.
 */
export function showOwl(
  stage: Stage,
  library: LookLibrary,
  owl: Owl,
  layer: Layer,
  depth: number,
): void {
  const medium: Medium = owl.awake ? 'color' : 'sketch';
  const common = {
    library,
    medium,
    layer,
    x: owl.x,
    y: owl.y,
    /*
     * The pictures were baked at this very scale, so `showLook` multiplies it
     * by their grain and draws them one-to-one. It is written out anyway
     * because the breath below is a fraction *of* it.
     */
    scale: owl.scale,
    // Barely breathing: two per cent of vertical scale about the branch.
    scaleY: owl.scale * owlBreath(owl),
  } as const;

  stage.showLook({ ...common, id: BRANCH, poseKey: 'one', depth });
  stage.showLook({
    ...common,
    id: WINGS,
    poseKey: wingKey({ step: beatStep(owlFlapAge(owl) ?? 0) }, medium),
    depth: depth + 0.000002,
  });
  stage.showLook({ ...common, id: BODY, poseKey: 'one', depth: depth + 0.000004 });
  stage.showLook({
    ...common,
    id: FACE,
    poseKey: faceKey({ lid: Math.round(owlLid(owl) * (LIDS - 1)) }, medium),
    // The whole face slides across the head to follow you: a translate, and the
    // one thing this bird does.
    x: owl.x + owlFaceX(owl) * owl.scale,
    depth: depth + 0.000006,
  });
}
