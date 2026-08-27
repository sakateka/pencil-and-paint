import { clamp } from '../core/math';
import { WALKER_SPEED } from './player';
import { TREEHOUSE } from '../world/layout';

/** How far either side of the middle of the hut you can get. */
const HALF_ROOM = 26;

/**
 * Half the speed of walking outside, and derived from it rather than written
 * down — a room is somewhere you move about unhurriedly, not somewhere you
 * trudge. It was a third of this to begin with, which meant a noticeable wait
 * before you reached the window and could be seen at all.
 */
const ROOM_SPEED = WALKER_SPEED / 2;

/**
 * Being up in the treehouse.
 *
 * Almost nothing: whether you are in it, and whereabouts along the one room you
 * are standing. The drawing lives with the treehouse itself, in
 * `world/treehouse.ts` — this is only the part the rules need to know.
 */
export class Treehouse {
  inside = false;

  /** Seconds spent up there. */
  clock = 0;

  /**
   * How far along the hut they are, from its middle.
   *
   * The wall is a wall: you cannot see through it, and the only reason to walk
   * about up here is that the window is one particular part of it. So this is
   * the whole of being inside — where along the room you are, and which way you
   * are facing when you cross the glass.
   */
  offset = 0;
  facing: -1 | 1 = 1;

  /** Step phase, for the small bob of walking. */
  walk = 0;

  /** Whether they are moving, so a still figure stands still. */
  moving = false;

  readonly x = TREEHOUSE.x;
  readonly y = TREEHOUSE.y;

  climbIn(): void {
    this.inside = true;
    this.clock = 0;
    // In at the ladder end, which is the left of the hut.
    this.offset = -HALF_ROOM;
    this.facing = 1;
  }

  climbOut(): void {
    this.inside = false;
  }

  update(dt: number): void {
    if (this.inside) this.clock += dt;
  }

  /**
   * Walk about the room.
   *
   * One dimension: a hut seen from here is a slot, and walking into the page
   * would be movement nobody could see. Left and right is the whole of it, and
   * the window is what makes that worth anything.
   */
  move(dt: number, dirX: number): void {
    this.moving = Math.abs(dirX) > 0.08;
    if (!this.moving) return;
    this.offset = clamp(this.offset + dirX * ROOM_SPEED * dt, -HALF_ROOM, HALF_ROOM);
    this.facing = dirX < 0 ? -1 : 1;
    this.walk += Math.abs(dirX) * ROOM_SPEED * dt * 0.09;
  }
}
