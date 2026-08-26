import { clamp } from './math';

/** A `#rgb` or `#rrggbb` string. */
export type Hex = string;

function toRgb(hex: Hex): number {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  return parseInt(c, 16);
}

/**
 * Perceived brightness, 0..1.
 *
 * This is the bridge between the two media: how dark a thing is in colour
 * decides how densely it gets hatched in graphite.
 */
export function luminance(hex: Hex): number {
  const n = toRgb(hex);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** Shift towards white (`amount > 0`) or black (`amount < 0`). */
export function shade(hex: Hex, amount: number): string {
  const n = toRgb(hex);
  const f = (v: number) => clamp(Math.round(v + 255 * amount), 0, 255);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** The same colour at a given alpha. */
export function withAlpha(hex: Hex, alpha: number): string {
  const n = toRgb(hex);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** `"r,g,b"`, for interpolating into gradient stop strings. */
export function rgbTriplet(hex: Hex): string {
  const n = toRgb(hex);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
