import { createSurface } from '../core/canvas';
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

/**
 * The same haze, as something CSS can use as a mask.
 *
 * Encoded once. It is a readback and a PNG encode of a 584px square, which is
 * a few milliseconds at startup and nothing ever again — against
 * `destination-in` on the displayed canvas, which was measured at fourteen
 * milliseconds a frame for ever.
 */
let hazeUrl: string | undefined;

/** The baked haze itself, for anything that must apply the mask by hand. */
export function hazeMask(): HTMLCanvasElement {
  return haze();
}

export function hazeMaskUrl(): string {
  hazeUrl ??= haze().toDataURL('image/png');
  return hazeUrl;
}

/** Throw the baked haze away, so the next frame bakes it again. */
export function forgetHaze(): void {
  hazeSprite = undefined;
  hazeUrl = undefined;
}

export class ColorField {
  private readonly dirty: DirtyRect = { x: 0, y: 0, width: 0, height: 0, empty: true };

  /**
   * Throw the baked haze away, so the next frame bakes it again.
   *
   * For `pencil.rescue()`, which hands the game a brand-new set of canvases:
   * the sprite is a canvas of its own and may as well come from the new set.
   */
  renew(): void {
    forgetHaze();
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

  /**
   * Where the haze sits on screen this frame, in CSS pixels.
   *
   * The colour is not cut by the canvas any more. It used to be
   * `destination-in` against the baked sprite, drawn straight onto the layer —
   * which reads well and was measured, on the machine that has the fault, at
   * fourteen milliseconds a frame against half a millisecond without it. An
   * accelerated canvas in Firefox does not do that operation on the GPU, and
   * asking for it drops the whole layer to the software rasteriser
   * permanently. Every other thing the layer did was innocent: with the punch
   * gone and the clear and the paper left in, the frame was 0.5ms.
   *
   * So the cut is the compositor's job now: the same sprite, as a CSS mask on
   * the element. The canvas is left doing nothing but source-over blits, which
   * is the one path that is reliably accelerated.
   *
   * What was lost with it is the slow spin — a CSS mask cannot be rotated. The
   * rim's wobble is baked into the sprite and survives, and the breathing is
   * the mask's size, so what went is one turn every two minutes.
   */
  maskAt(centreX: number, centreY: number, radius: number): {
    size: number;
    left: number;
    top: number;
  } {
    /*
     * No breathing, and this is load-bearing rather than a simplification.
     *
     * Resizing a CSS mask makes the browser rasterise it again at device
     * resolution; moving one does not. While the radius drifted every frame
     * that cost half a core in the compositor and approached a whole one as
     * the blob grew. Rounding the size to steps bought it back and paid in a
     * visible judder, which the user rejected outright — "let it be static".
     *
     * So the size is a function of how much paint has been found and nothing
     * else. It changes fourteen times in a session and holds still in between.
     */
    const size = (radius / HAZE_RADIUS) * SPRITE_RADIUS * 2;
    return {
      size,
      left: Math.round(centreX - size / 2),
      top: Math.round(centreY - size / 2),
    };
  }
}
