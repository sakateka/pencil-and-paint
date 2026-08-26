/**
 * A seedable linear congruential generator.
 *
 * The world is laid out and drawn with this rather than `Math.random`, for one
 * reason that matters a great deal: the seed can be rewound. Every scenery
 * object records the seed it was drawn with, so re-running its draw call
 * reproduces the same pencil strokes down to the pixel. That is what lets an
 * occluder be re-drawn over the walker without ghosting against the baked copy
 * underneath (see `world/occluders.ts`).
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Current position in the sequence. Save it to reproduce what comes next. */
  get seed(): number {
    return this.state;
  }

  set seed(value: number) {
    this.state = value >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  /** Integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return Math.floor(this.range(lo, hi + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Run `fn` at a fixed seed, then restore the sequence. */
  replay<T>(seed: number, fn: () => T): T {
    const previous = this.state;
    this.state = seed >>> 0;
    try {
      return fn();
    } finally {
      this.state = previous;
    }
  }

  /** A seed for something else to replay later. */
  forkSeed(): number {
    return (this.next() * 4294967296) >>> 0;
  }
}

/**
 * The world generator's shared source of randomness. Fixed seed, so the terrain,
 * buildings and herds are identical on every visit; only the paint pots move
 * (they are placed with `Math.random`, see `world/pots.ts`).
 */
export const rng = new Rng(20260826);

// Terse aliases — these appear hundreds of times across the drawing code.
export const rnd = (): number => rng.next();
export const rr = (lo: number, hi: number): number => rng.range(lo, hi);
export const pick = <T>(items: readonly T[]): T => rng.pick(items);
