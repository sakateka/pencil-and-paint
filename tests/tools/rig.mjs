import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** The repository root, wherever this is run from. */
export const ROOT = resolve(import.meta.dirname, '..', '..');

/** `--name=value` from the command line, or undefined. */
export function flag(name) {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return found?.slice(name.length + 3);
}

/**
 * Which build to look at.
 *
 * `--dist=…` if given, otherwise `tmp/dist` — where BUILDING.md says to build.
 * Never `dist/`, which belongs to whoever publishes the game.
 */
export function buildDir(which = 'dist') {
  const asked = flag(which);
  const dir = asked ? resolve(asked) : join(ROOT, 'tmp', 'dist');
  if (!existsSync(join(dir, 'index.html'))) {
    console.error(
      `no build at ${dir}\n` + `make one with: npx vite build --outDir tmp/dist --emptyOutDir`,
    );
    process.exit(1);
  }
  return dir;
}
