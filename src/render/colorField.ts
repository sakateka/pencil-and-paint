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
 * a run, and the only thing that changes it is its slow drift.
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
function rimScale(angle: number): number {
  return (
    1 +
    Math.sin(angle * 3) * 0.055 +
    Math.sin(angle * 5 - 1.7) * 0.035 +
    Math.sin(angle * 8 + 0.9) * 0.018
  );
}

/**
 * The gradient's outer radius inside the sprite, and how far the sprite reaches.
 *
 * The rim wobbles out to about 1.11 of the gradient radius, so the sprite is cut
 * a little wider than that and the shape never touches its own edge. `1.14` in
 * `computeDirty` is the same margin, which is why the two numbers must move
 * together.
 */
const HAZE_RADIUS = 256;
const SPRITE_RADIUS = 292;

let hazeSprite: HTMLCanvasElement | undefined;

/**
 * The haze, baked once.
 *
 * This used to be built afresh every frame — a `createRadialGradient` and a
 * fifty-four point polygon whose every vertex moved with the breathing — and
 * that turns out to be the most expensive habit in the whole renderer, for a
 * reason that has nothing to do with how long the fill takes.
 *
 * An accelerated canvas caches the paths it has turned into GPU geometry, and
 * Firefox watches how often that cache misses. A path with fifty-four new
 * coordinates is a miss, every frame, for ever — and when misses dominate for
 * long enough the browser gives up on the canvas and drops it onto the software
 * rasteriser, permanently, for the rest of the session. That is the stutter
 * people have been reporting, and it explains the part that never made sense:
 * it arrives while *standing still*, because standing still does not stop the
 * mask being redrawn from scratch sixty times a second.
 *
 * Baked, the mask is one texture. The frame blits it, and blitting caches
 * nothing.
 */
function haze(): HTMLCanvasElement {
  if (hazeSprite) return hazeSprite;
  const size = SPRITE_RADIUS * 2;
  const { canvas, ctx } = createSurface(size, size);
  ctx.translate(SPRITE_RADIUS, SPRITE_RADIUS);

  const grad = ctx.createRadialGradient(0, 0, HAZE_RADIUS * 0.12, 0, 0, HAZE_RADIUS);
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
    const k = rimScale(a) * HAZE_RADIUS;
    const x = Math.cos(a) * k;
    const y = Math.sin(a) * k;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  hazeSprite = canvas;
  return hazeSprite;
}

/** Throw the baked haze away, so the next frame bakes it again. */
export function forgetHaze(): void {
  hazeSprite = undefined;
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
  surface: Surface;
  private readonly dirty: DirtyRect = { x: 0, y: 0, width: 0, height: 0, empty: true };

  constructor() {
    this.surface = createSurface(1, 1);
  }

  /**
   * Start again on a brand-new surface, throwing the baked haze away with it.
   *
   * For the rescue in `systems/rescue.ts`: a canvas Firefox has given up on
   * stays given up on for as long as it exists, and that includes the offscreen
   * ones. The sprite goes too, because it was baked into a texture belonging to
   * the old set.
   */
  renew(): void {
    const { width, height } = this.surface.canvas;
    this.surface.canvas.width = 1;
    this.surface.canvas.height = 1;
    this.surface = createSurface(width, height);
    forgetHaze();
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
    const sprite = haze();

    // Painted at a local origin: the surface holds only the dirty rectangle.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, d.width * s + 2, d.height * s + 2);

    /*
     * The breathing, which used to be in the shape itself.
     *
     * The rim is baked now, so it cannot wobble — but a mask that is bit for bit
     * the same every frame reads as a stencil held over the drawing. So the
     * whole sprite turns, very slowly, and swells a little as it goes: the same
     * fog, drifting. Both are transforms on one blit and cost nothing, and
     * turning suits fog better than a rippling edge ever did.
     */
    const spin = t * 0.055;
    const breath = 1 + Math.sin(t * 0.33) * 0.014;
    const k = ((radius * breath) / HAZE_RADIUS) * s;

    /*
     * No clip. The surface is allocated to the dirty rectangle, so its own edges
     * already are the clip — and a `rect` and `clip` per frame is another path
     * per frame, which is the thing this file exists to stop doing.
     */
    ctx.setTransform(
      k * Math.cos(spin),
      k * Math.sin(spin),
      -k * Math.sin(spin),
      k * Math.cos(spin),
      (centreX - d.x) * s,
      (centreY - d.y) * s,
    );
    ctx.drawImage(sprite, -SPRITE_RADIUS, -SPRITE_RADIUS);
  }
}
