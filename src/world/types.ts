import type { Bounds } from '../core/geom';
import type { Medium } from '../media/medium';

/**
 * Solid geometry the walker and the livestock are pushed out of.
 *
 * A tagged union rather than one struct with optional fields: each variant
 * carries exactly the numbers it needs, and `systems/collision.ts` gets an
 * exhaustive switch the compiler checks.
 */
export type Collider =
  | { readonly kind: 'circle'; readonly x: number; readonly y: number; readonly r: number }
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    }
  | {
      readonly kind: 'ellipse';
      readonly x: number;
      readonly y: number;
      readonly rx: number;
      readonly ry: number;
    };

export const circleCollider = (x: number, y: number, r: number): Collider => ({
  kind: 'circle',
  x,
  y,
  r,
});

export const rectCollider = (x: number, y: number, w: number, h: number): Collider => ({
  kind: 'rect',
  x,
  y,
  w,
  h,
});

export const ellipseCollider = (x: number, y: number, rx: number, ry: number): Collider => ({
  kind: 'ellipse',
  x,
  y,
  rx,
  ry,
});

/**
 * One piece of scenery.
 *
 * A piece knows how to draw itself in either medium and nothing else — it holds
 * no canvas, no world reference and no mutable state. That is what makes it
 * re-runnable, which the occluder trick depends on.
 */
export interface Scenery {
  /** The ground line. Depth sorting and occlusion both key off this. */
  readonly y: number;

  /** Solid parts, if any. Returned rather than registered, so nothing is hidden. */
  readonly colliders?: readonly Collider[];

  /**
   * Full drawn extent. Required for anything `tall`, since the occluder pass
   * needs to know the rectangle to re-draw.
   */
  readonly bounds?: Bounds;

  /** Tall enough that the walker can stand behind it and should be hidden. */
  readonly tall?: boolean;

  draw(ctx: CanvasRenderingContext2D, medium: Medium): void;
}
