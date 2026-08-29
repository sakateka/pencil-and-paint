import { clamp } from '../core/math';
import type { Collider } from '../world/types';

/** Anything that can be pushed out of scenery. */
export interface Body {
  x: number;
  y: number;
}

/**
 * The world is drawn in a three-quarter view, so a circle on the ground is an
 * ellipse on screen. Squashing the vertical distance by this before measuring
 * makes obstacles feel like they are lying on the ground rather than standing
 * up facing the camera.
 */
const VERTICAL_SQUASH = 1.6;

export interface WorldEdges {
  minX: number;
  minY: number | ((x: number) => number);
  maxX: number;
  maxY: number;
}

/**
 * Push `body` out of everything solid, then back inside the map.
 *
 * Shared by the walker and the livestock — a cow should no more stand inside a
 * tree than you should. Position-based rather than velocity-based: simply move
 * the body to the nearest legal spot, which for a stroll is indistinguishable
 * from something cleverer.
 */
export function resolveCollisions(
  body: Body,
  radius: number,
  colliders: readonly Collider[],
  edges: WorldEdges,
): void {
  for (const collider of colliders) {
    switch (collider.kind) {
      case 'circle':
        pushOutOfCircle(body, radius, collider.x, collider.y, collider.r);
        break;
      case 'rect':
        pushOutOfRect(body, radius, collider.x, collider.y, collider.w, collider.h);
        break;
      case 'ellipse':
        pushOutOfEllipse(body, radius, collider.x, collider.y, collider.rx, collider.ry);
        break;
    }
  }
  body.x = clamp(body.x, edges.minX, edges.maxX);
  const minY = typeof edges.minY === 'function' ? edges.minY(body.x) : edges.minY;
  body.y = clamp(body.y, minY, edges.maxY);
}

function pushOutOfCircle(
  body: Body,
  radius: number,
  cx: number,
  cy: number,
  r: number,
): void {
  const dx = body.x - cx;
  const dy = (body.y - cy) * VERTICAL_SQUASH;
  const d = Math.hypot(dx, dy);
  const minimum = r + radius;
  if (d >= minimum || d <= 0.001) return;
  const push = minimum - d;
  body.x += (dx / d) * push;
  body.y += (dy / d) * push / VERTICAL_SQUASH;
}

function pushOutOfRect(
  body: Body,
  radius: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const nearestX = clamp(body.x, x, x + w);
  const nearestY = clamp(body.y, y, y + h);
  const dx = body.x - nearestX;
  const dy = body.y - nearestY;
  const d = Math.hypot(dx, dy);
  if (d >= radius) return;

  if (d > 0.001) {
    body.x += (dx / d) * (radius - d);
    body.y += (dy / d) * (radius - d);
    return;
  }

  // Dead centre: no direction to push along, so leave by the nearest edge.
  const left = body.x - x;
  const right = x + w - body.x;
  const top = body.y - y;
  const bottom = y + h - body.y;
  const nearest = Math.min(left, right, top, bottom);
  if (nearest === left) body.x = x - radius;
  else if (nearest === right) body.x = x + w + radius;
  else if (nearest === top) body.y = y - radius;
  else body.y = y + h + radius;
}

function pushOutOfEllipse(
  body: Body,
  radius: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  // Work in a space where the ellipse is a unit circle.
  const ex = rx + radius;
  const ey = ry + radius;
  const dx = (body.x - cx) / ex;
  const dy = (body.y - cy) / ey;
  const d = Math.hypot(dx, dy);
  if (d >= 1 || d <= 0.001) return;
  body.x = cx + (dx / d) * ex;
  body.y = cy + (dy / d) * ey;
}

/** Is this spot clear of everything solid? Used when scattering paint pots. */
export function isSpotClear(
  x: number,
  y: number,
  pad: number,
  colliders: readonly Collider[],
): boolean {
  for (const collider of colliders) {
    switch (collider.kind) {
      case 'circle':
        if (Math.hypot(x - collider.x, y - collider.y) < collider.r + pad) return false;
        break;
      case 'rect': {
        const nx = clamp(x, collider.x, collider.x + collider.w);
        const ny = clamp(y, collider.y, collider.y + collider.h);
        if (Math.hypot(x - nx, y - ny) < pad) return false;
        break;
      }
      case 'ellipse': {
        const dx = (x - collider.x) / (collider.rx + pad);
        const dy = (y - collider.y) / (collider.ry + pad);
        if (dx * dx + dy * dy < 1) return false;
        break;
      }
    }
  }
  return true;
}
