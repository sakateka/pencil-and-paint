import { isolate } from '../core/canvas';
import { ellipsePoly, circlePoly, rectPoly, tracePoly, type Poly } from '../core/geom';
import { TAU } from '../core/math';
import { rnd, rr } from '../core/rng';
import { PENCIL, type Medium } from '../media/medium';
import { groundShadow, paint } from '../media/pencil';
import { STONE, STONE_EDGE, STRAW, STRAW_EDGE, WATER, WOOD, WOOD_EDGE } from './palette';
import { circleCollider, rectCollider, type Scenery } from './types';

/** Haystacks, bales, a well, a scarecrow, a bench, a trough. */

/** Scattered straw ticks — the texture that makes hay read as hay in both media. */
function strawTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  medium: Medium,
  count: number,
): void {
  isolate(ctx, () => {
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const a = rr(0, TAU);
      const d = Math.sqrt(rnd());
      const px = x + Math.cos(a) * rx * d;
      const py = y + Math.sin(a) * ry * d;
      const angle = rr(-1.2, -0.35);
      if (medium === 'color') {
        ctx.strokeStyle = 'rgba(150,110,45,.5)';
        ctx.globalAlpha = rr(0.35, 0.8);
      } else {
        ctx.strokeStyle = PENCIL;
        ctx.globalAlpha = rr(0.15, 0.4);
      }
      ctx.lineWidth = rr(0.6, 1.3);
      const len = rr(4, 10);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(angle) * len, py + Math.sin(angle) * len);
      ctx.stroke();
    }
  });
}

export function makeHaystack(x: number, y: number, s: number): Scenery {
  const cone: Poly = [
    [x - 46 * s, y],
    [x - 40 * s, y - 26 * s],
    [x - 24 * s, y - 52 * s],
    [x - 6 * s, y - 68 * s],
    [x + 4 * s, y - 70 * s],
    [x + 22 * s, y - 52 * s],
    [x + 40 * s, y - 26 * s],
    [x + 46 * s, y],
  ];

  return {
    y,
    tall: true,
    colliders: [circleCollider(x, y - 8 * s, 40 * s)],
    bounds: { x0: x - 54 * s, y0: y - 92 * s, x1: x + 54 * s, y1: y + 8 },
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 2, 52 * s, 16 * s, medium);
      paint(ctx, cone, STRAW, medium, { angle: -1.15, edge: STRAW_EDGE, darkScale: 1.35 });
      strawTexture(ctx, x, y - 30 * s, 34 * s, 26 * s, medium, 46);

      // the pole through the middle
      if (medium === 'color') {
        ctx.strokeStyle = '#8a6a3f';
        ctx.lineWidth = 3 * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 2 * s, y - 66 * s);
        ctx.lineTo(x + 4 * s, y - 84 * s);
        ctx.stroke();
        return;
      }
      isolate(ctx, () => {
        ctx.strokeStyle = PENCIL;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 2 * s, y - 66 * s);
        ctx.lineTo(x + 4 * s + rr(-1, 1), y - 84 * s);
        ctx.stroke();
      });
    },
  };
}

export function makeHayBale(x: number, y: number, s: number): Scenery {
  const r = 21 * s;
  const side = ellipsePoly(x, y - r * 0.92, r, r * 0.92, 20, 0.035);
  const cx = x;
  const cy = y - r * 0.92;

  return {
    y,
    colliders: [circleCollider(x, y - r * 0.6, r * 0.95)],
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 1, r * 1.25, r * 0.42, medium);
      paint(ctx, side, '#dcba66', medium, { angle: -1.2, edge: STRAW_EDGE, darkScale: 1.3 });

      // the spiral that says "rolled"
      isolate(ctx, () => {
        tracePoly(ctx, side);
        ctx.clip();
        if (medium === 'color') {
          ctx.strokeStyle = 'rgba(150,110,45,.55)';
          ctx.lineWidth = 1.6;
          for (let k = 1; k <= 3; k++) {
            ctx.beginPath();
            ctx.ellipse(cx, cy, r * 0.26 * k, r * 0.24 * k, 0.2, 0, TAU);
            ctx.stroke();
          }
        } else {
          ctx.strokeStyle = PENCIL;
          ctx.lineWidth = 0.9;
          ctx.globalAlpha = 0.3;
          for (let k = 1; k <= 3; k++) {
            ctx.beginPath();
            ctx.ellipse(cx + rr(-1, 1), cy + rr(-1, 1), r * 0.26 * k, r * 0.24 * k, 0.2, 0, TAU);
            ctx.stroke();
          }
        }
      });
      strawTexture(ctx, cx, cy, r * 0.8, r * 0.7, medium, 18);
    },
  };
}

