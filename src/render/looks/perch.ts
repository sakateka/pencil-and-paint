import {
  drawLoungerBody,
  drawLoungerLegs,
  loungerBreath,
  type Perch,
} from '../../entities/perch';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';
import { sitterLook } from './stump';

/**
 * Whoever is resting on a bench or in a haystack, as pictures.
 *
 * This was the most expensive thing left in the game, and the way it is
 * measured says why it went unnoticed: it only costs anything while you are
 * lying down, and lying down is the one moment nobody profiles. The cel around
 * it was two hundred and sixty pixels square — a hundred and eighty kilobytes —
 * and its pose string carried the perch's own clock, so it was repainted at
 * every tick of the boil for as long as you stayed there. **3.1MB a second to
 * redraw somebody asleep.**
 *
 * Nothing in either drawing is a picture at all. The person on the bench is one
 * drawing, mirrored; the person in the hay is two, and the only thing that
 * moves is the angle of their chest.
 */

/** The one pose a part with no pictures has. */
interface Only {
  readonly only: 0;
}

const ONE: readonly Only[] = [{ only: 0 }];

/**
 * The legs, lying still down the slope of the haystack.
 *
 * Colour only, here and below. Whoever is on a perch is the walker, the walker
 * carries the colour with them, and so they are never seen in graphite — which
 * is why the renderer only ever asked this cel for its painted half. The pencil
 * drawing stays in `entities/perch.ts` beside the painted one; it is simply not
 * baked, since baking a picture nothing can ask for is memory spent on nobody.
 */
const loungerLegsLook: Look<Only> = {
  id: 'perch:legs',
  media: ['color'],
  reach: 36,
  poses: () => ONE,
  key: () => 'one',
  draw: (ctx, _pose, medium) => drawLoungerLegs(ctx, medium),
};

/**
 * Everything above the hips, baked already leaning back.
 *
 * `reach` is measured from the hips, which is the perch's own origin and the
 * point the lean turns about: the crown of the hair reaches thirty-two units
 * from it, and the lean does not change that — a rotation about the origin
 * cannot move any stroke further from it than it already was.
 */
const loungerBodyLook: Look<Only> = {
  id: 'perch:body',
  media: ['color'],
  reach: 44,
  poses: () => ONE,
  key: () => 'one',
  draw: (ctx, _pose, medium) => drawLoungerBody(ctx, medium),
};

export function registerPerchLooks(library: LookLibrary): void {
  library.register(loungerLegsLook);
  library.register(loungerBodyLook);
}

/**
 * Show whoever is resting, if anybody is.
 *
 * The bench borrows the stump's sitter outright — it is the same person sitting
 * the same way, and it was already the same function; now it is the same
 * picture too, so the bench costs the library nothing at all.
 *
 * `face` is a mirror about the seat in both cases. The sitter's own drawing
 * offsets itself by one unit against its facing, so mirroring the picture about
 * the point it hangs from is exactly what drawing it the other way round did.
 */
export function showPerch(
  stage: Stage,
  library: LookLibrary,
  perch: Perch,
  layer: Layer,
  depth: number,
): void {
  if (!perch.resting) return;
  const flipX = perch.face < 0;

  if (perch.pose === 'bench') {
    stage.showLook({
      library,
      id: sitterLook.id,
      poseKey: 'one',
      medium: 'color',
      layer,
      // The bench's seat is twenty above its origin; the sitter's own drawing
      // puts the hips a little below wherever it is told, so this lands on it.
      x: perch.x + 2,
      y: perch.y - 11,
      depth,
      flipX,
    });
    return;
  }

  const on = { library, medium: 'color', layer, x: perch.x, y: perch.y, flipX } as const;
  stage.showLook({ ...on, id: loungerLegsLook.id, poseKey: 'one', depth });
  stage.showLook({
    ...on,
    id: loungerBodyLook.id,
    poseKey: 'one',
    depth: depth + 0.000002,
    rotation: loungerBreath(perch.clock),
  });
}
