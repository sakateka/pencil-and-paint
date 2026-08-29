import { clamp, lerp } from '../core/math';
import { SKY_DEPTH } from '../world/sky';

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

  /**
   * Recompute the visible region for a viewport of this size, in CSS pixels.
   *
   * The origin is snapped to whole device pixels. A fractional source rectangle
   * makes `drawImage` resample even when the scale is one to one, and the world
   * blit is far too big to pay that for a fraction of a pixel of camera smoothness.
   */
  frame(viewportWidth: number, viewportHeight: number, pixelScale = 1): void {
    this.zoom = Math.max(1, viewportWidth / this.worldWidth, viewportHeight / this.worldHeight);
    this.viewWidth = viewportWidth / this.zoom;
    this.viewHeight = viewportHeight / this.zoom;
    const cx = clamp(this.x, this.viewWidth / 2, this.worldWidth - this.viewWidth / 2);
    /*
     * The top is the one edge the camera may pass.
     *
     * Everywhere else it stops dead at the paper, because there is nothing out
     * there to show. Above the top there is: walk up to the head of the valley
     * and the view keeps rising, and what comes over the edge is sky. It opens
     * gradually rather than all at once — the allowance is a limit, not a jump,
     * so the sky appears as a band a few hundred units before you reach the end
     * and is fully open only when you are against it.
     */
    /*
     * At the head of the valley, look into the new strip of sky rather than
     * leaving it unreachable above the viewport. This changes framing only;
     * walker coordinates, velocity and collision speed remain untouched.
     */
    // Spread the change over a long walk. Compressing the same 180-unit reveal
    // into the last few hundred units made the camera visibly overtake the
    // walker just before the horizon; over 1800 units the extra motion is at
    // most about fifteen percent and reads as ordinary camera easing.
    const north = clamp(1 - this.y / 1800, 0, 1);
    const skyLookAhead = 180 * north * north * (3 - 2 * north);
    const cy = clamp(
      this.y - skyLookAhead,
      this.viewHeight / 2 - SKY_DEPTH,
      this.worldHeight - this.viewHeight / 2,
    );
    const quantum = 1 / (this.zoom * pixelScale);
    this.viewX = Math.round((cx - this.viewWidth / 2) / quantum) * quantum;
    this.viewY = Math.round((cy - this.viewHeight / 2) / quantum) * quantum;
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
