import { clamp } from '../core/math';
import { SKY_DEPTH } from '../world/sky';

/** Half the viewport occupied by the camera's quiet area on either axis. */
const DEAD_ZONE_FRACTION = 0.09;
/** Used for the first simulation step, before the first frame has a size. */
const DEFAULT_DEAD_ZONE = 80;
const CAMERA_MAX_SPEED = 560;
const CAMERA_ACCELERATION = 1350;
const CAMERA_DECELERATION = 2100;

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

  /** Momentum in world units per second. The camera owns this, not the walker. */
  private velocityX = 0;
  private velocityY = 0;

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
    this.velocityX = 0;
    this.velocityY = 0;
    this.subX = 0;
    this.subY = 0;
  }

  follow(targetX: number, targetY: number, dt: number): void {
    this.track(targetX, targetY, dt, true);
  }

  /** Smoothly pan to a scripted point of interest, without a walker dead zone. */
  focus(targetX: number, targetY: number, dt: number): void {
    this.track(targetX, targetY, dt, false);
  }

  private track(targetX: number, targetY: number, dt: number, useDeadZone: boolean): void {
    if (!Number.isFinite(dt) || dt <= 0) return;

    /*
     * The camera answers the walker, rather than being attached to them.
     * Inside this quiet area the target is deliberately not recentered: a
     * couple of steps, a turn, or a shuffle at a pot leaves the picture alone.
     * Once the target leaves it, the goal is the near edge of the area. This
     * lets the camera catch up without taking the walker all the way back to
     * the middle, and means stopping at the edge does not cause a second pan.
     *
     * `targetY - 14` keeps the existing framing: the walker is a little below
     * the camera centre, with no extra lead in the direction of travel.
     */
    const deadZoneX = useDeadZone ? this.deadZone(this.viewWidth) : 0;
    const deadZoneY = useDeadZone ? this.deadZone(this.viewHeight) : 0;
    [this.x, this.velocityX] = this.advanceAxis(
      this.x,
      this.velocityX,
      targetX,
      deadZoneX,
      dt,
    );
    [this.y, this.velocityY] = this.advanceAxis(
      this.y,
      this.velocityY,
      targetY - 14,
      deadZoneY,
      dt,
    );
  }

  /** Return a viewport-relative half-size, or a useful size before first draw. */
  private deadZone(viewportSize: number): number {
    return viewportSize > 0 ? viewportSize * DEAD_ZONE_FRACTION : DEFAULT_DEAD_ZONE;
  }

  /** Move a scalar toward a value without stepping past it. */
  private approach(value: number, target: number, distance: number): number {
    if (Math.abs(target - value) <= distance) return target;
    return value + Math.sign(target - value) * distance;
  }

  /**
   * Advance one camera axis using acceleration and a braking-distance target.
   *
   * A positional spring is tempting here, but it starts fastest at the exact
   * moment the walker moves and can ring when the walker changes direction.
   * Instead, the speed allowed by the remaining distance is the speed from
   * which the camera can brake to zero. The result starts at zero, gathers
   * speed, and always arrives at a fixed goal without overshooting it.
   */
  private advanceAxis(
    position: number,
    velocity: number,
    target: number,
    deadZone: number,
    dt: number,
  ): [number, number] {
    const offset = target - position;
    const goal = Math.abs(offset) > deadZone ? target - Math.sign(offset) * deadZone : position;
    const error = goal - position;
    const distance = Math.abs(error);
    const speedAtGoal = Math.min(CAMERA_MAX_SPEED, Math.sqrt(2 * CAMERA_DECELERATION * distance));
    const desiredVelocity = Math.sign(error) * speedAtGoal;
    const slowing =
      desiredVelocity === 0 ||
      (Math.sign(velocity) === Math.sign(desiredVelocity) &&
        Math.abs(desiredVelocity) < Math.abs(velocity));
    const rate = slowing ? CAMERA_DECELERATION : CAMERA_ACCELERATION;
    const nextVelocity = this.approach(velocity, desiredVelocity, rate * dt);
    const nextPosition = position + nextVelocity * dt;

    // This also absorbs tiny floating-point leftovers at the resting point.
    if (error !== 0 && Math.sign(error) !== Math.sign(goal - nextPosition)) {
      return [goal, 0];
    }
    if (error === 0 && nextVelocity === 0) return [position, 0];
    return [nextPosition, nextVelocity];
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
