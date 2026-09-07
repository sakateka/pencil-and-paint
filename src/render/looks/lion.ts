import {
  drawLionBody,
  drawLionFace,
  drawLionMane,
  drawLionShadow,
  drawLionTail,
  lionBreath,
  lionHeadAt,
  lionLid,
  lionSwish,
  lionTailAngle,
  LION_TAIL,
  type Lion,
} from '../../entities/lion';
import { withBoilAt } from '../../media/ink';
import type { Medium } from '../../media/medium';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';

/**
 * The lion, as five sprites and one row of blinks.
 *
 * Measured standing beside it, the old cel path spent twenty-three megabytes a
 * second on this animal — the second most expensive thing left in the game,
 * behind the elephant — and it does nothing at all. It lies in the grass. Every
 * one of those repaints was a three-hundred-pixel square redrawn because one of
 * four floats had moved on: where the head is, how far the chest has risen, how
 * far the tail has swung, how shut the eyes are.
 *
 * Three of those four are not pictures, and saying so is the whole change. See
 * the note over the drawing functions in `entities/lion.ts` for which is which.
 * What is left is the eyes.
 */

/**
 * Drawings between wide open and fully shut.
 *
 * The blink is a pulse about two thirds of a second long, so six drawings
 * across it is roughly the rate a hand-drawn blink is animated at anyway; the
 * same row covers the eyes opening as the head comes up, which takes about as
 * long. Graphite keeps two of them — see `key` — because the pencil drawing
 * only ever asks whether the eyes are shut.
 */
const LID_STEPS = 5;

interface FacePose {
  readonly lid: number;
}

/** The one pose a part with no pictures has. */
interface Only {
  readonly only: 0;
}

const ONE: readonly Only[] = [{ only: 0 }];

/**
 * A part of the lion that is only ever one drawing.
 *
 * Graphite is baked at boil tick nought, which is what the renderer's `still`
 * asked for when this was a cel: everything that sits out in the pencil at a
 * fixed spot holds still, because a drawing on paper does not tremble.
 */
function partLook(spec: {
  id: string;
  reach: number;
  draw(ctx: CanvasRenderingContext2D, medium: Medium): void;
}): Look<Only> {
  return {
    id: spec.id,
    media: ['sketch', 'color'],
    reach: spec.reach,
    poses: () => ONE,
    key: () => 'one',
    draw: (ctx, _pose, medium) =>
      withBoilAt(0, () => spec.draw(ctx, medium)),
  };
}

const lionShadow = partLook({ id: 'lion:shadow', reach: 34, draw: drawLionShadow });
const lionTail = partLook({ id: 'lion:tail', reach: 20, draw: drawLionTail });
const lionBody = partLook({ id: 'lion:body', reach: 30, draw: drawLionBody });
const lionMane = partLook({ id: 'lion:mane', reach: 32, draw: drawLionMane });

const lionFace: Look<FacePose> = {
  id: 'lion:face',
  media: ['sketch', 'color'],
  reach: 20,
  *poses(): Generator<FacePose> {
    for (let lid = 0; lid <= LID_STEPS; lid++) yield { lid };
  },
  /*
   * Paint keeps every step; graphite keeps the question it actually asks. The
   * pencil face draws a shut eye or an open one and nothing in between, so all
   * six poses collapse to two pictures without anybody having to list which.
   */
  key: (pose, medium) =>
    medium === 'color' ? `l${pose.lid}` : lidAt(pose.lid) > 0.5 ? 'shut' : 'open',
  draw: (ctx, pose, medium) =>
    withBoilAt(0, () => drawLionFace(ctx, lidAt(pose.lid), medium)),
};

function lidAt(step: number): number {
  return step / LID_STEPS;
}

export function registerLionLooks(library: LookLibrary): void {
  library.register(lionShadow);
  library.register(lionTail);
  library.register(lionBody);
  library.register(lionMane);
  library.register(lionFace);
}

/**
 * Show the lion.
 *
 * The two drawings stack differently, so the order is asked per medium rather
 * than declared once. In paint the tail lies round behind it and the mane is
 * thrown over the body; in graphite the mane is a ring of pale lobes that has
 * to go *under* the body or the body disappears into it, and the tail is inked
 * over the top. That difference was invisible while both were one canvas,
 * because a canvas keeps whatever order its strokes were laid down in.
 *
 * The breath is a vertical scale, and every part's offset from the animal is
 * scaled with it — which is what `ctx.scale(1, breath)` did when this was one
 * drawing, and is why the head does not drift off the shoulders as it swells.
 * The shadow is left out of it: the ground does not breathe.
 */
export function showLion(
  stage: Stage,
  library: LookLibrary,
  lion: Lion,
  medium: Medium,
  layer: Layer,
  depth: number,
): void {
  const head = lionHeadAt(lion.alert);
  const breath = lionBreath(lion.clock);
  const paint = medium === 'color';
  const on = { library, medium, layer, scaleY: breath } as const;

  stage.showLook({
    library,
    id: lionShadow.id,
    poseKey: 'one',
    medium,
    layer,
    x: lion.x,
    y: lion.y,
    depth: depth - 0.000008,
  });

  stage.showLook({
    ...on,
    id: lionTail.id,
    poseKey: 'one',
    x: lion.x + LION_TAIL.x,
    y: lion.y + LION_TAIL.y * breath,
    depth: depth + (paint ? -0.000002 : 0.000002),
    rotation: lionTailAngle(lionSwish(lion.clock)),
  });

  stage.showLook({ ...on, id: lionBody.id, poseKey: 'one', x: lion.x, y: lion.y, depth });

  const at = { x: lion.x + head.x, y: lion.y + head.y * breath } as const;

  stage.showLook({
    ...on,
    ...at,
    id: lionMane.id,
    poseKey: 'one',
    depth: depth + (paint ? 0.000004 : -0.000004),
  });

  const lid = Math.round(lionLid(lion.clock, lion.alert) * LID_STEPS);
  stage.showLook({
    ...on,
    ...at,
    id: lionFace.id,
    poseKey: lionFace.key({ lid }, medium),
    depth: depth + 0.000006,
  });
}
