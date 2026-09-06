import { createSurface } from '../core/canvas';
import type { Medium } from '../media/medium';

/**
 * Drawings that are painted once and then only moved.
 *
 * Everything hand-drawn in this game used to be repainted while you played: the
 * renderer asked each thing "has your picture changed?", guessed the answer by
 * reading the object's fields, and on a yes repainted the strokes into a canvas
 * and pushed the whole canvas to the GPU. Measured, that ran to eighty
 * megabytes a second, of which ninety to ninety-nine per cent was transparent
 * padding — a bird twenty-one pixels across lived in a canvas of four hundred
 * and twenty.
 *
 * The fix is not a better guess. It is to stop guessing: a `Look` must be able
 * to *list* every picture it can ever show. That list is baked at warm-up, and
 * from then on being on screen costs a transform and nothing else.
 *
 * The requirement that the list be finite is the whole safety property. A field
 * that changes continuously — a float easing from 0 to 1 — cannot be listed, so
 * it cannot get into a picture by accident, which is exactly how the old design
 * lost eighty megabytes a second to a private counter nobody remembered.
 * Continuous motion belongs in the transform: position, scale, mirror, alpha,
 * tint. What genuinely looks different becomes another pose.
 */
export interface Look<Pose> {
  /** Unique, and the prefix of every texture this look bakes. */
  readonly id: string;

  /**
   * Which media this look is drawn in.
   *
   * Most things are drawn twice, in graphite outside the colour and in paint
   * inside it. The things that stand *over* the colour — the walker, the birds
   * — are only ever in colour, and baking a graphite copy of them would be half
   * the memory for a picture nobody sees.
   */
  readonly media: readonly Medium[];

  /**
   * How far from its own origin this look's strokes can reach, in world units.
   *
   * Only used to size the scratch the bake measures in, so it is cheap to be
   * generous — the scratch is thrown away and what is kept is the tight box the
   * ink actually occupied. Too small silently clips the drawing, so err high.
   */
  readonly reach: number;

  /** Every picture this look can ever show. Finite, and that is the point. */
  poses(): Iterable<Pose>;

  /** A stable name for one pose. Two poses with one key are one picture. */
  key(pose: Pose): string;

  /**
   * Paint one pose with its own origin at (0, 0).
   *
   * The `draw*` functions in `entities/` and `world/` paint at world
   * coordinates, so an adapter usually translates by minus the subject's
   * position and calls straight through. Nothing about the drawing changes.
   */
  draw(ctx: CanvasRenderingContext2D, pose: Pose, medium: Medium): void;
}

/** One baked picture: the ink, and where it sits relative to the origin. */
export interface BakedPose {
  readonly canvas: HTMLCanvasElement;
  /** Offset of the canvas' top-left corner from the look's origin. */
  readonly dx: number;
  readonly dy: number;
  readonly width: number;
  readonly height: number;
}

/** A pose that drew nothing at all — kept so the caller can skip it. */
const EMPTY: BakedPose = {
  canvas: undefined as unknown as HTMLCanvasElement,
  dx: 0,
  dy: 0,
  width: 0,
  height: 0,
};

/**
 * Every baked picture in the game, by look, pose and medium.
 *
 * Filled once, during the load, and never written to again. `bake()` is a
 * generator so the loader can hand control back to the browser between pictures
 * — the same courtesy the world bake already pays, and for the same reason: one
 * uninterrupted call is the longest freeze in a session.
 */
export class LookLibrary {
  private readonly looks: Look<unknown>[] = [];
  private readonly baked = new Map<string, BakedPose>();

  /** What the bake cost, for the readout. */
  pictures = 0;
  pixels = 0;
  bakeMs = 0;

  register<Pose>(look: Look<Pose>): void {
    this.looks.push(look as Look<unknown>);
  }

  /** `look:pose:medium`, the key everything else uses. */
  static slot(id: string, poseKey: string, medium: Medium): string {
    return `${id}:${poseKey}:${medium}`;
  }

  get(id: string, poseKey: string, medium: Medium): BakedPose | undefined {
    return this.baked.get(LookLibrary.slot(id, poseKey, medium));
  }

  /** Every picture, so the stage can hand them all to the GPU at once. */
  entries(): Iterable<[string, BakedPose]> {
    return this.baked.entries();
  }

  /**
   * Bake everything, one picture per step.
   *
   * Each is drawn into a scratch big enough for the look's reach, measured for
   * the box its ink actually occupies, and copied into a canvas of exactly that
   * size. The measuring is a readback and is the expensive half; the scratch is
   * kept per size so it is allocated a handful of times rather than per picture.
   */
  *bake(): Generator<{ done: number; total: number }> {
    const started = performance.now();
    let done = 0;
    const total = this.total();
    for (const look of this.looks) {
      const size = Math.max(2, Math.ceil(look.reach * 2));
      const scratch = createSurface(size, size, { willReadFrequently: true });
      const centre = size / 2;
      for (const pose of look.poses()) {
        const poseKey = look.key(pose);
        for (const medium of look.media) {
          const slot = LookLibrary.slot(look.id, poseKey, medium);
          if (!this.baked.has(slot)) {
            this.baked.set(slot, this.paint(look, pose, medium, scratch, centre, size));
          }
          done++;
          yield { done, total };
        }
      }
      // The scratch was working space, not a picture.
      scratch.canvas.width = 1;
      scratch.canvas.height = 1;
    }
    this.bakeMs = performance.now() - started;
  }

  /** How many pictures `bake` will produce, for the progress bar. */
  total(): number {
    let n = 0;
    for (const look of this.looks) {
      let poses = 0;
      for (const _ of look.poses()) poses++;
      n += poses * look.media.length;
    }
    return n;
  }

  private paint(
    look: Look<unknown>,
    pose: unknown,
    medium: Medium,
    scratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D },
    centre: number,
    size: number,
  ): BakedPose {
    const { ctx } = scratch;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(centre, centre);
    look.draw(ctx, pose, medium);

    const box = inkBounds(ctx, size);
    if (!box) return EMPTY;

    const { canvas, ctx: out } = createSurface(box.width, box.height);
    out.drawImage(scratch.canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

    this.pictures++;
    this.pixels += box.width * box.height;
    return {
      canvas,
      dx: box.x - centre,
      dy: box.y - centre,
      width: box.width,
      height: box.height,
    };
  }

  /** Megabytes of texture this library holds, RGBA. */
  get megabytes(): number {
    return Math.round((this.pixels / 262144) * 10) / 10;
  }
}

/**
 * The smallest box holding any ink at all.
 *
 * Read once per picture at warm-up, never while playing. The alternative — a
 * box declared by hand at each call site — is what the game does today, and it
 * is how a bird ended up in a canvas four hundred times its own area.
 */
function inkBounds(
  ctx: CanvasRenderingContext2D,
  size: number,
): { x: number; y: number; width: number; height: number } | undefined {
  const { data } = ctx.getImageData(0, 0, size, size);
  let x0 = size;
  let y0 = size;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) {
      if (data[(row + x) * 4 + 3] > 2) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return undefined;
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
