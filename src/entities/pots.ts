import { roundRectPath } from '../core/geom';
import type { Hex } from '../core/color';
import { TAU } from '../core/math';
import { jitter, withBoil } from '../media/ink';
import { PENCIL, type Medium } from '../media/medium';
import { drawGlow } from '../media/sprites';
import { createSurface } from '../core/canvas';

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
  frozenSprite: HTMLCanvasElement | null;
}

const SPRITE_WIDTH = 70;
const SPRITE_HEIGHT = 80;
const SPRITE_ORIGIN_X = 35;
const SPRITE_ORIGIN_Y = 60;

function drawPotAt(ctx: CanvasRenderingContext2D, p: Pot, t: number, medium: Medium, alpha: number): void {
  const bob = Math.sin(t * 2.2 + p.phase) * 3.5;
  const x = p.x, y = p.y + bob;
  ctx.save();
  ctx.globalAlpha = alpha;

  if (medium === 'color') {
    drawGlow(ctx, p.hue, x, y - 8, 36);

    // jar
    ctx.fillStyle = '#e9e2d2';
    roundRectPath(ctx, x - 9, y - 16, 18, 18, 3.5); ctx.fill();
    ctx.fillStyle = p.hue;
    roundRectPath(ctx, x - 9, y - 11, 18, 13, 3.5); ctx.fill();
    // spill on the rim
    ctx.fillStyle = p.hue;
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 12);
    ctx.quadraticCurveTo(x - 12, y - 6, x - 10, y + 1);
    ctx.lineTo(x - 6, y + 1);
    ctx.quadraticCurveTo(x - 7, y - 6, x - 5, y - 12);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,40,.55)'; ctx.lineWidth = 1.4;
    roundRectPath(ctx, x - 9, y - 16, 18, 18, 3.5); ctx.stroke();
    // brush sticking out
    ctx.strokeStyle = '#a9793f'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + 2, y - 14); ctx.lineTo(x + 8, y - 26); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    roundRectPath(ctx, x - 6.5, y - 14, 3, 6, 1.5); ctx.fill();
  } else {
    let kk = p.phase * 170;
    ctx.strokeStyle = PENCIL; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha * 0.55; ctx.lineWidth = 1.2;
    for (let pass = 0; pass < 2; pass++) {
      roundRectPath(ctx, x - 9 + jitter(kk++, 0.8), y - 16 + jitter(kk++, 0.8), 18, 18, 3.5);
      ctx.globalAlpha = alpha * (pass ? 0.28 : 0.55);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha * 0.4;
    for (let i = 0; i < 5; i++) {
      const yy = y - 10 + i * 2.4;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x - 7.5, yy + jitter(kk++, 0.5)); ctx.lineTo(x + 7.5, yy + jitter(kk++, 0.5)); ctx.stroke();
    }
    ctx.lineWidth = 1.1; ctx.globalAlpha = alpha * 0.5;
    ctx.beginPath(); ctx.moveTo(x + 2, y - 14); ctx.lineTo(x + 8 + jitter(kk++, 1), y - 26); ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw a pot in the given medium. Frozen ones come from a cached sprite, since
 * an unfound pot in the pencil is a still life.
 */
export function drawPot(ctx: CanvasRenderingContext2D, p: Pot, medium: Medium): void {
  if (p.awake) {
    withBoil(true, () => drawPotAt(ctx, p, p.clock, medium, 1));
    return;
  }
  if (medium === 'color') return; // masked out anyway
  // The bob is left out of the sprite, so it is applied on the way out.
  const bob = Math.sin(p.clock * 2.2 + p.phase) * 3.5;
  ctx.drawImage(frozenPotSprite(p), p.x - SPRITE_ORIGIN_X, p.y + bob - SPRITE_ORIGIN_Y);
}

/**
 * The still life, baked once and kept.
 *
 * It used to be thrown away the moment the colour reached the pot and baked
 * again when the colour left, because the bob was baked into it and the pot's
 * clock had moved on in between. `awake` is recomputed from the lit radius
 * every tick with no hysteresis, so a pot sitting on the edge of the circle
 * allocated a fresh canvas on every step in and out — which at the edge is
 * every frame. Each new canvas is a new texture for the browser to upload, and
 * that churn is what drives an accelerated canvas past its cache-miss ratio and
 * drops the whole session onto the software path.
 *
 * So the bob is left out of the bake — `-phase / 2.2` is the moment it passes
 * through zero — and applied when the sprite is drawn. Nothing else in the
 * still life moves, and the jitter is seeded from the phase rather than the
 * clock, so what is left never needs baking twice.
 */
function frozenPotSprite(p: Pot): HTMLCanvasElement {
  if (p.frozenSprite) return p.frozenSprite;
  const { canvas, ctx } = createSurface(SPRITE_WIDTH, SPRITE_HEIGHT);
  ctx.translate(SPRITE_ORIGIN_X, SPRITE_ORIGIN_Y);
  const local = { ...p, x: 0, y: 0 };
  withBoil(false, () => drawPotAt(ctx, local, -p.phase / 2.2, 'sketch', 1));
  p.frozenSprite = canvas;
  return canvas;
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
      frozenSprite: null,
    });
  }
  return pots;
}