export function makeWell(x: number, y: number): Scenery {
  const base = ellipsePoly(x, y - 12, 26, 15, 20, 0.04);
  const wall: Poly = [
    [x - 26, y - 12],
    [x + 26, y - 12],
    [x + 24, y - 30],
    [x - 24, y - 30],
  ];
  const rim = ellipsePoly(x, y - 30, 24, 12, 20, 0.03);
  const hole = ellipsePoly(x, y - 30, 17, 8, 16, 0.05);
  const roof: Poly = [
    [x - 30, y - 62],
    [x, y - 82],
    [x + 30, y - 62],
    [x + 24, y - 60],
    [x - 24, y - 60],
  ];

  return {
    y,
    tall: true,
    colliders: [circleCollider(x, y - 14, 26)],
    bounds: { x0: x - 36, y0: y - 90, x1: x + 36, y1: y + 8 },
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 1, 32, 11, medium);
      paint(ctx, base, '#8e8a80', medium, { angle: -1.2, edge: STONE_EDGE });
      paint(ctx, wall, STONE, medium, { angle: -1.2, edge: STONE_EDGE });
      paint(ctx, rim, '#b0aca2', medium, { angle: -1.2, outlineAlpha: 0.4 });
      paint(ctx, hole, '#3a4348', medium, { angle: 0, edge: '#2a3135', darkScale: 1.2 });

      if (medium === 'color') {
        ctx.strokeStyle = '#8a6a3f';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - 20, y - 30);
        ctx.lineTo(x - 20, y - 62);
        ctx.moveTo(x + 20, y - 30);
        ctx.lineTo(x + 20, y - 62);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 60);
        ctx.lineTo(x, y - 44);
        ctx.stroke();
      } else {
        isolate(ctx, () => {
          ctx.strokeStyle = PENCIL;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1.3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x - 20 + rr(-1, 1), y - 30);
          ctx.lineTo(x - 20 + rr(-1, 1), y - 62);
          ctx.moveTo(x + 20 + rr(-1, 1), y - 30);
          ctx.lineTo(x + 20 + rr(-1, 1), y - 62);
          ctx.stroke();
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(x, y - 60);
          ctx.lineTo(x + rr(-1, 1), y - 44);
          ctx.stroke();
        });
      }

      paint(ctx, roof, '#8a5a3c', medium, { angle: -0.5, edge: 'rgba(0,0,0,.3)' });
      paint(ctx, rectPoly(x - 6, y - 44, 12, 10), WOOD, medium, { angle: 1.4, edge: WOOD_EDGE });
    },
  };
}

