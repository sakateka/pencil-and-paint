import { drawSunBody, SUN, sunVisible } from '../../world/sky';
import { withBoilAt } from '../../media/ink';
import type { Medium } from '../../media/medium';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';

/**
 * The sun, as one picture that turns.
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
 */

/** The one pose a part with no pictures has. */
interface Only {
  readonly only: 0;
}

const ONE: readonly Only[] = [{ only: 0 }];

export const sunLook: Look<Only> = {
  id: 'sun',
  media: ['sketch', 'color'],
  /*
   * The flame tips reach SUN.r * 1.325 from the centre; rounded up, and then
   * some, because the hooks lean past their radius.
   */
  reach: 215,
  poses: () => ONE,
  key: () => 'one',
  draw(ctx, _pose, medium) {
    // The graphite sun is drawn once and holds: a ruled-in sun does not turn.
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
    rotation: medium === 'color' ? elapsed * SPIN : 0,
  });
}
