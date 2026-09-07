import { drawSitter, drawStump } from '../../entities/vigil';
import { withBoilAt } from '../../media/ink';
import type { Medium } from '../../media/medium';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';
import type { Vigil } from '../../entities/vigil';

/**
 * The stump, as two flat pictures.
 *
 * A stump is a stump for ever: one drawing, placed. The cel it replaces was
 * asked for twelve times a second in colour merely because the boil tick
 * moved, and while somebody sat on it its pose string moved every frame —
 * four megabytes a second to repaint a picture nobody was looking at change.
 *
 * The sitter is a second picture, mirrored about the seat for whoever looks
 * west: the mirror is the sitter's own `face`, the picture is baked facing
 * east. It hangs slightly over the stump, the way it was drawn over it.
 */

/** The one pose a part with no pictures has. */
interface Only {
  readonly only: 0;
}

const ONE: readonly Only[] = [{ only: 0 }];

export const stumpLook: Look<Only> = {
  id: 'stump:stump',
  media: ['sketch', 'color'],
  reach: 30,
  poses: () => ONE,
  key: () => 'one',
  draw(ctx, _pose, medium) {
    // Out in the graphite this is a drawing on paper, and it does not tremble.
    withBoilAt(0, () => drawStump(ctx, medium));
  },
};

export const sitterLook: Look<Only> = {
  id: 'stump:sitter',
  media: ['sketch', 'color'],
  reach: 35,
  poses: () => ONE,
  key: () => 'one',
  draw(ctx, _pose, medium) {
    withBoilAt(0, () => drawSitter(ctx, 1, medium));
  },
};

export function registerStumpLooks(library: LookLibrary): void {
  library.register(stumpLook);
  library.register(sitterLook);
}

/** Show the stump, and whoever is sitting on it facing whatever is coming. */
export function showStump(
  stage: Stage,
  library: LookLibrary,
  v: Vigil,
  medium: Medium,
  layer: Layer,
  depth: number,
): void {
  stage.showLook({
    library,
    id: stumpLook.id,
    poseKey: 'one',
    medium,
    layer,
    x: v.x,
    y: v.y,
    depth,
  });

  if (!v.sitting) return;
  stage.showLook({
    library,
    id: sitterLook.id,
    poseKey: 'one',
    medium,
    layer,
    x: v.x,
    y: v.y,
    depth: depth + 0.000001,
    flipX: v.elephantX < v.x,
  });
}
