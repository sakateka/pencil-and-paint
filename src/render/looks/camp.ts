import {
  catchAngle,
  catchHeight,
  drawCatchKind,
  drawFireGlow,
  drawFlames,
  drawFloat,
  drawGlint,
  drawHearth,
  drawRipple,
  drawRod,
  drawStrand,
  drawTent,
  fireFlicker,
  flameFrame,
  glintAt,
  ripplesAt,
  tackleOf,
  CATCH_KINDS,
  FLAME_FRAMES,
  FLAME_PERIOD,
  GLINT_ARM,
  RIPPLE_BANDS,
  ROD_LENGTH,
  STRAND_LENGTH,
  type CatchKind,
  type Fishing,
} from '../../entities/fishing';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';

/**
 * The fishing camp, as pictures and geometry.
 *
 * Measured with a line in the water: **5.9MB a second while you wait, and up to
 * 14.8MB while a fish is on** — the largest single uploader left in the game.
 * It is also the least likely to be caught by anybody profiling, because
 * fishing only opens once the last pot is found.
 *
 * The cel was three hundred and sixty units square and its pose string carried
 * the camp's clock, so it was repainted at the boil's rate for as long as you
 * sat there, and every frame of it redrew a tent, a fire, a rod, a line, three
 * ripples and a float to move a float by a tenth of a pixel.
 *
 * Almost none of that is a drawing:
 *
 * - the **tent**, the **hearth** and the **glow** never change at all;
 * - the **rod** is a stick turned about the hand and shortened as it sweeps up
 *   — a rotation and a scale along its own length;
 * - the **line** is a curve, and a curve of hairline is a handful of straight
 *   pieces laid end to end, each one the same picture turned and stretched;
 * - the **ripples** are a size and a fade;
 * - the **float** is a position and a tilt;
 * - the **catch** is an arc and a turn, one picture per thing you can land.
 *
 * What is genuinely a different drawing every instant is the flame, and it is
 * the only thing here baked as a row of pictures. See `FLAME_PERIOD`.
 */

/** The one pose a part with no pictures has. */
interface Only {
  readonly only: 0;
}

const ONE: readonly Only[] = [{ only: 0 }];

function partLook(spec: {
  id: string;
  reach: number;
  draw(ctx: CanvasRenderingContext2D): void;
}): Look<Only> {
  return {
    id: spec.id,
    /* The camp belongs to the walker, who carries the colour: never graphite. */
    media: ['color'],
    reach: spec.reach,
    poses: () => ONE,
    key: () => 'one',
    draw: (ctx) => spec.draw(ctx),
  };
}

const tentLook = partLook({ id: 'camp:tent', reach: 44, draw: drawTent });
const hearthLook = partLook({ id: 'camp:hearth', reach: 26, draw: drawHearth });
/* The glow is soft to its very edge, so it is the one thing here worth baking
 * coarse: half resolution is a quarter of the pixels of a 92-unit blob and
 * there is nothing in it fine enough to lose. */
const glowLook: Look<Only> = {
  ...partLook({ id: 'camp:glow', reach: 52, draw: drawFireGlow }),
  grain: () => 2,
};
const rodLook = partLook({ id: 'camp:rod', reach: ROD_LENGTH + 4, draw: drawRod });
const strandLook = partLook({ id: 'camp:strand', reach: STRAND_LENGTH + 4, draw: drawStrand });
const floatLook = partLook({ id: 'camp:float', reach: 10, draw: drawFloat });
const glintLook = partLook({ id: 'camp:glint', reach: GLINT_ARM + 4, draw: drawGlint });

interface FlamePose {
  readonly step: number;
}

const flameLook: Look<FlamePose> = {
  id: 'camp:flame',
  media: ['color'],
  reach: 24,
  *poses(): Generator<FlamePose> {
    for (let step = 0; step < FLAME_FRAMES; step++) yield { step };
  },
  key: (pose) => `f${pose.step}`,
  draw: (ctx, pose) => drawFlames(ctx, (pose.step * FLAME_PERIOD) / FLAME_FRAMES),
};

interface RipplePose {
  readonly band: number;
}

const rippleLook: Look<RipplePose> = {
  id: 'camp:ripple',
  media: ['color'],
  reach: Math.ceil(RIPPLE_BANDS[RIPPLE_BANDS.length - 1]) + 4,
  *poses(): Generator<RipplePose> {
    for (let band = 0; band < RIPPLE_BANDS.length; band++) yield { band };
  },
  key: (pose) => `r${pose.band}`,
  draw: (ctx, pose) => drawRipple(ctx, RIPPLE_BANDS[pose.band]),
};

interface CatchPose {
  readonly kind: CatchKind;
}

const catchLook: Look<CatchPose> = {
  id: 'camp:catch',
  media: ['color'],
  reach: 26,
  *poses(): Generator<CatchPose> {
    for (const kind of CATCH_KINDS) yield { kind };
  },
  key: (pose) => pose.kind,
  draw: (ctx, pose) => drawCatchKind(ctx, pose.kind),
};

export function registerCampLooks(library: LookLibrary): void {
  library.register(glowLook);
  library.register(tentLook);
  library.register(hearthLook);
  library.register(flameLook);
  library.register(rodLook);
  library.register(strandLook);
  library.register(rippleLook);
  library.register(floatLook);
  library.register(catchLook);
  library.register(glintLook);
}

