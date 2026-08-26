import { TAU } from '../core/math';
import type { Poly } from '../core/geom';
import { PENCIL } from './medium';

/**
 * Graphite for things drawn *every frame* — the livestock, the paint pots.
 *
 * These cannot jitter freely like baked scenery does. Re-rolling the wobble at
 * 60fps makes a line vibrate rather than look drawn. So the jitter is a pure
 * function of a stroke index and a "boil" counter that only ticks a few times a
 * second: within one tick every stroke lands in exactly the same place, and the
 * drawing appears to be re-inked by hand a few times a second.
 *
 * Frozen things (anything the colour has not reached) draw at boil 0, which
 * holds them perfectly still — they are pencil on paper, and paper does not move.
 */

const BOIL_HZ = 7;

let boil = 0;
let liveBoil = 0;

/** Advance the live boil. Called once per frame from the loop. */
export function tickBoil(elapsed: number): void {
  liveBoil = (elapsed * BOIL_HZ) | 0;
  boil = liveBoil;
}

/** Draw `fn` with a moving hand (`alive`) or a perfectly still one. */
export function withBoil<T>(alive: boolean, fn: () => T): T {
  const previous = boil;
  boil = alive ? liveBoil : 0;
  try {
    return fn();
  } finally {
    boil = previous;
  }
}

/** Deterministic jitter for stroke `index`, stable within the current boil tick. */
export function jitter(index: number, amplitude: number): number {
  const n = Math.sin(index * 127.1 + boil * 311.7) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * 2 * amplitude;
}

/** Set up a pencil stroke style. */
export function ink(ctx: CanvasRenderingContext2D, alpha: number, width: number): void {
  ctx.strokeStyle = PENCIL;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

export function inkArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  k: number,
): void {
  ctx.beginPath();
  ctx.arc(x + jitter(k, 0.7), y + jitter(k + 1, 0.7), r + jitter(k + 2, 0.5), 0, TAU);
  ctx.stroke();
}

export function inkLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  k: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x1 + jitter(k, 0.7), y1 + jitter(k + 1, 0.7));
  ctx.lineTo(x2 + jitter(k + 2, 0.7), y2 + jitter(k + 3, 0.7));
  ctx.stroke();
}

export function inkPoly(
  ctx: CanvasRenderingContext2D,
  pts: Poly,
  k: number,
  close = false,
): void {
  ctx.beginPath();
  const n = close ? pts.length + 1 : pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i % pts.length];
    const x = p[0] + jitter(k + i * 2, 0.7);
    const y = p[1] + jitter(k + i * 2 + 1, 0.7);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
