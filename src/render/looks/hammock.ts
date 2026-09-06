import { drawHammockNearEdge, drawSleeper } from '../../entities/rest';
import { drawHammockBand, drawHammockEnds, hammockCurve, HAMMOCK_SPAN } from '../../world/hammock';
import { withBoilAt } from '../../media/ink';
import type { Medium } from '../../media/medium';
import type { Look } from '../looks';

/**
 * The hammock, as four flat pictures that are bent by geometry.
 *
 * The first attempt at this baked the sag itself: six pictures across the
 * second it takes to lie down, and the renderer picked the nearest. It was
 * wrong twice over and the second way is the one that matters.
 *
 *   - It looked like it was lagging. The cloth dropped four pixels at a time,
 *     six times, which reads exactly like a frame being dropped even though the
 *     frame rate never moved. A smooth motion cut into steps is not cheaper
 *     smoothness, it is a stutter you built on purpose.
 *   - It cost six times what it should. 2.1MB for one hammock, because every
 *     sag multiplied by every other dimension.
 *
 * The rule this broke is the one this whole design is built on, and it is worth
 * stating properly: **a picture is a drawing that is genuinely different. A
 * deformation is not.** A walk cycle is pictures. A head coming up from the
 * grass is pictures. Cloth sagging under somebody is one picture being bent,
 * and bending is what geometry is for.
 *
 * So: the cloth is baked flat, once, and shown on a rope whose points follow
 * `hammockCurve` every frame. The sag is continuous — as smooth as the easing
 * behind it — and it costs twenty-three vertex positions a frame, which is
 * about two hundred bytes against the 48KB a repaint used to be.
 *
 * The ends do not move at all: `hammockCurve` is zero at both ties whatever the
 * sag, so the ropes and knots are one picture, placed and never touched.
 */

/** How many points the cloth is bent through. The drawing itself uses 22. */
export const CLOTH_POINTS = 23;

/** Baked hands, cycled at the ink's own rate. Graphite bakes one and holds. */
export const HAMMOCK_BOILS = 3;

/** A pose here is only which hand drew it. The shape is geometry. */
export interface HammockPose {
  readonly boil: number;
}

export function hammockBoil(boilTick: number): HammockPose {
  return { boil: ((boilTick % HAMMOCK_BOILS) + HAMMOCK_BOILS) % HAMMOCK_BOILS };
}

function boilPoses(): HammockPose[] {
  return Array.from({ length: HAMMOCK_BOILS }, (_, boil) => ({ boil }));
}

/** Graphite holds still, so its three hands are one picture. */
function boilKey(pose: HammockPose, medium: Medium): string {
  return `b${medium === 'color' ? pose.boil : 0}`;
}

/**
 * A stand-in at the origin with the cloth hanging flat.
 *
 * `sag` zero is the straight strip the rope bends. Nothing else about the
 * drawing changes: these are the same functions the frame has always called.
 */
const FLAT = 0;

export const hammockEndsLook: Look<HammockPose> = {
  id: 'hammock:ends',
  media: ['sketch', 'color'],
  reach: 120,
  poses: boilPoses,
  key: boilKey,
  draw(ctx, pose, medium) {
    withBoilAt(medium === 'color' ? pose.boil : 0, () =>
      drawHammockEnds(ctx, 0, 0, FLAT, medium),
    );
  },
};

export const hammockClothLook: Look<HammockPose> = {
  id: 'hammock:cloth',
  media: ['sketch', 'color'],
  reach: 120,
  poses: boilPoses,
  key: boilKey,
  draw(ctx, pose, medium) {
    withBoilAt(medium === 'color' ? pose.boil : 0, () => drawHammockBand(ctx, 0, 0, FLAT, medium));
  },
};

/** The near edge, over the legs, so whoever is lying there is *in* the cloth. */
export const hammockEdgeLook: Look<HammockPose> = {
  id: 'hammock:edge',
  media: ['color'],
  reach: 120,
  poses: () => [{ boil: 0 }],
  key: () => 'flat',
  draw(ctx) {
    drawHammockNearEdge(ctx, 0, 0, FLAT);
  },
};

/**
 * Whoever is lying in it, also flat and also bent.
 *
 * A person is not cloth, but they lie along the cloth, and the part of the
 * curve they occupy — a bit either side of the middle — is its flattest. Baked
 * fully settled; how far they have sunk in is the sag, which is the rope, and
 * how far they have faded in is alpha.
 */
export const hammockSleeperLook: Look<HammockPose> = {
  id: 'hammock:sleeper',
  media: ['color'],
  reach: 120,
  poses: () => [{ boil: 0 }],
  key: () => 'flat',
  draw(ctx) {
    drawSleeper(ctx, 0, 0, FLAT, 1, 0);
  },
};

/**
 * Where the cloth's points go, given how far it is hanging.
 *
 * The picture was baked flat and its box measured from the ink, so the points
 * run across that box rather than across the span — a stripe that overhangs the
 * cloth by three pixels is part of the picture and has to be carried by it. The
 * curve is sampled at the `u` each point stands at.
 */
export function clothPoints(
  dx: number,
  width: number,
  centreY: number,
  sag: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < CLOTH_POINTS; i++) {
    const x = dx + (width * i) / (CLOTH_POINTS - 1);
    const u = Math.min(1, Math.max(0, (x + HAMMOCK_SPAN / 2) / HAMMOCK_SPAN));
    points.push({ x, y: centreY + hammockCurve(u, sag) });
  }
  return points;
}
