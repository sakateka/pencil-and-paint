import { roundRectPath } from '../core/geom';
import type { Hex } from '../core/color';
import { TAU } from '../core/math';
import { jitter } from '../media/ink';
import { PENCIL, type Medium } from '../media/medium';
import { drawGlow } from '../media/sprites';

/**
 * The paint pots: fourteen of them, scattered somewhere new each game.
 *
 * Each one found widens the colour a little, which is the whole progression —
 * the reward for exploring is that you can see further while you do it.
 */

export interface Pot {
  readonly x: number;
  readonly y: number;
  readonly hue: Hex;
  /** Offset into the bob, so they do not pulse in unison. */
  readonly phase: number;
  found: boolean;
  /** Whether the colour has reached it. */
  awake: boolean;
  /** Its own clock: an unfound pot in the pencil does not bob. */
  clock: number;
}

/**
 * A pot rising and settling on the spot. Its whole animation, and a translate.
 *
 * The phase is what keeps fourteen of them from pulsing in unison. It used to
 * be baked into the drawing, which is why an unfound pot kept a private frozen
 * canvas that had to be thrown away and remade whenever the colour crossed it —
 * and `awake` is recomputed from the lit radius every tick with no hysteresis,
 * so a pot sitting on the edge of the circle allocated a fresh canvas every
 * frame. That churn is what drives an accelerated canvas past its cache-miss
 * ratio and drops a whole session onto the software path. Nothing is baked from
 * a pot's own numbers now, so there is nothing left to throw away.
 */
export function potBob(clock: number, phase: number): number {
  return Math.sin(clock * 2.2 + phase) * 3.5;
}

/** The soft light a pot gives off, in white, so one picture serves all of them. */
export function drawPotGlow(ctx: CanvasRenderingContext2D): void {
  drawGlow(ctx, '#ffffff', 0, -8, 36);
}

/**
 * One jar, at its own origin.
 *
 * `seed` is where the pencil's wobble comes from. It used to come from the
 * pot's phase, which made every one of the fourteen a slightly different
 * drawing — fine when each carried its own canvas, and impossible to enumerate,
 * so the baked version picks between a few inked variants instead. Three is
 * what a hand-drawn cartoon uses and it is what the field already does.
 */
export function drawPotJar(
  ctx: CanvasRenderingContext2D,
  hue: Hex,
  medium: Medium,
  seed: number,
): void {
  if (medium === 'color') {
    // jar
    ctx.fillStyle = '#e9e2d2';
    roundRectPath(ctx, -9, -16, 18, 18, 3.5); ctx.fill();
    ctx.fillStyle = hue;
    roundRectPath(ctx, -9, -11, 18, 13, 3.5); ctx.fill();
    // spill on the rim
    ctx.fillStyle = hue;
    ctx.beginPath();
    ctx.moveTo(-9, -12);
    ctx.quadraticCurveTo(-12, -6, -10, 1);
    ctx.lineTo(-6, 1);
    ctx.quadraticCurveTo(-7, -6, -5, -12);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,40,.55)'; ctx.lineWidth = 1.4;
    roundRectPath(ctx, -9, -16, 18, 18, 3.5); ctx.stroke();
    // brush sticking out
    ctx.strokeStyle = '#a9793f'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(2, -14); ctx.lineTo(8, -26); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    roundRectPath(ctx, -6.5, -14, 3, 6, 1.5); ctx.fill();
    return;
  }

  let kk = seed;
  ctx.strokeStyle = PENCIL; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2;
  for (let pass = 0; pass < 2; pass++) {
    roundRectPath(ctx, -9 + jitter(kk++, 0.8), -16 + jitter(kk++, 0.8), 18, 18, 3.5);
    ctx.globalAlpha = pass ? 0.28 : 0.55;
    ctx.stroke();
  }
  ctx.globalAlpha = 0.4;
  for (let i = 0; i < 5; i++) {
    const yy = -10 + i * 2.4;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-7.5, yy + jitter(kk++, 0.5));
    ctx.lineTo(7.5, yy + jitter(kk++, 0.5));
    ctx.stroke();
  }
  ctx.lineWidth = 1.1; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(2, -14); ctx.lineTo(8 + jitter(kk++, 1), -26); ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Scatter the pots afresh — a new hunt every game.
 *
 * Uses `Math.random` rather than the world's seeded generator on purpose: the
 * valley should be the same place every visit, but the pots should not be where
 * you last found them.
 */
export function scatterPots(
  count: number,
  hues: readonly Hex[],
  bounds: { width: number; height: number },
  spawn: { x: number; y: number },
  isClear: (x: number, y: number, pad: number) => boolean,
): Pot[] {
  const pots: Pot[] = [];
  const MIN_SEPARATION = 210;
  const GOOD_ENOUGH = 430;

  const propose = () => ({
    x: 90 + Math.random() * (bounds.width - 180),
    y: 130 + Math.random() * (bounds.height - 220),
  });

  for (let i = 0; i < count; i++) {
    let best: { x: number; y: number } | null = null;
    let bestDistance = -1;

    // Try a batch and keep whichever candidate sits furthest from everything
    // already placed, so they spread out instead of clumping.
    for (let attempt = 0; attempt < 260; attempt++) {
      const spot = propose();
      if (!isClear(spot.x, spot.y, 46)) continue;
      let nearest = Math.min(Math.hypot(spot.x - spawn.x, spot.y - spawn.y), 900);
      for (const p of pots) nearest = Math.min(nearest, Math.hypot(spot.x - p.x, spot.y - p.y));
      if (nearest < MIN_SEPARATION) continue;
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = spot;
      }
      if (bestDistance > GOOD_ENOUGH) break;
    }

    // Nowhere roomy left: relax the spacing rather than drop a pot, since the
    // game is unwinnable if fewer than `count` exist.
    if (!best) {
      for (let attempt = 0; attempt < 900 && !best; attempt++) {
        const spot = propose();
        if (isClear(spot.x, spot.y, 40)) best = spot;
      }
    }
    if (!best) continue;

    pots.push({
      x: best.x,
      y: best.y,
      /*
       * One pot per colour, in order, rather than a colour drawn at random.
       *
       * Random gave duplicates and gaps, and now that the palette at the easel
       * is what you have collected, a duplicate is a pot that hands you nothing
       * you did not already have.
       */
      hue: hues[pots.length % hues.length],
      phase: Math.random() * TAU,
      found: false,
      awake: false,
      clock: Math.random() * 20,
    });
  }
  return pots;
}
