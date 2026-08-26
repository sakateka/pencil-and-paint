import { isolate } from '../core/canvas';
import { circlePoly, ellipsePoly, tracePoly, type Point } from '../core/geom';
import { lerp, TAU } from '../core/math';
import { pick, rnd, rr } from '../core/rng';
import { PAPER, PENCIL, type Medium } from '../media/medium';
import { paint, sketchOutline } from '../media/pencil';
import { GRAIN } from '../media/sprites';
import { GREENS } from './palette';
import { ellipseCollider, type Scenery } from './types';

/** The ground itself: grass, dirt paths, the pond. */

export interface Ellipse {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** A tuft of grass: an anchor and a few blades. */
export interface Tuft {
  x: number;
  y: number;
  blades: Point[];
  colour: string;
}

export type Path = Point[];

export function makePond(x: number, y: number, rx: number, ry: number): Scenery & { area: Ellipse } {
  const outer = ellipsePoly(x, y, rx, ry, 30, 0.055);
  const inner = ellipsePoly(x + 6, y + 4, rx * 0.74, ry * 0.7, 26, 0.06);

  const pads: { x: number; y: number; r: number; flower: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * 0.72;
    pads.push({
      x: x + Math.cos(a) * rx * d,
      y: y + Math.sin(a) * ry * d,
      r: rr(9, 15),
      flower: rnd() < 0.4,
    });
  }

  return {
    // Sorted by its top edge: the pond is a hole in the ground, drawn early.
    y: y - ry,
    area: { x, y, rx, ry },
    colliders: [ellipseCollider(x, y, rx * 0.97, ry * 0.97)],
    draw(ctx, medium) {
      paint(ctx, outer, '#5f7f6a', medium, { angle: 0, outlineAlpha: 0.45, darkScale: 0.5 });

      if (medium === 'color') {
        const g = ctx.createLinearGradient(x, y - ry, x, y + ry);
        g.addColorStop(0, '#6fb3d2');
        g.addColorStop(1, '#3d7fa8');
        tracePoly(ctx, inner);
        ctx.fillStyle = g;
        ctx.fill();
        isolate(ctx, () => {
          tracePoly(ctx, inner);
          ctx.clip();
          ctx.strokeStyle = 'rgba(255,255,255,.45)';
          ctx.lineCap = 'round';
          for (let i = 0; i < 14; i++) {
            const yy = y - ry + rnd() * ry * 2;
            const w = rr(18, 52);
            ctx.lineWidth = rr(1, 2.2);
            ctx.globalAlpha = rr(0.25, 0.6);
            const xx = x + rr(-rx, rx - w);
            ctx.beginPath();
            ctx.moveTo(xx, yy);
            ctx.quadraticCurveTo(xx + w / 2, yy - 3, xx + w, yy);
            ctx.stroke();
          }
        });
      } else {
        // Water reads as horizontal ripple lines. Hatching it like a solid
        // would make the pond look like a rock.
        isolate(ctx, () => {
          tracePoly(ctx, inner);
          ctx.clip();
          ctx.strokeStyle = PENCIL;
          ctx.lineCap = 'round';
          for (let yy = y - ry; yy < y + ry; yy += 6.5) {
            ctx.globalAlpha = 0.1 + rnd() * 0.16;
            ctx.lineWidth = 0.7 + rnd() * 0.5;
            const w = rr(24, rx * 1.5);
            const xx = x + rr(-rx, rx * 0.4);
            ctx.beginPath();
            ctx.moveTo(xx, yy);
            ctx.bezierCurveTo(xx + w * 0.33, yy - 2.4, xx + w * 0.66, yy + 2.4, xx + w, yy);
            ctx.stroke();
          }
        });
        sketchOutline(ctx, inner, 0.35, 1);
      }

      for (const pad of pads) {
        paint(ctx, circlePoly(pad.x, pad.y, pad.r, 12, 0.1), '#4f9648', medium, {
          angle: -0.6,
          outlineAlpha: 0.4,
          darkScale: 0.8,
        });
        if (!pad.flower) continue;
        if (medium === 'color') {
          ctx.fillStyle = '#f6c9de';
          ctx.beginPath();
          ctx.arc(pad.x, pad.y - 2, 4, 0, TAU);
          ctx.fill();
        } else {
          isolate(ctx, () => {
            ctx.globalAlpha = 0.45;
            ctx.strokeStyle = PENCIL;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.arc(pad.x, pad.y - 2, 4, 0, TAU);
            ctx.stroke();
          });
        }
      }
    },
  };
}

/**
 * A dirt path.
 *
 * Note it is not a filled polygon in either medium. In colour it is a thick
 * stroke; in graphite it is two wobbling edge lines with stipple between them,
 * because that is how a path is actually sketched — you draw where it *isn't*.
 */
export function drawPath(ctx: CanvasRenderingContext2D, path: Path, medium: Medium): void {
  const trace = () => {
    ctx.beginPath();
    path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  };

  if (medium === 'color') {
    isolate(ctx, () => {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#c2a878';
      ctx.lineWidth = 50;
      trace();
      ctx.stroke();
      ctx.strokeStyle = '#d4bd90';
      ctx.lineWidth = 38;
      trace();
      ctx.stroke();
      ctx.fillStyle = 'rgba(150,125,90,.5)';
      for (let i = 0; i < path.length - 1; i++) {
        for (let k = 0; k < 7; k++) {
          const t = rnd();
          const px = lerp(path[i][0], path[i + 1][0], t) + rr(-18, 18);
          const py = lerp(path[i][1], path[i + 1][1], t) + rr(-15, 15);
          ctx.beginPath();
          ctx.arc(px, py, rr(1, 2.6), 0, TAU);
          ctx.fill();
        }
      }
    });
    return;
  }

  isolate(ctx, () => {
    ctx.strokeStyle = PENCIL;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = pass ? 0.16 : 0.34;
        ctx.lineWidth = pass ? 0.7 : 1.1;
        ctx.beginPath();
        for (let i = 0; i < path.length; i++) {
          const a = path[Math.max(0, i - 1)];
          const b = path[Math.min(path.length - 1, i + 1)];
          let nx = -(b[1] - a[1]);
          let ny = b[0] - a[0];
          const len = Math.hypot(nx, ny) || 1;
          nx /= len;
          ny /= len;
          const x = path[i][0] + nx * side * 24 + rr(-2.5, 2.5);
          const y = path[i][1] + ny * side * 24 + rr(-2.5, 2.5);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
    for (let i = 0; i < path.length - 1; i++) {
      for (let k = 0; k < 16; k++) {
        const t = rnd();
        const px = lerp(path[i][0], path[i + 1][0], t) + rr(-19, 19);
        const py = lerp(path[i][1], path[i + 1][1], t) + rr(-17, 17);
        ctx.globalAlpha = rr(0.12, 0.32);
        ctx.lineWidth = rr(0.7, 1.3);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + rr(-3, 3), py + rr(-1, 1));
        ctx.stroke();
      }
    }
  });
}

export function drawGround(
  ctx: CanvasRenderingContext2D,
  medium: Medium,
  width: number,
  height: number,
): void {
  if (medium === 'color') {
    ctx.fillStyle = '#83b56a';
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 90; i++) {
      const x = rr(0, width);
      const y = rr(0, height);
      const r = rr(70, 260);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tint = rnd() < 0.5 ? '150,190,110' : '105,155,85';
      g.addColorStop(0, `rgba(${tint},.22)`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    return;
  }

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  isolate(ctx, () => {
    const pattern = ctx.createPattern(GRAIN, 'repeat');
    if (pattern) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    }
  });
  // Faint construction strokes, like a hand warming up on the page.
  isolate(ctx, () => {
    ctx.strokeStyle = PENCIL;
    ctx.lineCap = 'round';
    for (let i = 0; i < 150; i++) {
      const x = rr(0, width);
      const y = rr(0, height);
      const len = rr(60, 300);
      const a = rr(-0.25, 0.25);
      ctx.globalAlpha = rr(0.02, 0.06);
      ctx.lineWidth = rr(0.6, 1.6);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len / 2, y + a * 40, x + len * Math.cos(a), y + len * Math.sin(a));
      ctx.stroke();
    }
  });
}

export function makeTuft(x: number, y: number): Tuft {
  const blades: Point[] = [];
  for (let i = 0; i < 3; i++) blades.push([rr(-5, 5), rr(5, 12)]);
  return { x, y, blades, colour: pick(GREENS) };
}

export function drawTufts(
  ctx: CanvasRenderingContext2D,
  tufts: readonly Tuft[],
  medium: Medium,
): void {
  isolate(ctx, () => {
    ctx.lineCap = 'round';
    if (medium === 'color') {
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.85;
    } else {
      ctx.strokeStyle = PENCIL;
      ctx.lineWidth = 0.85;
      ctx.globalAlpha = 0.26;
    }
    for (const tuft of tufts) {
      if (medium === 'color') ctx.strokeStyle = tuft.colour;
      for (const [dx, dy] of tuft.blades) {
        const originX = medium === 'color' ? tuft.x : tuft.x + rr(-0.5, 0.5);
        ctx.beginPath();
        ctx.moveTo(originX, tuft.y);
        ctx.quadraticCurveTo(tuft.x + dx * 0.4, tuft.y - dy * 0.7, tuft.x + dx, tuft.y - dy);
        ctx.stroke();
      }
    }
  });
}
