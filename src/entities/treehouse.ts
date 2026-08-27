import { TREEHOUSE } from '../world/layout';

/**
 * Being up in the treehouse.
 *
 * Almost nothing: whether you are in it, and how far the near wall has faded to
 * let you be seen. The drawing lives with the treehouse itself, in
 * `world/treehouse.ts` — this is only the part the rules need to know.
 */
export class Treehouse {
  inside = false;

  /** Seconds spent up there. */
  clock = 0;

  /** How far the wall has gone soft, 0 to 1, eased both ways. */
  shown = 0;

  readonly x = TREEHOUSE.x;
  readonly y = TREEHOUSE.y;

  climbIn(): void {
    this.inside = true;
    this.clock = 0;
  }

  climbOut(): void {
    this.inside = false;
  }

  update(dt: number): void {
    const wanted = this.inside ? 1 : 0;
    this.shown += (wanted - this.shown) * Math.min(1, dt * 4.2);
    if (this.inside) this.clock += dt;
  }

  /** Whether there is anything to draw, including the last of the fade. */
  get visible(): boolean {
    return this.inside || this.shown > 0.01;
  }
}
