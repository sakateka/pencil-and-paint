import { isolate } from '../core/canvas';
import { tracePoly, type Poly } from '../core/geom';
import { TAU } from '../core/math';
import { rr } from '../core/rng';
import { ink, jitter } from '../media/ink';
import { PAPER, type Medium } from '../media/medium';
import { groundShadow } from '../media/pencil';

/**
 * The black stone, lying in the grass out where the paths do not go.
 *
 * Every other stone in this valley is a grey lump you walk round. This one is
 * black, and every few seconds it catches the light — which is the whole of
 * what it does so far. There is something in it; looking closer at it is not
 * built yet, and the wink is the promise rather than the thing promised.
 *
 * A wink and not a pulse. A steady throb reads as a machine or a marker, and
 * neither belongs in a meadow: the light has to arrive, be gone before you are
 * sure, and leave you watching the grass. So it is dark for seconds at a time
 * and lit for about a third of one.
 */

/** How black. Not quite, because a true black reads as a hole in the paper. */
const STONE = '#241f28';
const STONE_EDGE = '#0f0c12';
const FACET = '#453d4c';

/** The seed every wobble in the graphite stone is drawn from. */
const K = 9100;

/**
 * How far the drawing reaches from the point the stone stands on.
 *
 * The whole of it has to be inside the colour before it may wink — the stone
 * is ten units across and its glint throws light a dozen further, so asking at
 * the origin would have it flashing while its own light fell on the graphite.
 */
export const SECRET_REACH = 22;

/** How long one wink takes, and the range of quiet between them. */
const WINK_SECONDS = 0.34;
const WINK_GAP = [2.6, 5.8] as const;

export class SecretStone {
  /**
   * Whether the whole stone is inside the colour.
   *
   * The whole of it, not the point it stands on: half a stone in the graphite
   * with a light coming off the other half is the one thing the pencil is not
   * allowed to do.
   */
  lit = false;

  /** How bright the catch of light is, 0 to 1. */
  glint = 0;

  /** Seconds until the next one. */
  private wait = rr(WINK_GAP[0], WINK_GAP[1]);

  /** How far through the current wink, or zero between them. */
  private winking = 0;

  constructor(
    readonly x: number,
    readonly y: number,
  ) {}

  update(dt: number, lit: boolean): void {
    this.lit = lit;
    /*
     * Out in the graphite it is a drawing of a stone, and drawings do not
     * twinkle. The countdown stops with it, so walking away mid-wink and coming
     * back does not owe you the rest of that wink — it starts again.
     */
    if (!lit) {
      this.glint = 0;
      this.winking = 0;
      return;
    }

    if (this.winking > 0) {
      this.winking = Math.max(0, this.winking - dt / WINK_SECONDS);
      if (this.winking === 0) this.wait = rr(WINK_GAP[0], WINK_GAP[1]);
    } else {
      this.wait -= dt;
      if (this.wait <= 0) this.winking = 1;
    }

    /*
     * Bright fast and gone slow, which is what a facet turning through the sun
     * does. Symmetrical, it read as a lamp being switched.
     */
    const through = 1 - this.winking;
    this.glint = through < 0.25 ? through / 0.25 : Math.max(0, 1 - (through - 0.25) / 0.75);
  }
}

/** How big, in the units the scattered stones are drawn at. */
const SIZE = 0.8;

/**
 * `makeRock`'s shape, with the randomness taken out of it.
 *
 * The point of this stone is that it is one of the stones — same silhouette,
 * same squat lump with a chip on top — and only the colour is odd. So it is
 * built the way the grey ones are: a lumpy circle squashed towards its own
 * ground line, so it sits in the grass rather than standing up facing you.
 *
 * The wobble's phase is a constant here where `circlePoly` takes an `rnd()`.
 * Not a tidying: this is drawn live, and a live draw that pulls from the shared
 * generator moves everything scattered from it afterwards — the paint pots
 * among them, which are re-scattered every new world.
 */
