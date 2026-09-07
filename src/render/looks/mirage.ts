import { clamp, TAU } from '../../core/math';
import {
  drawElephantBody,
  drawElephantTail,
  ELEPHANT_MIRAGE_SCALE,
  ELEPHANT_TAIL_ROOT,
  MIRAGE_LOBES,
  mirageAmount,
  mirageBobAt,
  type Vigil,
} from '../../entities/vigil';
import { withBoilAt } from '../../media/ink';
import { PENCIL, type Medium } from '../../media/medium';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';

/**
 * The mirage cloud, as one flat picture and a wave.
 *
 * This cloud hangs in the sky for the whole game — the animal it condenses out
 * of is a ten-second scene, but the hint of it is always there, and the old cel
 * was repainted for it every frame the camera could see that half of the map,
 * which is most of the eastern half of an average walk. Measured, that was the
 * single most expensive thing left in the game: twenty-six megabytes a second
 * for a smudge that never moves more than a few pixels.
 *
 * The smudge is one drawing. What lives in it is three motions, and none of
 * them is a picture:
 *
 *   - the bob, a vertical ride on its own breath — position;
 *   - the swell, thickening while the animal gathers and thinning back —
 *     scale and alpha;
 *   - the drift, which used to nudge each lobe on its own phase.
 *
 * The drift is the one worth a note. Per-lobe motion is *piecewise rigid*: the
 * lobes slide without changing shape. No drawing laid down as one picture can
 * follow it — sliding slices of the picture against each other shears every
 * lobe by more than its own width, because the phases of neighbouring lobes
 * are nearly opposite. Splitting the lobes into separately drawn sprites was
 * tried long before this and rejected in the drawing itself: overlapping
 * half-transparent lobes composite against each other, the six-lobe body
 * comes out bright and the one-lobe trunk all but vanishes, which is why the
 * old drawing fills the union once.
 *
 * So the drift here is the same motion said smoothly: one slow wave down the
 * length of the cloud, run by the same clock and the same amplitude the lobes
 * used. It is carried by a rope — the mechanism the hammock cloth introduced —
 * so the wave is vertex positions and nothing else: continuous, and free.
 */

/** The one pose a part with no pictures has. */
interface Only {
  readonly only: 0;
}

const ONE: readonly Only[] = [{ only: 0 }];

/**
 * The cloud, at full size and full strength, with the origin the drawing has
 * always used: the spot the animal stands on, `elephantX`/`elephantY`. The bob
 * is left out of the bake — it is the rope's position, not anybody's picture —
 * so the ink sits where the lobes are listed, a little above the origin.
 */
export const mirageCloudLook: Look<Only> = {
  id: 'mirage:cloud',
  media: ['sketch', 'color'],
  /*
   * The ears reach highest: the top lobe sits at -44 with a squashed radius of
   * 6.2, which at the mirage's own magnification is 201 units up — and a reach
   * too small for it shears the top of the cloud off along a straight line,
   * which is exactly the bar the cloud was seen clipped by. Measured off the
   * lobes and rounded up, the same way `MIRAGE_REACH` is.
   */
  reach: 210,
  poses: () => ONE,
  key: () => 'one',
  draw(ctx, _pose, medium) {
    /*
     * All the lobes in one path, filled once — the very shape the live drawing
     * filled. Separately, each lobe composites against its neighbours: the
     * body, where six of them overlap, comes out bright while the trunk and
     * the legs, which are one lobe thick, all but vanish.
     *
     * A `moveTo` before each one is not optional: `ellipse` continues the
     * current subpath, and without it the lobes are strung together by chords
     * whose overlaps cancel into holes.
     *
     * The lobes are listed in the animal's own small units; the mirage is the
     * animal four times over, and the rope's scale is the swell, not this — so
     * the magnification belongs to the bake.
     */
    ctx.scale(ELEPHANT_MIRAGE_SCALE, ELEPHANT_MIRAGE_SCALE);
    ctx.beginPath();
    for (const [lx, ly, r] of MIRAGE_LOBES) {
      ctx.moveTo(lx + r, ly);
      ctx.ellipse(lx, ly, r, r * 0.78, 0, 0, TAU);
    }
    ctx.fillStyle = medium === 'color' ? '#ffffff' : PENCIL;
    ctx.fill();
  },
};

