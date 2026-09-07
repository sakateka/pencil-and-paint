import { drawHeart, HEART_UNIT, type Particles } from '../../entities/particles';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';

/**
 * The hearts that come up when the cat is stroked.
 *
 * The last thing in the game drawn into a canvas while you play. It was never
 * expensive — three hearts, a second and a half, and only when somebody pets a
 * cat — but it was the last user of the cel path, and the note over it said a
 * heart is "a pair of bezier curves whose shape changes as it swells". It is
 * not: every control point in that path is a multiple of one number, so a heart
 * swelling is a heart being scaled, and a scale is a transform.
 *
 * One picture, in white, tinted per heart. Three colours are drawn from at
 * random and a heart is one flat fill, which is exactly the case a tint is for
 * — the same reasoning that keeps the pots' glow to one picture while their
 * jars are baked fourteen times.
 */
const heartLook: Look<{ readonly only: 0 }> = {
  id: 'heart',
  /* They rise from a cat you are standing next to, so always in the colour. */
  media: ['color'],
  reach: HEART_UNIT * 3,
  poses: () => [{ only: 0 }],
  key: () => 'one',
  draw: (ctx) => drawHeart(ctx),
};

export function registerHeartLooks(library: LookLibrary): void {
  library.register(heartLook);
}

/** A colour the sprite can be tinted by, from a hex. */
function tintOf(hex: string): number {
  const parsed = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(parsed) ? 0xffffff : parsed;
}

/** Show whatever hearts are in the air, if any. Usually there are none. */
export function showHearts(
  stage: Stage,
  library: LookLibrary,
  particles: Particles,
  layer: Layer,
  depth: number,
): void {
  for (const heart of particles.heartsInAir()) {
    stage.showLook({
      library,
      id: heartLook.id,
      poseKey: 'one',
      medium: 'color',
      layer,
      x: heart.x,
      y: heart.y,
      depth,
      scale: heart.size / HEART_UNIT,
      alpha: heart.alpha,
      tint: tintOf(heart.colour),
    });
  }
}
