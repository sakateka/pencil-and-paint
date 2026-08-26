import { isolate } from '../core/canvas';
import { shade } from '../core/color';
import { bounds, rectPoly, type Poly } from '../core/geom';
import { pick, rr } from '../core/rng';
import { PENCIL } from '../media/medium';
import { groundShadow, paint } from '../media/pencil';
import { ROOFS, WALLS } from './palette';
import { drawWindowBars } from './scenery';
import { rectCollider, type Scenery } from './types';

/**
 * Buildings are the clearest case for the occluder pass.
 *
 * Only the walls are solid. The roof is drawn above them, so if it were solid
 * too you could not walk behind the house at all and it would feel like a
 * bunker — but if nothing handles it, you walk *across the tiles*. Instead the
 * walls block, the gap behind them is walkable, and `bounds` tells the renderer
 * to lay the roof back over you while you are up there.
 */

export function makeHouse(x: number, y: number, w: number, h: number): Scenery {
  const wall = pick(WALLS);
  const roofColour = pick(ROOFS);
  const eave = w * 0.16;
  const roofHeight = h * 0.62;

  const body = rectPoly(x - w / 2, y - h, w, h);
  const roof: Poly = [
    [x - w / 2 - eave, y - h],
    [x, y - h - roofHeight],
    [x + w / 2 + eave, y - h],
    [x + w / 2 + eave * 0.5, y - h + 5],
    [x - w / 2 - eave * 0.5, y - h + 5],
  ];
  const door = rectPoly(x - w * 0.1, y - h * 0.52, w * 0.2, h * 0.52);
  const windows = [
    rectPoly(x - w * 0.38, y - h * 0.78, w * 0.18, h * 0.26),
    rectPoly(x + w * 0.2, y - h * 0.78, w * 0.18, h * 0.26),
  ];
  const chimney = rectPoly(x + w * 0.22, y - h - roofHeight * 0.72, w * 0.1, roofHeight * 0.55);

  return {
    y,
    tall: true,
    colliders: [rectCollider(x - w / 2, y - h, w, h)],
    bounds: {
      x0: x - w / 2 - eave - 5,
      y0: y - h - roofHeight - 8,
      x1: x + w / 2 + eave + 5,
      y1: y + 8,
    },
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 2, w * 0.62, 13, medium);
      paint(ctx, chimney, shade(roofColour, -0.1), medium, {
        angle: 0.5,
        edge: 'rgba(0,0,0,.25)',
      });
      paint(ctx, body, wall, medium, {
        angle: 1.5,
        edge: 'rgba(80,60,40,.35)',
        darkScale: 1.5,
      });
      paint(ctx, roof, roofColour, medium, { angle: -0.45, edge: 'rgba(0,0,0,.28)' });
      paint(ctx, door, '#7a4b2e', medium, { angle: 1.5, edge: 'rgba(0,0,0,.3)' });
      for (const w of windows) {
        paint(ctx, w, '#bcd8e6', medium, {
          angle: -0.5,
          edge: 'rgba(60,50,40,.55)',
          darkScale: 1.8,
        });
      }
      if (medium !== 'color') return;
      ctx.strokeStyle = 'rgba(60,50,40,.5)';
      ctx.lineWidth = 1.4;
      for (const w of windows) drawWindowBars(ctx, w);
    },
  };
}

export function makeBarn(x: number, y: number, w: number, h: number): Scenery {
  const roofHeight = h * 0.78;
  const eave = w * 0.06;

  const body = rectPoly(x - w / 2, y - h, w, h);
  // A gambrel: two slopes a side, which is what reads as "barn" at a glance.
  const roof: Poly = [
    [x - w / 2 - eave, y - h],
    [x - w * 0.4, y - h - roofHeight * 0.46],
    [x, y - h - roofHeight],
    [x + w * 0.4, y - h - roofHeight * 0.46],
    [x + w / 2 + eave, y - h],
    [x + w / 2 + eave * 0.4, y - h + 6],
    [x - w / 2 - eave * 0.4, y - h + 6],
  ];
  const door = rectPoly(x - w * 0.17, y - h * 0.66, w * 0.34, h * 0.66);
  const loft = rectPoly(x - w * 0.075, y - h - roofHeight * 0.66, w * 0.15, roofHeight * 0.32);

  return {
    y,
    tall: true,
    colliders: [rectCollider(x - w / 2, y - h, w, h)],
    bounds: {
      x0: x - w / 2 - eave - 5,
      y0: y - h - roofHeight - 8,
      x1: x + w / 2 + eave + 5,
      y1: y + 8,
    },
    draw(ctx, medium) {
      groundShadow(ctx, x, y + 2, w * 0.6, 14, medium);
      paint(ctx, body, '#a8443a', medium, { angle: 1.5, edge: 'rgba(60,30,25,.4)' });
      paint(ctx, roof, '#544a44', medium, { angle: -0.5, edge: 'rgba(0,0,0,.3)' });
      paint(ctx, door, '#6d4632', medium, { angle: 1.5, edge: 'rgba(0,0,0,.35)' });
      paint(ctx, loft, '#6d4632', medium, { angle: 1.5, edge: 'rgba(0,0,0,.35)' });

      const d = bounds(door);
      if (medium === 'color') {
        ctx.strokeStyle = '#f2ece0';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(d.x0, d.y0);
        ctx.lineTo(d.x1, d.y1);
        ctx.moveTo(d.x1, d.y0);
        ctx.lineTo(d.x0, d.y1);
        ctx.moveTo(d.x0, d.y0);
        ctx.lineTo(d.x1, d.y0);
        ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y - h + 4);
        ctx.lineTo(x + w / 2, y - h + 4);
        ctx.stroke();
        return;
      }
      isolate(ctx, () => {
        ctx.strokeStyle = PENCIL;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(d.x0 + rr(-1, 1), d.y0);
        ctx.lineTo(d.x1 + rr(-1, 1), d.y1);
        ctx.moveTo(d.x1 + rr(-1, 1), d.y0);
        ctx.lineTo(d.x0 + rr(-1, 1), d.y1);
        ctx.stroke();
      });
    },
  };
}