function lump(
  cx: number,
  cy: number,
  r: number,
  segments: number,
  wobble: number,
  phase: number,
  squash: number,
): Poly {
  const pts: Poly = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    const rad =
      r * (1 + Math.sin(a * 3 + phase) * wobble + Math.sin(a * 5 - phase * 1.7) * wobble * 0.55);
    pts.push([cx + Math.cos(a) * rad, (cy + Math.sin(a) * rad) * squash]);
  }
  return pts;
}

const BODY = lump(0, -7 * SIZE, 15 * SIZE, 9, 0.22, 1.9, 0.72);
const CAP = lump(-3 * SIZE, -12 * SIZE, 7 * SIZE, 8, 0.25, 4.4, 0.7);

/**
 * The stone itself: one drawing that never changes.
 *
 * Drawn about its own origin so the look can be placed anywhere, and no bigger
 * than the largest of the grey ones — which is most of why it takes finding.
 */
export function drawSecretStone(ctx: CanvasRenderingContext2D, medium: Medium): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  groundShadow(ctx, 0, 1, 15 * SIZE, 5 * SIZE, medium, true);

  if (medium === 'color') {
    tracePoly(ctx, BODY);
    ctx.fillStyle = STONE;
    ctx.fill();
    ctx.strokeStyle = STONE_EDGE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    /*
     * The chip on top, and the one part of it that is not nearly black.
     *
     * Without it the stone is a silhouette, and a silhouette lying in grass
     * reads as a hole in the picture rather than as something with a surface —
     * which also leaves the wink coming from nowhere.
     */
    tracePoly(ctx, CAP);
    ctx.fillStyle = FACET;
    ctx.fill();
    return;
  }

  /*
   * In graphite it is not black — it is shaded, which is how a pencil says
   * black. Knocked out of the paper first so the grain does not read through
   * the hatch, then hatched harder than any stone beside it: that difference is
   * the only thing the drawing has to say about it.
   *
   * Hatched by hand rather than through `hatchPoly`, which rolls an `rnd()` per
   * stroke — see `lump`.
   */
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = PAPER;
  tracePoly(ctx, BODY);
  ctx.fill();
  ctx.globalAlpha = 1;

  isolate(ctx, () => {
    tracePoly(ctx, BODY);
    ctx.clip();
    ink(ctx, 0.34, 1);
    for (let i = 0; i < 12; i++) {
      const x = -13 + i * 2.3;
      ctx.beginPath();
      ctx.moveTo(x + jitter(K + i, 0.5), 2);
      ctx.lineTo(x + 5.5 + jitter(K + 20 + i, 0.5), -12);
      ctx.stroke();
    }
  });

  ink(ctx, 0.62, 1.3);
  tracePoly(ctx, BODY);
  ctx.stroke();
  ink(ctx, 0.4, 1);
  tracePoly(ctx, CAP);
  ctx.stroke();
}

/**
 * The catch of light, drawn at full strength about the point it comes from.
 *
 * One picture, shown at whatever alpha and scale the wink is at — a glint is a
 * transform, not a row of drawings, and baking a frame per step of it would be
 * a dozen pictures of the same star.
 */
export function drawGlint(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = 'round';

  // A soft bloom, so the star is sitting in light rather than pasted on black.
  const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, 11);
  bloom.addColorStop(0, 'rgba(255,252,235,0.85)');
  bloom.addColorStop(1, 'rgba(255,252,235,0)');
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, TAU);
  ctx.fill();

  /*
   * Four points, long across and short up and down. A round flare is a bulb;
   * the long horizontal is what says a hard edge turned through the light.
   */
  ctx.strokeStyle = 'rgba(255,253,244,0.95)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-9.5, 0);
  ctx.lineTo(9.5, 0);
  ctx.moveTo(0, -5.5);
  ctx.lineTo(0, 5.5);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,250,0.98)';
  ctx.beginPath();
  ctx.arc(0, 0, 1.9, 0, TAU);
  ctx.fill();
}