/** Which baked ring is nearest this size, so the scale stays near one. */
function bandFor(radius: number): number {
  let best = 0;
  for (let i = 1; i < RIPPLE_BANDS.length; i++) {
    if (Math.abs(Math.log(radius / RIPPLE_BANDS[i])) < Math.abs(Math.log(radius / RIPPLE_BANDS[best]))) {
      best = i;
    }
  }
  return best;
}

/** How many straight pieces the sagging line is drawn as. */
const STRAND_PIECES = 5;

/**
 * Show the camp and everything in the walker's hands.
 *
 * Depths follow the order the one canvas used to be painted in, which is the
 * order they have to keep: glow under the grass-line, tent and fire behind,
 * then the rod, the line, the water, the float, and whatever is on the end of
 * it over the lot.
 */
export function showCamp(
  stage: Stage,
  library: LookLibrary,
  f: Fishing,
  walkerX: number,
  walkerY: number,
  face: -1 | 1,
  layer: Layer,
  depth: number,
): void {
  if (!f.active) return;
  const on = { library, medium: 'color', layer } as const;
  const at = (n: number) => depth + n * 0.000001;

  stage.showLook({
    ...on,
    id: glowLook.id,
    poseKey: 'one',
    x: f.fireX,
    y: f.fireY,
    depth: at(0),
    scale: fireFlicker(f.clock),
  });
  stage.showLook({ ...on, id: tentLook.id, poseKey: 'one', x: f.tentX, y: f.tentY, depth: at(1) });
  stage.showLook({ ...on, id: hearthLook.id, poseKey: 'one', x: f.fireX, y: f.fireY, depth: at(2) });
  stage.showLook({
    ...on,
    id: flameLook.id,
    poseKey: `f${flameFrame(f.clock)}`,
    x: f.fireX,
    y: f.fireY,
    depth: at(3),
  });

  const rig = tackleOf(f, walkerX, walkerY, face);

  // The rod: one picture, hung from the hand and turned to point at its tip.
  const rodX = rig.tipX - rig.handX;
  const rodY = rig.tipY - rig.handY;
  stage.showLook({
    ...on,
    id: rodLook.id,
    poseKey: 'one',
    x: rig.handX,
    y: rig.handY,
    depth: at(4),
    rotation: Math.atan2(rodY, rodX),
    scale: Math.hypot(rodX, rodY) / ROD_LENGTH,
    scaleY: 1,
  });

  /*
   * The line, as chords of the curve it used to be drawn as.
   *
   * The same quadratic, sampled: each piece is the one baked hairline turned
   * onto its chord and stretched to its length, and consecutive pieces meet
   * end to end because each starts where the last one finished.
   */
  let fromX = rig.tipX;
  let fromY = rig.tipY;
  for (let i = 1; i <= STRAND_PIECES; i++) {
    const u = i / STRAND_PIECES;
    const v = 1 - u;
    const midX = (rig.tipX + rig.floatX) / 2;
    const midY = (rig.tipY + rig.floatY) / 2 + rig.sag;
    const toX = v * v * rig.tipX + 2 * v * u * midX + u * u * rig.floatX;
    const toY = v * v * rig.tipY + 2 * v * u * midY + u * u * rig.floatY;
    const dx = toX - fromX;
    const dy = toY - fromY;
    stage.showLook({
      ...on,
      id: strandLook.id,
      poseKey: 'one',
      x: fromX,
      y: fromY,
      depth: at(5),
      rotation: Math.atan2(dy, dx),
      scale: Math.hypot(dx, dy) / STRAND_LENGTH,
      scaleY: 1,
    });
    fromX = toX;
    fromY = toY;
  }

  // Rings stay on the water, and fade out as the float leaves it.
  if (rig.pull < 0.95) {
    for (const ring of ripplesAt(f.clock, f.dip)) {
      const band = bandFor(ring.radius);
      stage.showLook({
        ...on,
        id: rippleLook.id,
        poseKey: `r${band}`,
        x: rig.ringX,
        y: rig.ringY + 1,
        depth: at(6),
        scale: ring.radius / RIPPLE_BANDS[band],
        alpha: ring.alpha * (1 - rig.pull),
      });
    }
  }

  stage.showLook({
    ...on,
    id: floatLook.id,
    poseKey: 'one',
    x: rig.floatX,
    y: rig.floatY,
    depth: at(7),
    rotation: rig.floatAngle,
  });

  if (rig.leap <= 0) return;
  const height = catchHeight(rig.leap);
  if (height < 0.5) return;
  const catchAt = {
    ...on,
    x: walkerX + face * 4,
    y: walkerY - 30 - height,
    rotation: catchAngle(rig.leap, f.hooked),
  } as const;
  stage.showLook({ ...catchAt, id: catchLook.id, poseKey: f.hooked, depth: at(8) });

  if (f.hooked !== 'treasure') return;
  const glint = glintAt(rig.leap);
  if (glint <= 0.02) return;
  stage.showLook({
    ...catchAt,
    id: glintLook.id,
    poseKey: 'one',
    depth: at(9),
    scale: (5 + glint * 7) / GLINT_ARM,
    alpha: glint,
  });
}
