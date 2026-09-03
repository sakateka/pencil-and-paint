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

  /**
   * The fraction of a pixel the snap below threw away, in CSS pixels.
   *
   * Snapping the origin keeps the world blit on the one-to-one fast path, and
   * that is worth keeping — measured on Firefox, a fractional source rectangle
   * costs 5.2x a whole-pixel one. But snapping also quantises the *scroll*: a
   * camera tracking a walker at 3.5px a frame moves 4,3,4,3, and that half-pixel
   * oscillation at thirty hertz reads as the whole view shivering while you
   * walk. It does so at a flawless sixty frames a second, which is why no
   * profile ever showed it — nothing about it is slow, and the thing that is
   * uneven is distance, not time.
   *
   * So the remainder is not discarded. The renderer hands it to the compositor
   * as a transform on the canvas element, which slides a whole layer by a
   * fraction of a pixel in hardware for nothing. Whole pixels for the blit,
   * fractions for the eye.
   */
  subX = 0;
  subY = 0;

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
   * blit is far too big to pay that for a fraction of a pixel of camera
   * smoothness. What the snap discards is kept in `subX`/`subY` and put back by
   * the compositor, so the smoothness costs nothing either.
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
    const cy = clamp(
      this.y,
      this.viewHeight / 2 - SKY_DEPTH,
      this.worldHeight - this.viewHeight / 2,
    );
    const quantum = 1 / (this.zoom * pixelScale);
    const rawX = cx - this.viewWidth / 2;
    const rawY = cy - this.viewHeight / 2;
    this.viewX = Math.round(rawX / quantum) * quantum;
    this.viewY = Math.round(rawY / quantum) * quantum;
    this.subX = (rawX - this.viewX) * this.zoom;
    this.subY = (rawY - this.viewY) * this.zoom;
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