export function makeScarecrow(x: number, y: number): Scenery {
  const shirt: Poly = [
    [x - 15, y - 62],
    [x + 15, y - 62],
    [x + 12, y - 34],
    [x - 12, y - 34],
  ];
  const head = circlePoly(x, y - 72, 11, 14, 0.08);
  const hat: Poly = [
    [x - 17, y - 78],
    [x + 17, y - 78],
    [x + 10, y - 82],
    [x + 7, y - 92],
    [x - 7, y - 92],
    [x - 10, y - 82],
  ];

  const stitchedFace = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 75);
    ctx.lineTo(x - 2, y - 71);
    ctx.moveTo(x - 2, y - 75);
    ctx.lineTo(x - 6, y - 71);
    ctx.moveTo(x + 2, y - 75);
    ctx.lineTo(x + 6, y - 71);
    ctx.moveTo(x + 6, y - 75);
    ctx.lineTo(x + 2, y - 71);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - 68, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
  };

  return {
    y,
    tall: true,
    colliders: [circleCollider(x, y - 10, 11)],
    bounds: { x0: x - 40, y0: y - 98, x1: x + 40, y1: y + 8 },
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 1, 20, 7, medium);

      // post and cross arm
      if (medium === 'color') {
        ctx.strokeStyle = '#8a6a3f';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 60);
        ctx.moveTo(x - 30, y - 56);
        ctx.lineTo(x + 30, y - 56);
        ctx.stroke();
      } else {
        isolate(ctx, () => {
          ctx.strokeStyle = PENCIL;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1.4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x + rr(-1, 1), y);
          ctx.lineTo(x + rr(-1, 1), y - 60);
          ctx.moveTo(x - 30, y - 56 + rr(-1, 1));
          ctx.lineTo(x + 30, y - 56 + rr(-1, 1));
          ctx.stroke();
        });
      }

      for (const offset of [-30, 30]) {
        strawTexture(ctx, x + offset, y - 55, 6, 5, medium, 7);
      }
      paint(ctx, shirt, '#b8523f', medium, { angle: 1.5, edge: 'rgba(60,30,25,.4)' });
      paint(ctx, head, '#e0cfa0', medium, { angle: -0.9, edge: '#a8935f' });
      paint(ctx, hat, '#8a6a3f', medium, { angle: -0.6, edge: 'rgba(0,0,0,.3)' });

      if (medium === 'color') {
        ctx.strokeStyle = '#6b5a38';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        stitchedFace(ctx);
      } else {
        isolate(ctx, () => {
          ctx.strokeStyle = PENCIL;
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 0.9;
          stitchedFace(ctx);
        });
      }
    },
  };
}

export function makeBench(x: number, y: number): Scenery {
  const seat = rectPoly(x - 30, y - 20, 60, 6);
  const back = rectPoly(x - 30, y - 34, 60, 5);

  const legs = (ctx: CanvasRenderingContext2D, wobble: number) => {
    const w = () => rr(-wobble, wobble);
    ctx.beginPath();
    ctx.moveTo(x - 24 + w(), y - 18);
    ctx.lineTo(x - 24 + w(), y);
    ctx.moveTo(x + 24 + w(), y - 18);
    ctx.lineTo(x + 24 + w(), y);
    ctx.moveTo(x - 24 + w(), y - 34);
    ctx.lineTo(x - 24 + w(), y - 18);
    ctx.moveTo(x + 24 + w(), y - 34);
    ctx.lineTo(x + 24 + w(), y - 18);
    ctx.stroke();
  };

  return {
    y,
    colliders: [circleCollider(x, y - 8, 22)],
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 1, 34, 9, medium);
      if (medium === 'color') {
        ctx.strokeStyle = WOOD_EDGE;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        legs(ctx, 0);
      } else {
        isolate(ctx, () => {
          ctx.strokeStyle = PENCIL;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1.2;
          ctx.lineCap = 'round';
          legs(ctx, 1);
        });
      }
      paint(ctx, seat, WOOD, medium, { angle: 1.5, edge: WOOD_EDGE });
      paint(ctx, back, WOOD, medium, { angle: 1.5, edge: WOOD_EDGE });
    },
  };
}

export function makeTrough(x: number, y: number): Scenery {
  const box: Poly = [
    [x - 26, y - 16],
    [x + 26, y - 16],
    [x + 22, y],
    [x - 22, y],
  ];
  const water: Poly = [
    [x - 22, y - 13],
    [x + 22, y - 13],
    [x + 20, y - 6],
    [x - 20, y - 6],
  ];

  return {
    y,
    colliders: [circleCollider(x, y - 8, 22)],
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 1, 30, 9, medium);
      paint(ctx, box, WOOD, medium, { angle: 1.5, edge: WOOD_EDGE });
      if (medium === 'color') {
        tracePoly(ctx, water);
        ctx.fillStyle = WATER;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x - 14, y - 10);
        ctx.lineTo(x + 2, y - 10);
        ctx.stroke();
        return;
      }
      isolate(ctx, () => {
        ctx.strokeStyle = PENCIL;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 3; i++) {
          const yy = y - 12 + i * 2.4;
          ctx.beginPath();
          ctx.moveTo(x - 20, yy + rr(-0.5, 0.5));
          ctx.lineTo(x + 20, yy + rr(-0.5, 0.5));
          ctx.stroke();
        }
      });
    },
  };
}

