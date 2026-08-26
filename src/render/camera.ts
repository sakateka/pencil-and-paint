import { clamp, lerp } from '../core/math';

/**
 * Follows the walker, stays inside the map, and never lets the viewport show
 * past the edge of the page.
 */
export class Camera {
  /** Centre, in world coordinates. */
  x: number;
  y: number;

  /** Top-left of the visible region, in world coordinates. */
  viewX = 0;
  viewY = 0;
  viewWidth = 0;
  viewHeight = 0;

  /**
   * Only ever 1 or more, and only above 1 on a viewport larger than the map —
   * at which point the world is scaled up rather than showing blank paper.
   */
  zoom = 1;

  constructor(
    x: number,
    y: number,
    private readonly worldWidth: number,
    private readonly worldHeight: number,
  ) {
    this.x = x;
    this.y = y;
  }

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  follow(targetX: number, targetY: number, dt: number): void {
    // Slightly above the feet, so there is more world visible ahead than behind.
    this.x = lerp(this.x, targetX, Math.min(1, 5 * dt));
    this.y = lerp(this.y, targetY - 14, Math.min(1, 5 * dt));
  }

  /** Recompute the visible region for a viewport of this size, in CSS pixels. */
  frame(viewportWidth: number, viewportHeight: number): void {
    this.zoom = Math.max(1, viewportWidth / this.worldWidth, viewportHeight / this.worldHeight);
    this.viewWidth = viewportWidth / this.zoom;
    this.viewHeight = viewportHeight / this.zoom;
    const cx = clamp(this.x, this.viewWidth / 2, this.worldWidth - this.viewWidth / 2);
    const cy = clamp(this.y, this.viewHeight / 2, this.worldHeight - this.viewHeight / 2);
    this.viewX = cx - this.viewWidth / 2;
    this.viewY = cy - this.viewHeight / 2;
  }

  toScreenX(worldX: number): number {
    return (worldX - this.viewX) * this.zoom;
  }

  toScreenY(worldY: number): number {
    return (worldY - this.viewY) * this.zoom;
  }

  /** Is this point within the visible region, plus a margin? */
  canSee(worldX: number, worldY: number, margin: number): boolean {
    return (
      worldX > this.viewX - margin &&
      worldX < this.viewX + this.viewWidth + margin &&
      worldY > this.viewY - margin &&
      worldY < this.viewY + this.viewHeight + margin
    );
  }

  /** Apply the world-to-screen transform to a context. */
  applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.translate(-this.viewX * this.zoom, -this.viewY * this.zoom);
    ctx.scale(this.zoom, this.zoom);
  }
}
