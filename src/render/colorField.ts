import { createSurface } from '../core/canvas';
import { TAU } from '../core/math';

/**
 * The shape of the colour: a soft, breathing haze around the walker.
 *
 * Baked once into a canvas and handed to the stage, where it is the texture a
 * fragment shader multiplies the coloured valley by. It has been three things:
 * a `destination-in` punch on the canvas, which dropped the layer onto
 * Firefox's software rasteriser for good; a CSS mask, which moved the same
 * work into the compositor; and now a sprite, which is where it belongs.
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
export const HAZE_RADIUS = 256;
const SPRITE_RADIUS = 292;

let hazeSprite: HTMLCanvasElement | undefined;

/**
 * The haze, baked once.
 *
 * Once, not per frame, and the reason is worth keeping even though the fault it
 * avoids is behind us. This used to be rebuilt every frame — a radial gradient
 * and a fifty-four point polygon whose every vertex moved with the breathing —
 * and an accelerated Canvas2D caches the paths it has turned into GPU geometry
 * and watches how often that cache misses. Fifty-four new coordinates is a
 * miss, every frame, for ever, and enough misses make Firefox give up on the
 * canvas and drop it onto the software rasteriser for the rest of the session.
 * That was the stutter that arrived while standing still.
 *
 * The breathing and the turn are back, and they are free, because they are the
 * sprite's transform rather than its shape. See `hazeAt`.
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

/** The baked haze itself, for anything that must apply the mask by hand. */
export function hazeMask(): HTMLCanvasElement {
  return haze();
}

export class ColorField {
  private readonly dirty: DirtyRect = { x: 0, y: 0, width: 0, height: 0, empty: true };

  /** The rectangle the last frame composited through. Read-only, for debugging. */
  get lastDirty(): Readonly<DirtyRect> {
    return this.dirty;
  }

  /**
   * The screen rectangle the colour occupies this frame.
   *
   * Nothing draws to it any more — the shader cuts the whole layer and does not
   * care where the blob is — but the readout and several tests ask how much of
   * the screen the colour covers, and this is the only thing that knows.
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
   * Where the haze sits, how wide it is, and how far round it has turned.
   *
   * All three go to a sprite the mask shader reads, and all three are therefore
   * transforms — which is the whole difference from what this replaced. As a
   * CSS mask the size could not change without the browser rasterising the
   * mask again at screen resolution, which on the machine with the fault cost
   * half a core at the first paint pot and approached a whole one by the
   * thirteenth; and it could not turn at all, because a CSS mask cannot be
   * rotated. So the breathing was taken out and the turn was given up, and the
   * blob sat there perfectly still for a year.
   *
   * Both are back. They cost nothing: a sprite that is scaled and turned is a
   * sprite, and the shader does not care what shape it was handed.
   */
  hazeAt(
    centreX: number,
    centreY: number,
    radius: number,
    elapsed: number,
  ): { x: number; y: number; radius: number; angle: number } {
    return {
      x: centreX,
      y: centreY,
      /* Four units either side of the true radius, a cycle every four
         seconds. Deliberately *visual only*: `litRadius` is what the game asks
         when it wants to know whether something has been reached, and that is
         not touched here. The rule is that nothing happens outside the colour,
         and a haze that breathed the reach in and out would make the edge of
         the rule wobble. */
      radius: radius + Math.sin(elapsed * 1.55) * 4,
      /* One turn every two minutes, so the rim's wobble never sits still long
         enough to read as a shape. */
      angle: elapsed * (TAU / 120),
    };
  }
}