/** What is growing in a bed. Each reads differently at a glance. */
export type Crop = 'carrot' | 'cabbage' | 'onion';

const SOIL = '#6b4a32';
const SOIL_EDGE = '#4a3324';
const LEAF = '#5b9c46';

/**
 * A raised vegetable bed: a plank frame, turned soil, and rows of something
 * growing. `x, y` is the middle of the front edge, as everywhere else.
 */
export function makeGardenBed(x: number, y: number, w: number, h: number, crop: Crop): Scenery {
  const top = y - h;
  const soil = rectPoly(x - w / 2, top, w, h);
  const plank = 3.5;

  // Two tidy rows, nudged just enough that they are not machine-perfect.
  const columns = Math.max(3, Math.round(w / 26));
  const plants: { x: number; y: number }[] = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < columns; col++) {
      plants.push({
        x: x - w / 2 + (w / (columns + 1)) * (col + 1) + rr(-2, 2),
        y: top + (h / 3) * (row + 1) + rr(-1.5, 1.5),
      });
    }
  }

  const drawPlant = (ctx: CanvasRenderingContext2D, px: number, py: number, medium: Medium) => {
    if (medium === 'color') {
      ctx.strokeStyle = LEAF;
      ctx.lineCap = 'round';
      if (crop === 'carrot') {
        ctx.lineWidth = 1.4;
        for (const lean of [-2.6, 0, 2.6]) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.quadraticCurveTo(px + lean * 0.5, py - 4, px + lean, py - 7.5);
          ctx.stroke();
        }
        ctx.fillStyle = '#e08b3a';
        ctx.beginPath();
        ctx.ellipse(px, py + 0.6, 2, 1.4, 0, 0, TAU);
        ctx.fill();
        return;
      }
      if (crop === 'cabbage') {
        ctx.fillStyle = LEAF;
        ctx.beginPath();
        ctx.arc(px, py - 2, 4.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#7fbc5e';
        ctx.beginPath();
        ctx.arc(px - 0.8, py - 2.8, 2.2, 0, TAU);
        ctx.fill();
        return;
      }
      ctx.lineWidth = 1.6; // onion: upright blades
      for (const lean of [-1.6, 0.4, 2.2]) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + lean, py - 8);
        ctx.stroke();
      }
      ctx.fillStyle = '#e6dfc6';
      ctx.beginPath();
      ctx.ellipse(px, py + 0.4, 2.2, 1.6, 0, 0, TAU);
      ctx.fill();
      return;
    }

    isolate(ctx, () => {
      ctx.strokeStyle = PENCIL;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 0.85;
      if (crop === 'cabbage') {
        ctx.beginPath();
        ctx.arc(px + rr(-0.5, 0.5), py - 2, 4.2, 0, TAU);
        ctx.stroke();
        return;
      }
      const leans = crop === 'carrot' ? [-2.6, 0, 2.6] : [-1.6, 0.4, 2.2];
      for (const lean of leans) {
        ctx.beginPath();
        ctx.moveTo(px + rr(-0.4, 0.4), py);
        ctx.lineTo(px + lean, py - (crop === 'carrot' ? 7.5 : 8));
        ctx.stroke();
      }
    });
  };

  return {
    y,
    colliders: [rectCollider(x - w / 2, top, w, h)],
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 1, w * 0.55, 7, medium);
      // Turned soil, hatched dark in graphite because it is the darkest thing
      // in the garden.
      paint(ctx, soil, SOIL, medium, { angle: -0.2, edge: SOIL_EDGE, darkScale: 1.1 });
      for (const p of plants) drawPlant(ctx, p.x, p.y, medium);
      // Plank frame last, so the crops sit inside it.
      for (const side of [
        rectPoly(x - w / 2, top, w, plank),
        rectPoly(x - w / 2, y - plank, w, plank),
        rectPoly(x - w / 2, top, plank, h),
        rectPoly(x + w / 2 - plank, top, plank, h),
      ]) {
        paint(ctx, side, WOOD, medium, { angle: 1.5, edge: WOOD_EDGE, outlineAlpha: 0.4 });
      }
    },
  };
}
