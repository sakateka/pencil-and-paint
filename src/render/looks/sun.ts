import { drawSunBody, SUN, sunVisible } from '../../world/sky';
import { withBoilAt } from '../../media/ink';
import type { Medium } from '../../media/medium';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';

/**
 * The painted sun, as one picture that turns.
 *
 * The flames rotate as one rigid drawing — the old cel repainted a canvas the
 * size of the whole sun six times a second to carry that, 0.67MB a repaint,
 * and kept repainting it while the camera stood in the northern half of the
 * map with the sun's longitude in view but its altitude nowhere on screen.
 * Sixty frames a second of a rotation is a transform, and an off-screen
 * transform is free.
 *
 * The disc the flames ring is a circle: the rotation carries it invisibly,
 * which is why the whole sun is one picture and not two.
 *
 * Only in paint. Out in the graphite the sun does not turn — a ruled-in sun
 * is a drawing on paper — and a thing that never moves against the sky has no
 * business being a sprite over it: that one is baked into the sky strip with
 * the clouds and the hills, in `bakeSkyStrip`.
 */

/** The one pose a part with no pictures has. */
interface Only {
  readonly only: 0;
}

const ONE: readonly Only[] = [{ only: 0 }];

export const sunLook: Look<Only> = {
  id: 'sun',
  media: ['color'],
  /*
   * The flame tips reach SUN.r * 1.325 from the centre; rounded up, and then
   * some, because the hooks lean past their radius.
   */
  reach: 215,
  /*
   * Half resolution: this is the biggest flat fill in the game — a disc four
   * hundred units across and a ring of licks round it, with no detail in
   * either smaller than a flame. Life size it was 597KB on its own, a fifth of
   * the whole library, for a picture with two colours in it. Halved it is
   * 150KB and the only difference is a ramp two units wide on the rim, which
   * on a sun that turns reads as sunlight rather than as blur.
   */
  grain: () => 2,
  poses: () => ONE,
  key: () => 'one',
  draw(ctx, _pose, medium) {
    // Baked at spin zero; the turn is the sprite's rotation, below.
    withBoilAt(0, () => drawSunBody(ctx, medium));
  },
};

export function registerSunLooks(library: LookLibrary): void {
  library.register(sunLook);
}

/** How fast the flame ring turns, radians a second — the drawing's own rate. */
const SPIN = 0.035;

export function showSun(
  stage: Stage,
  library: LookLibrary,
  medium: Medium,
  layer: Layer,
  depth: number,
  /** Seconds since the world began, for the turn. */
  elapsed: number,
  viewX: number,
  viewWidth: number,
): void {
  if (medium !== 'color') return;
  if (!sunVisible(viewX, viewWidth)) return;
  stage.showLook({
    library,
    id: sunLook.id,
    poseKey: 'one',
    medium,
    layer,
    x: SUN.x,
    y: SUN.y,
    depth,
    rotation: elapsed * SPIN,
  });
}
