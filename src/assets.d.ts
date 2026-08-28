/**
 * Assets imported for their URL.
 *
 * Vite turns one of these into a hashed filename in `assets/`, which is both
 * cache-safe and correct under the repository subpath GitHub Pages serves from.
 * `tsconfig` sets `types: []`, so Vite's own declarations are not in scope and
 * this says the one thing needed.
 */
declare module '*.mp3' {
  const url: string;
  export default url;
}

declare module '*.webp' {
  const url: string;
  export default url;
}