export function registerMirageLooks(library: LookLibrary): void {
  library.register(mirageCloudLook);
  library.register(mirageBodyLook);
  library.register(mirageTailLook);
}

/**
 * The animal itself, as two pictures and nothing but transforms.
 *
 * This is the cow path, exactly: pictures baked once, then position, scale,
 * rotation and alpha per frame. The cel it replaces repainted a canvas the
 * size of the whole mirage whenever its pose string moved — which was every
 * frame the colour was near — and quantised every motion it carried to the
 * cel's twelve repaints a second besides. The bob the customer saw stepping
 * was that, not the easing.
 *
 * What each motion becomes:
 *
 *   - the bob, a ride on its own breath — the body's position, a float, the
 *     same sub-pixel slide a walking cow's is;
 *   - the heat shimmer, hardest while it arrives — a lean (rotation about the
 *     feet) plus a breath of vertical squash. The old drawing sheared; a lean
 *     moves the top the same few pixels and is a transform a sprite can hold;
 *   - the arrival and the never-quite-solid hang — alpha;
 *   - the tail's slow swish — the tail picture rotated about its root, the
 *     hinge the lion's tail swings from.
 *
 * The near ear's flap is the one motion that died here: it rotated one part
 * of the animal, and one part of a translucent whole cannot be its own sprite
 * without compositing against the body it overlaps — the very seams the
 * one-path fill exists to prevent. It moved three pixels a week.
 */
export const mirageBodyLook: Look<Only> = {
  id: 'mirage:body',
  media: ['sketch', 'color'],
  /*
   * The near ear is the highest ink, and it leans: a rotated ellipse reaches
   * sqrt(rx²sin²θ + ry²cos²θ) above its centre, which for this one is 8.79 —
   * not the 8.8 a flat read of the radius suggests, and 211 units up once the
   * animal is magnified. A reach cut to the round number below that shears the
   * top of the ear off along the scratch's edge, invisibly in the numbers and
   * visibly on the animal. Measured, then rounded up.
   */
  reach: 220,
  poses: () => ONE,
  key: () => 'one',
  draw(ctx, _pose, medium) {
    // The animal is drawn in its own small units; the mirage is it four times
    // over, and the swell is the rope's... the sprite's business, not this —
    // so the magnification belongs to the bake, exactly as for the cloud.
    ctx.scale(ELEPHANT_MIRAGE_SCALE, ELEPHANT_MIRAGE_SCALE);
    // Baked at the boil the graphite still holds: out in the pencil this is a
    // drawing on paper, and it does not tremble.
    withBoilAt(0, () => drawElephantBody(ctx, medium));
  },
};

export const mirageTailLook: Look<Only> = {
  id: 'mirage:tail',
  media: ['sketch', 'color'],
  reach: 100,
  poses: () => ONE,
  key: () => 'one',
  draw(ctx, _pose, medium) {
    ctx.scale(ELEPHANT_MIRAGE_SCALE, ELEPHANT_MIRAGE_SCALE);
    withBoilAt(0, () => drawElephantTail(ctx, medium));
  },
};

/** The bob, in world pixels, straight off what the cel drawing used to do. */
function bobPx(clock: number): number {
  return ELEPHANT_MIRAGE_SCALE * mirageBobAt(clock);
}

/**
 * Show the animal, if it is there.
 *
 * The cloud is asked whether or not the animal has come; the body is not —
 * its alpha is zero until the vigil has done its work, and a sprite at alpha
 * zero is still a transform paid every frame.
 */
