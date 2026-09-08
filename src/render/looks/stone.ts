import { drawGlint, drawSecretStone, type SecretStone } from '../../entities/stone';
import { withBoilAt } from '../../media/ink';
import type { Medium } from '../../media/medium';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';

/**
 * The black stone, and the light it catches.
 *
 * Two pictures and no more. The stone never changes shape, and the wink is
 * alpha and scale on one star — the whole reason a glint can run at sixty
 * frames a second without repainting anything.
 */

/** The one pose a part with no pictures has. */
interface Only {
  readonly only: 0;
}

const ONE: readonly Only[] = [{ only: 0 }];

export const secretStoneLook: Look<Only> = {
  id: 'stone:secret',
  media: ['sketch', 'color'],
  reach: 16,
  poses: () => ONE,
  key: () => 'one',
  draw(ctx, _pose, medium) {
    // A stone on paper does not tremble, whatever the ink is doing elsewhere.
    withBoilAt(0, () => drawSecretStone(ctx, medium));
  },
};

/**
 * Colour only.
 *
 * There is no such thing as a glint in the graphite: out there the valley is an
 * unfinished drawing, and nothing in an unfinished drawing catches the light.
 */
export const glintLook: Look<Only> = {
  id: 'stone:glint',
  media: ['color'],
  reach: 14,
  poses: () => ONE,
  key: () => 'one',
  draw(ctx) {
    withBoilAt(0, () => drawGlint(ctx));
  },
};

export function registerStoneLooks(library: LookLibrary): void {
  library.register(secretStoneLook);
  library.register(glintLook);
}

/** Show the stone, and the wink if it is mid-wink and the colour is on it. */
export function showSecretStone(
  stage: Stage,
  library: LookLibrary,
  stone: SecretStone,
  medium: Medium,
  layer: Layer,
  depth: number,
): void {
  stage.showLook({
    library,
    id: secretStoneLook.id,
    poseKey: 'one',
    medium,
    layer,
    x: stone.x,
    y: stone.y,
    depth,
  });

  if (medium !== 'color' || stone.glint <= 0.01) return;
  stage.showLook({
    library,
    id: glintLook.id,
    poseKey: 'one',
    medium,
    layer,
    // On the facet, which is up and a little right of the stone's own origin.
    x: stone.x + 1.5,
    y: stone.y - 6,
    depth: depth + 0.000001,
    // Opening out as it brightens, so the light arrives rather than appears.
    scale: 0.55 + stone.glint * 0.65,
    alpha: stone.glint,
  });
}
