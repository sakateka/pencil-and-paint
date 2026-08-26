/** Replaced at build time by Vite. See `vite.config.ts`. */
declare const __BUILD_ID__: string;

/**
 * Which build this is, shown on the title card.
 *
 * Not vanity: asset filenames are content-hashed, but the index.html pointing
 * at them can be cached, and a phone quietly running last week's code is
 * indistinguishable from a fix that did not work.
 */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
