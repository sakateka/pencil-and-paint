import type { Game } from './game';
import type { Renderer } from './render/renderer';
import type { Performance } from './systems/perf';

/**
 * A handle for the test suite to drive the game headlessly.
 *
 * The tests are the reason this exists: asserting that a sheep 900px away does
 * not move, or that the walker cannot end up inside a building, needs to reach
 * the simulation rather than squint at pixels. Everything here is read-mostly
 * and the game does not consult it.
 */
export interface DebugHandle {
  game: Game;
  renderer: Renderer;
  perf: Performance;
  /** Force a frame outside the rAF loop, for deterministic measurement. */
  renderOnce(): void;
}

declare global {
  // eslint-disable-next-line no-var
  var pencil: DebugHandle | undefined;
}

export function exposeForTests(handle: DebugHandle): void {
  globalThis.pencil = handle;
}
