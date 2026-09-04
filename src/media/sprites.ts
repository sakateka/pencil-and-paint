import { createSurface, isolate } from '../core/canvas';
import { rgbTriplet, type Hex } from '../core/color';
import { ink, inkLine } from './ink';
import type { Medium } from './medium';

/**
 * Soft radial blobs, baked once into little canvases.
 *
 * These used to be real `CanvasGradient`s built per shadow and per pot glow —
 * around 85 allocations every frame. That is pure garbage, and GC pauses are
 * exactly the kind of thing that surfaces as an occasional stutter rather than
 * a worse average. Baking them costs a few small canvases.
 */
function softBlob(rgb: string, alpha: number): HTMLCanvasElement {
  const radius = 64;
  const { canvas, ctx } = createSurface(radius * 2, radius * 2);
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, `rgba(${rgb},${alpha})`);
  grad.addColorStop(0.55, `rgba(${rgb},${alpha * 0.55})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, radius * 2, radius * 2);
  return canvas;
}

const SHADOW = softBlob('40,55,35', 0.34);
const glowCache = new Map<Hex, HTMLCanvasElement>();
const discCache = new Map<string, HTMLCanvasElement>();

/**
 * A flat disc, baked once per colour.
 *
 * Particles used to be filled `arc` paths, and there is a reason to care beyond
 * the fill itself: an accelerated canvas keeps a cache of the paths it has
 * turned into GPU geometry, and a mote at a new fractional position with a new
 * fractional radius is a path it has never seen. Dozens of them a frame, plus
 * twenty-six at once when a pot is found, and the cache misses often enough
 * that Firefox's own profiler gives up and drops the canvas onto the software
 * path for the rest of the session — which is the stutter, arriving during a
 * splash and never leaving.
 *
 * A disc scaled out of a sprite is a texture blit and caches nothing. Baked
 * large so that shrinking it to a two-pixel mote stays round.
 */
export function disc(colour: string): HTMLCanvasElement {
  let sprite = discCache.get(colour);
  if (!sprite) {
    const radius = 32;
    const { canvas, ctx } = createSurface(radius * 2, radius * 2);
    ctx.fillStyle = colour;
    ctx.beginPath();
    // A pixel in from the edge, so the antialiased rim is not clipped.
    ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
    ctx.fill();
    sprite = canvas;
    discCache.set(colour, sprite);
  }
  return sprite;
}

/** One round particle, in any colour, without a path. */
export function drawDisc(
  ctx: CanvasRenderingContext2D,
  colour: string,
  x: number,
  y: number,
  r: number,
): void {
  ctx.drawImage(disc(colour), x - r, y - r, r * 2, r * 2);
}

/** Stretch a baked blob over an ellipse. */
export function drawBlob(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  rx: number,
  ry: number,
  alpha = 1,
): void {
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = 1;
}

/** The soft dark patch under anything that moves. */
export function drawShadowBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
): void {
  drawBlob(ctx, SHADOW, x, y, rx, ry);
}

/** The coloured halo around an unfound paint pot. One sprite per hue. */
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  hex: Hex,
  x: number,
  y: number,
  r: number,
): void {
  let sprite = glowCache.get(hex);
  if (!sprite) {
    sprite = softBlob(rgbTriplet(hex), 0.5);
    glowCache.set(hex, sprite);
  }
  drawBlob(ctx, sprite, x, y, r, r);
}

/**
 * The shadow under something that moves. Unlike `groundShadow`, this uses no
 * randomness at all, so it cannot flicker between frames.
 */
export function movingShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  medium: Medium,
  k: number,
): void {
  if (medium === 'color') {
    drawBlob(ctx, SHADOW, x, y, rx, ry);
    return;
  }
  isolate(ctx, () => {
    ink(ctx, 0.16, 0.8);
    for (let i = 0; i < 4; i++) {
      const px = x - rx * 0.7 + rx * 1.4 * (i / 3);
      inkLine(ctx, px - ry, y - ry * 0.4, px + ry, y + ry * 0.5, k + i * 4);
    }
  });
}

/**
 * A tile of paper grain. Laid over both media so the colour and the graphite
 * read as the same sheet rather than two images stacked.
 */
function makeGrain(): HTMLCanvasElement {
  const size = 128;
  const { canvas, ctx } = createSurface(size, size);
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.random();
    image.data[i * 4] = 70;
    image.data[i * 4 + 1] = 64;
    image.data[i * 4 + 2] = 54;
    image.data[i * 4 + 3] = v < 0.55 ? 0 : Math.floor((v - 0.55) * 120);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export const GRAIN = makeGrain();
