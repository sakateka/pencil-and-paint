/**
 * The whole game is one idea: draw the same world twice, in two media, and
 * decide per-pixel which one you are looking at.
 *
 * Nearly every draw function in `world/` and `entities/` takes a `Medium` and
 * renders itself accordingly — the same geometry, once as flat colour and once
 * as pencil. Keeping it a union rather than a string means a mistyped medium is
 * a compile error instead of a shape that silently fails to appear.
 */
export type Medium = 'color' | 'sketch';

/** Graphite. Everything drawn in the sketch medium is some alpha of this. */
export const PENCIL = '#2e2b26';

/** The page the whole world sits on. */
export const PAPER = '#f2ecdd';
