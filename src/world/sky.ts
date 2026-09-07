import { Rng } from '../core/rng';
import { TAU } from '../core/math';
import { createSurface } from '../core/canvas';
import { ink, jitter, withBoilAt } from '../media/ink';
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

/** The sun, over towards the right, with the spiky rays it has in the painting.
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
export const SUN = { x: 2792, y: -486, r: 150 };

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
    // Round the sun's own centre, like the disc inside: the caller puts that
    // centre where it belongs. Reaching from the sun's world position here
    // threw the whole ring 2792 units off its own disc, so every flame landed
    // outside the picture and was clipped away — a sun with no rays at all.
    const at = (a: number, r: number): [number, number] => [
      Math.cos(a) * r,
      Math.sin(a) * r,
    ];
    if (i === 0) ctx.moveTo(...at(a0, SUN.r));
    // Fat control points, so each ray is a rounded lick rather than a blade.
    ctx.quadraticCurveTo(...at(a0 + 0.04, reach * 1.02), ...at(tip, reach));
    ctx.quadraticCurveTo(...at(a1 - 0.1, reach * 0.86), ...at(a1, SUN.r * 0.99));
  }
  ctx.closePath();
}

export function sunVisible(left: number, width: number): boolean {
  return SUN.x + SUN.r * 2.4 > left && SUN.x - SUN.r * 2.4 < left + width;
}

/**
 * The sun, at its own centre, frozen at spin zero.
 *
 * The flames turn as one rigid drawing, so the turning is the sprite's
 * rotation (`looks/sun.ts`); what is baked here is the drawing that turns, and
 * the disc inside it, which a rotation carries invisibly.
 */
export function drawSunBody(
  ctx: CanvasRenderingContext2D,
  medium: Medium,
  /** How far the flame ring has turned. The bake asks for zero. */
  spin = 0,
): void {
  if (medium === 'color') {
    ctx.fillStyle = '#f6d64a';
    sunFlames(ctx, spin);
    ctx.fill();
    ctx.fillStyle = '#f8de5c';
    ctx.beginPath();
    ctx.arc(0, 0, SUN.r, 0, TAU);
    ctx.fill();
  } else {
    ink(ctx, 0.26, 1);
    sunFlames(ctx, 0);
    ctx.stroke();
    ink(ctx, 0.2, 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, SUN.r, 0, TAU);
    ctx.stroke();
  }
}

export function drawSkyBackdrop(
  ctx: CanvasRenderingContext2D,
  viewX: number,
  viewY: number,
  viewWidth: number,
  medium: Medium,
  clearAt: number,
): void {
  if (viewY >= 0) return;

  const left = viewX - 8;
  const width = viewWidth + 16;
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

  const step = 26;
  for (let y = -step; y > viewY; y -= step) {
    const depth = 1 - y / viewY;
    ink(ctx, 0.05 + depth * 0.12, 0.8);
    ctx.beginPath();
    ctx.moveTo(left + 10, y + jitter(9100 + y, 1.2));
    ctx.lineTo(left + width - 10, y + jitter(9200 + y, 1.2));
    ctx.stroke();
  }

  ctx.globalAlpha = 0.12;
  ctx.fillStyle = PENCIL;
  for (const c of clouds) {
    if (c.x + c.r * 2 < left || c.x - c.r * 2 > left + width) continue;
    if (Math.abs(c.x - clearAt) < 360) continue;
    ctx.beginPath();
    for (let i = 0; i < c.lobes; i++) {
      const t = i / (c.lobes - 1 || 1) - 0.5;
      const cx = c.x + t * c.r * 1.5;
      ctx.moveTo(cx + c.r * 0.55, c.y);
      ctx.ellipse(cx, c.y, c.r * 0.55, c.r * 0.32, 0, 0, TAU);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ink(ctx, 0.4, 1.2);
  ctx.beginPath();
  ctx.moveTo(left, jitter(9300, 1));
  ctx.lineTo(left + width, jitter(9301, 1));
  ctx.stroke();
  ctx.restore();
  drawNorthernLandscape(ctx, medium, viewX, viewWidth);
}

/** Margin baked into the sky strip either side of the world, in world units. */
const SKY_STRIP_MARGIN = 32;

/**
 * The whole sky, painted once onto a canvas the camera can simply scroll.
 *
 * Everything the backdrop holds is fixed in world coordinates — the gradient,
 * the clouds at their places, the horizon, the northern hills — and the ruled
 * strokes are hashed, not boiled, so the painting is deterministic. Baking it
 * removes the one stall that arrived exactly while walking: the old anchored
 * cel was as wide as the view, and every 512 world pixels of progress re-painted
 * and re-uploaded several megabytes to the GPU, twice, in the middle of a frame.
 *
 * The painted sun is not in the strip: its flames turn, so it keeps its own
 * picture above this (`render/looks/sun.ts`). The graphite one *is* in the
 * strip, and belongs there — a ruled-in sun does not turn, which leaves it a
 * drawing fixed in the world like the clouds and the hills beside it. On its
 * own it was a 393-square picture that was ninety-six per cent hole, because a
 * ring of flames is mostly the middle it goes round: 598KB, the largest single
 * thing in the library, for a hairline the strip already has room for.
 */
export function bakeSkyStrip(
  medium: Medium,
  worldWidth: number,
  clearAt: number,
): { canvas: HTMLCanvasElement; x: number; y: number } {
  const width = worldWidth + SKY_STRIP_MARGIN * 2;
  const height = Math.ceil(SKY_DEPTH + 2);
  const surface = createSurface(width, height);
  // The backdrop draws in world coordinates; this is what puts world
  // (-SKY_STRIP_MARGIN, -SKY_DEPTH) at the canvas's own corner. Without it the
  // whole painting lands above the canvas and is clipped away — an empty strip,
  // and a valley with no sky, hills or house on it.
  surface.ctx.setTransform(1, 0, 0, 1, SKY_STRIP_MARGIN, SKY_DEPTH);
  drawSkyBackdrop(surface.ctx, -SKY_STRIP_MARGIN, -SKY_DEPTH, width, medium, clearAt);
  if (medium !== 'color') {
    /*
     * Over the clouds, where the sprite used to sit a thousandth of a depth
     * above the strip. At the boil it is held at, like everything else baked
     * once: the strip is hashed rather than boiled so that it cannot twitch.
     *
     * It fits, but only just, and worth writing down: the sun's centre is at
     * x 2792 with flames reaching 199, so its ink runs to 2991 — past the
     * strip's right edge at 2832. The camera cannot follow it there. Its
     * centre is off the corner of the paper by design and the view is clamped
     * to the world's own width, so nothing east of 2800 is ever on screen.
     */
    surface.ctx.save();
    surface.ctx.translate(SUN.x, SUN.y);
    withBoilAt(0, () => drawSunBody(surface.ctx, medium));
    surface.ctx.restore();
  }
  return { canvas: surface.canvas, x: -SKY_STRIP_MARGIN, y: -SKY_DEPTH };
}
