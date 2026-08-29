import { Rng } from '../core/rng';
import { TAU } from '../core/math';
import { ink, jitter } from '../media/ink';
import { PAPER, PENCIL, type Medium } from '../media/medium';
import { drawNorthernLandscape } from './hills';

/**
 * The sky, above the top edge of the map.
 *
 * Everywhere else the world is a sheet of paper seen from above, and the camera
 * stops at its edge. Walk to the very top and the camera is allowed to keep
 * going, and what comes up over the edge is sky — the one place in the valley
 * where you are looking *out* rather than down, and the only hint that the
 * paper has a horizon at all.
 *
 * In graphite it is bare paper with a few ruled strokes and a horizon line,
 * because that is what an unfinished drawing of a sky is: the part the artist
 * had not got to yet.
 */

/** How far above the map the camera may rise, in world units. */
export const SKY_DEPTH = 530;

/** The sky where it meets the meadow. */
export const SKY_HORIZON = '#e6f2f6';

/**
 * The sun, over towards the right, with the spiky rays it has in the painting.
 *
 * Fixed in the world rather than fixed on screen: it is a thing hanging in the
 * sky above one end of the valley, so walking west leaves it behind, which is
 * what makes it feel like it is out there rather than painted on the lens.
 *
 * Big, and mostly outside the world: its centre sits just past the top-right
 * corner of the sky, so only the near quarter of it is ever in view. A sun you
 * can see all of is a sticker on the page; a quarter of an enormous one coming
 * over the corner is the sky carrying on past the edge of the paper.
 */
const SUN = { x: 2792, y: -486, r: 150 };

/** Clouds, at fixed places along the top of the world. */
const clouds = (() => {
  const rng = new Rng(0x5c1b7a3d);
  return Array.from({ length: 26 }, (_, i) => ({
    x: i * 190 + rng.range(-60, 60),
    y: -rng.range(140, 380),
    r: rng.range(26, 62),
    lobes: rng.int(3, 5),
    pale: rng.next() < 0.45,
  }));
})();

/**
 * The sun's outline: one closed path all the way round, in flames.
 *
 * Not a ring of triangles. Every ray leans and hooks the same way, so the whole
 * thing looks like it is turning even when it is still — which is what the
 * shape does in the two drawings this is copied from, and what a sun scribbled
 * by hand always does. Twenty-two of them rather than the fourteen spikes it
 * had, because at this size a sparse ring reads as a cog.
 */
function sunFlames(ctx: CanvasRenderingContext2D, t: number): void {
  const spikes = 22;
  // Turn the whole outline as one rigid drawing. Changing each flame's reach
  // over time makes the edge flap rather than shine.
  const spin = t * 0.035;
  ctx.beginPath();
  for (let i = 0; i < spikes; i++) {
    const a0 = (i / spikes) * TAU + spin;
    const a1 = ((i + 1) / spikes) * TAU + spin;
    const reach = SUN.r * (1.27 + Math.sin(i * 2.7) * 0.055);
    // The tip sits past the middle of the gap, which is the hook.
    const tip = (a0 + a1) / 2 + 0.1;
    const at = (a: number, r: number): [number, number] => [
      SUN.x + Math.cos(a) * r,
      SUN.y + Math.sin(a) * r,
    ];
    if (i === 0) ctx.moveTo(...at(a0, SUN.r));
    // Fat control points, so each ray is a rounded lick rather than a blade.
    ctx.quadraticCurveTo(...at(a0 + 0.04, reach * 1.02), ...at(tip, reach));
    ctx.quadraticCurveTo(...at(a1 - 0.1, reach * 0.86), ...at(a1, SUN.r * 0.99));
  }
  ctx.closePath();
}

