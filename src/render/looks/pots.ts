import type { Hex } from '../../core/color';
import { drawPotGlow, drawPotJar, potBob, type Pot } from '../../entities/pots';
import { withBoilAt } from '../../media/ink';
import type { Medium } from '../../media/medium';
import { POT_HUES } from '../../world/palette';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';

/**
 * The paint pots: fourteen jars and one glow.
 *
 * A pot does exactly one thing — it rises and settles on the spot — and that is
 * a translate. Everything else about it is fixed from the moment the valley is
 * scattered. So the whole animal, so to speak, is two sprites and a number.
 *
 * The colours are not a tint. A jar is cream at the lid, the pot's own colour in
 * the body and the spill, dark at the rim, brown at the brush and white at the
 * highlight, and a tint multiplies all of that at once. Fourteen jars is the
 * honest answer and it is nearly free: a jar is twenty pixels by thirty, so the
 * whole palette costs less than one of the frozen canvases this replaces. The
 * glow *is* a tint, because a glow is one colour by definition, and baking that
 * per hue would cost more than the jars do.
 */

/** Inked variants of the pencil jar, cycled between the fourteen pots. */
const HANDS = 3;

interface JarPose {
  readonly hue: number;
  readonly hand: number;
}

const potGlow: Look<{ readonly only: 0 }> = {
  id: 'pot:glow',
  /* Only paint. A pot out in the graphite gives off no light; that is the point. */
  media: ['color'],
  reach: 44,
  poses: () => [{ only: 0 }],
  key: () => 'one',
  draw: (ctx) => drawPotGlow(ctx),
};

const potJar: Look<JarPose> = {
  id: 'pot',
  media: ['sketch', 'color'],
  reach: 34,
  *poses(): Generator<JarPose> {
    for (let hue = 0; hue < POT_HUES.length; hue++) {
      for (let hand = 0; hand < HANDS; hand++) yield { hue, hand };
    }
  },
  /*
   * Paint cares which colour it is and graphite does not; graphite cares which
   * hand drew it and paint does not, because nothing in the colour pass
   * jitters. So fourteen by three poses bake as fourteen pictures and three.
   */
  key: (pose, medium) => (medium === 'color' ? `c${pose.hue}` : `h${pose.hand}`),
  draw: (ctx, pose, medium) =>
    /*
     * Baked at one tick and left there, awake or asleep.
     *
     * The pencil pot used to boil while the colour was on it, and that is the
     * same fault the field had: the graphite copy lies under the paint and
     * shows through as a one-pixel fringe along the silhouette, so boiling it
     * shivers the outline seven times a second and nothing else.
     */
    withBoilAt(pose.hand, () => drawPotJar(ctx, POT_HUES[pose.hue] as Hex, medium, pose.hand * 97)),
};

export function registerPotLooks(library: LookLibrary): void {
  library.register(potGlow);
  library.register(potJar);
}

/** A colour the glow sprite can be tinted by. */
function tintOf(hex: string): number {
  const parsed = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(parsed) ? 0xffffff : parsed;
}

/**
 * Which pot this is, as far as the pictures are concerned.
 *
 * One pot per colour, in order — see `scatterPots` — so the hue is already a
 * stable index, and it is the only one a pot carries. The hand comes off the
 * same number, which spreads the three inked variants evenly through the
 * fourteen without anybody having to store a slot.
 */
function poseOfPot(pot: Pot): JarPose {
  const hue = Math.max(0, POT_HUES.indexOf(pot.hue));
  return { hue, hand: hue % HANDS };
}

/** Show one pot: its glow if the colour has reached it, then the jar. */
export function showPot(
  stage: Stage,
  library: LookLibrary,
  pot: Pot,
  medium: Medium,
  layer: Layer,
  depth: number,
): void {
  const pose = poseOfPot(pot);
  const y = pot.y + potBob(pot.clock, pot.phase, pot.stir);

  if (medium === 'color') {
    stage.showLook({
      library,
      id: potGlow.id,
      poseKey: 'one',
      medium,
      layer,
      x: pot.x,
      y,
      depth: depth - 0.000002,
      tint: tintOf(pot.hue),
    });
  }

  stage.showLook({
    library,
    id: potJar.id,
    poseKey: potJar.key(pose, medium),
    medium,
    layer,
    x: pot.x,
    y,
    depth,
  });
}
