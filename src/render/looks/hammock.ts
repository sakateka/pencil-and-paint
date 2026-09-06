import { drawHammock, Rest } from '../../entities/rest';
import { withBoilAt } from '../../media/ink';
import type { Medium } from '../../media/medium';
import type { Look } from '../looks';

/**
 * The hammock, as a finite set of pictures.
 *
 * The worst offender in the old frame and the reason it goes first: a cloth
 * whose ink measures 170 by 71 lived in a canvas of 420 by 420 — ninety-three
 * per cent of every upload was transparent padding — and it was re-uploaded
 * whenever any field of `Rest` moved, including a private counter that ticks
 * for ever once the valley is finished. Measured, the hammock and the bird
 * between them ran at eighty megabytes a second in that state.
 *
 * What is a picture here, and what is not:
 *
 *   sag       the cloth genuinely bends, so it is a picture: `settled` in six
 *             steps across the second and a bit it takes to lie down
 *   sleeper   drawn only while somebody is in it, so `resting` is a picture too
 *   swing     the whole drawing slides sideways — a transform, and free
 *   boil      the hand re-inks the drawing seven times a second; three baked
 *             ticks cycle in its place, which is how boil has been done by hand
 *             since long before there were computers
 *
 * The graphite copy holds perfectly still — pencil on paper, and paper does not
 * move — so it ignores the boil and bakes one tick instead of three. That is
 * what `key` taking a medium is for.
 */

/** How finely the cloth's bend is cut. Six across a 1.1s settle. */
const SETTLE_STEPS = 6;

/** Baked hands, cycled at the ink's own rate. */
export const HAMMOCK_BOILS = 3;

export interface HammockPose {
  /** `settled`, quantised: 0 is empty cloth, SETTLE_STEPS is fully loaded. */
  readonly step: number;
  readonly resting: boolean;
  readonly boil: number;
}

/** The pose a live hammock is currently in. The only place quantising happens. */
export function hammockPose(
  settled: number,
  resting: boolean,
  boilTick: number,
): HammockPose {
  return {
    step: Math.round(Math.min(1, Math.max(0, settled)) * SETTLE_STEPS),
    resting,
    boil: ((boilTick % HAMMOCK_BOILS) + HAMMOCK_BOILS) % HAMMOCK_BOILS,
  };
}

export const hammockLook: Look<HammockPose> = {
  id: 'hammock',
  media: ['sketch', 'color'],
  /* The old cel was 420 square and the ink came nowhere near its edge. */
  reach: 240,

  *poses(): Generator<HammockPose> {
    for (let step = 0; step <= SETTLE_STEPS; step++) {
      for (const resting of [false, true]) {
        for (let boil = 0; boil < HAMMOCK_BOILS; boil++) {
          yield { step, resting, boil };
        }
      }
    }
  },

  key(pose: HammockPose, medium: Medium): string {
    // Graphite does not boil, so its pictures do not carry a boil in their name
    // and the three variants collapse into one.
    const boil = medium === 'color' ? pose.boil : 0;
    return `${pose.step}${pose.resting ? 'r' : ''}b${boil}`;
  },

  draw(ctx: CanvasRenderingContext2D, pose: HammockPose, medium: Medium): void {
    /*
     * A stand-in `Rest` at the origin, holding still.
     *
     * `drawHammock` paints around the hammock's own world position and reads
     * `swing` off the clock; both are what the transform does now, so the
     * stand-in sits at (0, 0) with its clock at zero and the drawing comes out
     * in the look's own coordinates. Nothing about the drawing itself changes —
     * this is the same function the frame has always called.
     */
    const rest = new Rest(0, 0);
    rest.resting = pose.resting;
    rest.settled = pose.step / SETTLE_STEPS;
    withBoilAt(medium === 'color' ? pose.boil : 0, () => drawHammock(ctx, rest, medium));
  },
};
