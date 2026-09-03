import { createSurface, type Surface } from '../core/canvas';
import { TAU } from '../core/math';

/**
 * The shape of the colour: a soft, breathing haze around the walker.
 *
 * This is rendered into its own canvas and then used as an alpha mask — the
 * coloured world is drawn, `destination-in` punches it through this, and what
 * survives is laid over the pencil drawing.
 *
 * It used to drag a tail of blobs behind the walker, marking where they had
 * just been. That made the colour behave like a liquid being sloshed about,
 * with a lump of it chasing the walker and slopping past them on every stop.
 * The colour is meant to read as light rather than fluid, so nothing here
 * depends on movement any more: the haze is the same shape standing still as at
 * a run, and the only thing that changes it is the slow breathing of its rim.
 */

/** The region of the screen the colour touches this frame. */
export interface DirtyRect {
  x: number;
  y: number;
  width: number;
  height: number;
  empty: boolean;
}

/** Points around the blob's rim. Enough to look organic, few enough to be cheap. */
const RIM_SEGMENTS = 54;

/** The wobble that keeps the edge from looking like a spotlight. */
function rimScale(angle: number, t: number): number {
  return (
    1 +
    Math.sin(angle * 3 + t * 0.7) * 0.055 +
    Math.sin(angle * 5 - t * 0.45) * 0.035 +
    Math.sin(angle * 8 + t * 0.25) * 0.018
  );
}

/**
 * How coarsely the mask may be drawn, against the device pixel grid.
 *
 * The mask is pure alpha: a soft radial gradient and a handful of blurred
 * blobs, with no edge in it sharper than the fade itself. Painting that at full
 * device resolution is the single most expensive thing in the frame once the
 * colour has grown, and every one of those pixels is thrown away into a smooth
 * ramp. Half-resolution is a quarter of the work and the upscale is invisible.
 */
export const MASK_SCALE = 0.5;

export class ColorField {
  readonly surface: Surface;
  private readonly dirty: DirtyRect = { x: 0, y: 0, width: 0, height: 0, empty: true };

  constructor() {
    this.surface = createSurface(1, 1);
  }

  /**
   * The mask is only ever painted inside the dirty rectangle, so it is
   * allocated at that size rather than at the size of the window.
   *
   * This matters more than it looks. A full-viewport scratch surface is around
   * five megabytes, and Firefox spends real time shuttling canvas buffers about
   * — a profile from a machine reporting slow frames had two thirds of its
   * busiest thread in raw memcpy and buffer mapping. Allocating what is used
   * cuts that surface to a fraction.
   */
  resize(width: number, height: number): void {
    /*
     * Rounded up, with a pixel to spare. The composite reads back a sub-rect of
     * `ceil(dirty * scale * MASK_SCALE)`; a surface a pixel short of that leaves
     * the last row transparent, and where the dirty rectangle is clamped to the
     * edge of the window that is a stripe of pencil down the side of the colour.
     */
    this.surface.canvas.width = Math.max(1, Math.ceil(width * MASK_SCALE) + 2);
    this.surface.canvas.height = Math.max(1, Math.ceil(height * MASK_SCALE) + 2);
  }

  /** The rectangle the last frame composited through. Read-only, for debugging. */
  get lastDirty(): Readonly<DirtyRect> {
    return this.dirty;
  }

  /**
   * The screen rectangle the colour occupies this frame.
   *
   * This is the single most important optimisation in the renderer. The colour
   * only ever covers a blob around the walker, so compositing the whole screen
   * is mostly wasted work; restricted to this box, the cost scales with the
   * colour radius instead of the size of the window. On a large display that is
   * the difference between compositing 100% of the pixels and about 10%.
   */
  computeDirty(
    centreX: number,
    centreY: number,
    radius: number,
    viewportWidth: number,
    viewportHeight: number,
  ): DirtyRect {
    let x0 = centreX - radius * 1.14;
    let y0 = centreY - radius * 1.14;
    let x1 = centreX + radius * 1.14;
    let y1 = centreY + radius * 1.14;

    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(viewportWidth, Math.ceil(x1));
    y1 = Math.min(viewportHeight, Math.ceil(y1));

    this.dirty.x = x0;
    this.dirty.y = y0;
    this.dirty.width = x1 - x0;
    this.dirty.height = y1 - y0;
    this.dirty.empty = this.dirty.width <= 0 || this.dirty.height <= 0;
    return this.dirty;
  }

  /** Paint the mask for this frame, inside the dirty rectangle. */
  build(
    t: number,
    centreX: number,
    centreY: number,
    radius: number,
    scale: number,
  ): void {
    const { ctx } = this.surface;
    const d = this.dirty;
    const s = scale * MASK_SCALE;

    // Painted at a local origin: the surface holds only the dirty rectangle.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, d.width * s + 2, d.height * s + 2);
    ctx.setTransform(s, 0, 0, s, -d.x * s, -d.y * s);
    ctx.save();
    ctx.beginPath();
    ctx.rect(d.x, d.y, d.width, d.height);
    ctx.clip();

    const grad = ctx.createRadialGradient(
      centreX,
      centreY,
      radius * 0.12,
      centreX,
      centreY,
      radius,
    );
    /*
     * A long, even fade rather than a lit disc with a soft lip.
     *
     * The old ramp held full opacity out to half the radius and then fell away
     * over the last quarter, which reads as a spotlight — an edge, wherever you
     * put it. Fog has no edge: it thins the whole way out, so most of the radius
     * is spent fading and no ring of the mask is where the colour visibly stops.
     */
    grad.addColorStop(0.0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.42, 'rgba(255,255,255,1)');
    grad.addColorStop(0.62, 'rgba(255,255,255,.9)');
    grad.addColorStop(0.78, 'rgba(255,255,255,.62)');
    grad.addColorStop(0.91, 'rgba(255,255,255,.28)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let i = 0; i <= RIM_SEGMENTS; i++) {
      const a = (i / RIM_SEGMENTS) * TAU;
      const k = rimScale(a, t);
      const x = centreX + Math.cos(a) * radius * k;
      const y = centreY + Math.sin(a) * radius * k;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}
