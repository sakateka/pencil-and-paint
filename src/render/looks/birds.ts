import { drawBirdBody } from '../../entities/rest';
import type { Medium } from '../../media/medium';
import type { Look } from '../looks';

/**
 * The bird on the tree by the hammock, as nine pictures.
 *
 * The most extreme case of the old design in the whole game: twenty-one pixels
 * by twelve of ink, carried in a canvas of four hundred and twenty square. Every
 * repaint pushed 689 kilobytes to the GPU of which 99.9 per cent was nothing at
 * all — and it repainted whenever `Rest` changed, which after the valley is
 * finished is every frame, for ever, because a counter is running.
 *
 * Worse, the canvas was asked for whether or not there was a bird in it: the
 * drawing function returns immediately before the bird arrives, but the cel
 * around it did not know that and cleared and re-uploaded a blank square twelve
 * times a second for the whole of any session in which nobody finished the game.
 *
 * Almost nothing about a sitting bird is a different drawing. Where it sits, the
 * last of its drop onto the branch, its slow bob, which way it is facing and how
 * far it has faded in are all transforms. Two things are pictures: how far the
 * tail is flicked, and how far the wing is up while it is still coming in.
 */

/** Tail positions: at rest, and three degrees of flick. */
const FLICKS = [0, 0.8, 1.6, 2.4];

/** Wing positions while landing, from full down-beat to full up. */
const FLUTTERS = [-5, -2.5, 0, 2.5, 5];

export type BirdPose =
  | { readonly kind: 'perch'; readonly index: number }
  | { readonly kind: 'land'; readonly index: number };

/**
 * The pose a live bird is in.
 *
 * `settle` is how far through landing it is, `t` its own clock. Both stay
 * continuous — they drive position and alpha, which cost nothing. Only the
 * flick and the wing are quantised, because only they change the drawing.
 */
export function birdPose(settle: number, t: number): BirdPose {
  if (settle < 1) {
    const flutter = (1 - settle) * Math.sin(t * 22) * 5;
    let index = 0;
    let best = Infinity;
    for (let i = 0; i < FLUTTERS.length; i++) {
      const d = Math.abs(FLUTTERS[i] - flutter);
      if (d < best) {
        best = d;
        index = i;
      }
    }
    return { kind: 'land', index };
  }
  const flick = Math.max(0, Math.sin(t * 0.9) - 0.93) * 34;
  let index = 0;
  for (let i = 0; i < FLICKS.length; i++) if (flick >= FLICKS[i]) index = i;
  return { kind: 'perch', index };
}

/** Which way it is looking, on its own slow schedule. A mirror, not a picture. */
export function birdFacesLeft(t: number): boolean {
  return Math.sin(t * 0.37) <= 0;
}

/** Its small bob, and the last of its drop. Both transforms. */
export function birdOffsetY(settle: number, t: number): number {
  return -(1 - settle) * 26 + Math.sin(t * 1.4) * 0.7;
}

/** How far it has faded in. */
export function birdAlpha(settle: number): number {
  return Math.min(1, settle * 2.5);
}

export const birdLook: Look<BirdPose> = {
  id: 'bird',
  /* Over the colour, never through it — so there is no graphite copy. */
  media: ['color'],
  reach: 24,

  *poses(): Generator<BirdPose> {
    for (let index = 0; index < FLICKS.length; index++) yield { kind: 'perch', index };
    for (let index = 0; index < FLUTTERS.length; index++) yield { kind: 'land', index };
  },

  key(pose: BirdPose): string {
    return `${pose.kind}${pose.index}`;
  },

  draw(ctx: CanvasRenderingContext2D, pose: BirdPose, _medium: Medium): void {
    if (pose.kind === 'perch') drawBirdBody(ctx, FLICKS[pose.index], 0);
    else drawBirdBody(ctx, 0, FLUTTERS[pose.index]);
  },
};