export function drawSky(
  ctx: CanvasRenderingContext2D,
  viewX: number,
  viewY: number,
  viewWidth: number,
  medium: Medium,
  /** Seconds since the world began, for the shine. */
  t: number,
  /*
   * A stretch of sky to leave empty, in world x.
   *
   * There is one cloud up here that is not weather — the elephant-shaped one
   * that the animal comes out of — and an ordinary cloud drifting across the
   * same patch buries it. Nothing else is reserved; this is the one place where
   * something is meant to be noticed.
   */
  clearAt: number,
): void {
  // Nothing to draw until the camera has actually risen above the top edge.
  if (viewY >= 0) return;

  const left = viewX - 8;
  const width = viewWidth + 16;
  /*
   * A whisker past the horizon, not exactly to it.
   *
   * The camera's origin is snapped to whole device pixels and the sky's lower
   * edge is not, so at exactly y = 0 the seam between sky and grass fell on
   * either side of a pixel boundary depending on where the camera happened to
   * be, and flickered as you walked. Overlapping the world by a pixel and a
   * half costs a sliver of the topmost grass and holds still.
   */
  const height = -viewY + 1.5;

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, viewY, width, height);
  ctx.clip();

  if (medium === 'color') {
    const g = ctx.createLinearGradient(0, -SKY_DEPTH, 0, 0);
    g.addColorStop(0, '#7cb6de');
    g.addColorStop(0.62, '#b6dcee');
    g.addColorStop(1, SKY_HORIZON);
    ctx.fillStyle = g;
    ctx.fillRect(left, viewY, width, height);

    if (SUN.x + SUN.r * 2.4 > left && SUN.x - SUN.r * 2.4 < left + width) {
      ctx.fillStyle = '#f6d64a';
      sunFlames(ctx, t);
      ctx.fill();
      ctx.fillStyle = '#f8de5c';
      ctx.beginPath();
      ctx.arc(SUN.x, SUN.y, SUN.r, 0, TAU);
      ctx.fill();
    }

    for (const c of clouds) {
      if (c.x + c.r * 2 < left || c.x - c.r * 2 > left + width) continue;
      if (Math.abs(c.x - clearAt) < 360) continue;
      ctx.fillStyle = c.pale ? 'rgba(255,255,255,.72)' : 'rgba(255,255,255,.5)';
      for (let i = 0; i < c.lobes; i++) {
        const t = i / (c.lobes - 1 || 1) - 0.5;
        ctx.beginPath();
        ctx.ellipse(
          c.x + t * c.r * 1.5,
          c.y - Math.abs(t) * c.r * 0.22,
          c.r * (0.5 + (0.5 - Math.abs(t)) * 0.7),
          c.r * 0.34,
          0,
          0,
          TAU,
        );
        ctx.fill();
      }
    }

    /*
     * A soft haze along the horizon.
     *
     * Without it the sky stops dead against the grass in a hard line, and the
     * world looks cut out and pasted onto a backdrop rather than going on into
     * the distance.
     */
    const haze = ctx.createLinearGradient(0, -70, 0, 0);
    haze.addColorStop(0, 'rgba(232,244,238,0)');
    haze.addColorStop(1, 'rgba(232,244,238,.85)');
    ctx.fillStyle = haze;
    ctx.fillRect(left, -70, width, 70);
    ctx.restore();
    drawNorthernLandscape(ctx, medium, viewX, viewWidth);
    return;
  }

  ctx.fillStyle = PAPER;
  ctx.fillRect(left, viewY, width, height);

  // Ruled strokes, thinning out towards the top: a sky begun and left.
  const step = 26;
  for (let y = -step; y > viewY; y -= step) {
    const depth = 1 - y / viewY;
    ink(ctx, 0.05 + depth * 0.12, 0.8);
    ctx.beginPath();
    ctx.moveTo(left + 10, y + jitter(9100 + y, 1.2));
    ctx.lineTo(left + width - 10, y + jitter(9200 + y, 1.2));
    ctx.stroke();
  }

  // The sun, as an outline only.
  if (SUN.x + SUN.r * 2.4 > left && SUN.x - SUN.r * 2.4 < left + width) {
    // At rest in graphite: out of the colour nothing in this world moves.
    ink(ctx, 0.26, 1);
    sunFlames(ctx, 0);
    ctx.stroke();
    ink(ctx, 0.2, 0.9);
    ctx.beginPath();
    ctx.arc(SUN.x, SUN.y, SUN.r, 0, TAU);
    ctx.stroke();
  }

  /*
   * Clouds as soft masses, rubbed in with the side of the pencil.
   *
   * Drawn as outlines they came out as rows of linked rings: every lobe's whole
   * circumference is stroked, so you see all the arcs inside the cloud as well
   * as its edge. One fill of the union gives the silhouette and nothing else,
   * and a smudge is what a cloud is in a pencil drawing.
   */
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = PENCIL;
  for (const c of clouds) {
    if (c.x + c.r * 2 < left || c.x - c.r * 2 > left + width) continue;
    if (Math.abs(c.x - clearAt) < 360) continue;
    ctx.beginPath();
    for (let i = 0; i < c.lobes; i++) {
      const t = i / (c.lobes - 1 || 1) - 0.5;
      const cx = c.x + t * c.r * 1.5;
      // `moveTo` first: `ellipse` continues the current subpath, so without it
      // the lobes are strung together by chords and the non-zero rule cuts
      // holes where they overlap.
      ctx.moveTo(cx + c.r * 0.55, c.y);
      ctx.ellipse(cx, c.y, c.r * 0.55, c.r * 0.32, 0, 0, TAU);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The horizon, drawn firmly, because it is the edge of the paper.
  ink(ctx, 0.4, 1.2);
  ctx.beginPath();
  ctx.moveTo(left, jitter(9300, 1));
  ctx.lineTo(left + width, jitter(9301, 1));
  ctx.stroke();
  ctx.restore();
  drawNorthernLandscape(ctx, medium, viewX, viewWidth);
}