export function showMirageElephant(
  stage: Stage,
  library: LookLibrary,
  v: Vigil,
  medium: Medium,
  layer: Layer,
  depth: number,
): void {
  const here = clamp(v.elephant, 0, 1);
  const solid = clamp((here - 0.3) / 0.7, 0, 1);
  if (solid <= 0) return;

  const clock = v.beastClock;
  const alpha = medium === 'color' ? solid * 0.8 : solid;
  /*
   * Wavering, hardest while it is still arriving — a tenth of it stays, so the
   * animal in the sky is never quite steady. The old shear leant the top a
   * shade over two dozen pixels; this lean is sized to match, and the squish
   * it carried along is here too.
   */
  const heat = 0.1 + (1 - solid) * 0.9;

  stage.showLook({
    library,
    id: mirageBodyLook.id,
    poseKey: 'one',
    medium,
    layer,
    x: v.elephantX,
    y: v.elephantY - bobPx(clock),
    depth,
    alpha,
    rotation: Math.sin(clock * 2.3) * 0.056 * heat,
    scaleY: 1 - Math.sin(clock * 1.7) * 0.03 * heat,
  });

  stage.showLook({
    library,
    id: mirageTailLook.id,
    poseKey: 'one',
    medium,
    layer,
    x: v.elephantX + ELEPHANT_TAIL_ROOT.x * ELEPHANT_MIRAGE_SCALE,
    y: v.elephantY - bobPx(clock) + ELEPHANT_TAIL_ROOT.y * ELEPHANT_MIRAGE_SCALE,
    depth: depth + 0.000001,
    alpha,
    // The old swish slid the brush's end ±2.4 units; about a root eighteen
    // units long, that is this angle, and the brush rides the same arc.
    rotation: (Math.sin(clock * 0.7) * 2.4) / 18,
  });
}

/** How many slices the wave is carried by. The cloud is a few hundred px wide. */
const MIRAGE_SLICES = 26;

/**
 * Show the cloud.
 *
 * Everything about this is a transform — and every motion of it lives in the
 * vertices, the way the hammock's sag does, rather than in the object: the
 * wave is the points' `x`, the bob is their `y`. The canvas-level transform is
 * left holding only what changes with the animal's arrival, the swell (`scale`)
 * and the amount (`alpha`), which are states rather than motions.
 *
 * The rope is scaled by the swell about its own origin, which is exactly what
 * `lx * grow` did to each lobe; the wave and the bob are given in world pixels
 * and must not be scaled with it, so they go in pre-divided.
 */
export function showMirageCloud(
  stage: Stage,
  library: LookLibrary,
  v: Vigil,
  medium: Medium,
  layer: Layer,
  depth: number,
): void {
  const baked = library.get(mirageCloudLook.id, 'one', medium);
  if (!baked || baked.width === 0) return;

  const clock = v.beastClock;
  const amount = mirageAmount(v.elephant);
  const grow = 0.72 + amount * 0.28;
  const alpha = medium === 'color' ? Math.min(1, amount) : 0.08 + Math.min(1, amount) * 0.14;

  const bob = (ELEPHANT_MIRAGE_SCALE * mirageBobAt(clock)) / grow;
  const points: { x: number; y: number }[] = [];
  const centreY = baked.dy + baked.height / 2 - bob;
  for (let i = 0; i < MIRAGE_SLICES; i++) {
    const px = baked.dx + (baked.width * i) / (MIRAGE_SLICES - 1);
    const lx = px / ELEPHANT_MIRAGE_SCALE;
    const drift = (Math.sin(clock * 1.3 + lx * 0.22) * 1.8 * ELEPHANT_MIRAGE_SCALE) / grow;
    points.push({ x: px + drift, y: centreY });
  }

  stage.showRope({
    library,
    id: mirageCloudLook.id,
    poseKey: 'one',
    medium,
    layer,
    x: v.elephantX,
    y: v.elephantY,
    depth: depth - 0.000001,
    alpha,
    scale: grow,
    points,
  });
}
