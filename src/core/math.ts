export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Distance from `x` to the nearest point of the interval `[lo, hi]`, 0 if inside. */
export const distanceToRange = (x: number, lo: number, hi: number): number =>
  x < lo ? lo - x : x > hi ? x - hi : 0;
