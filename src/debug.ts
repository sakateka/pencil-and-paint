import type { Game } from './game';
import type { WALK_CYCLE } from './entities/player';
import type { Renderer } from './render/renderer';
import type { Input } from './systems/input';
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
  /** Walk-cycle tuning, asserted by the gait tests. */
  walkCycle: typeof WALK_CYCLE;
  renderer: Renderer;
  perf: Performance;
  /**
   * The real input, not a stub.
   *
   * Some things can only be shown with it: that the drawing board suspends the
   * walker's keys, for instance, is invisible to a test that hands `advance` a
   * direction of its own.
   */
  input: Input;
  /** Force a frame outside the rAF loop, for deterministic measurement. */
  renderOnce(): void;
  /**
   * Where the world generator's rng finished.
   *
   * Every draw during the bake draws jitter from it, so this is a fingerprint
   * of the whole sequence: if the same calls happened in the same order, it
   * matches. Unlike sampling pixels it is not disturbed by the paper grain,
   * which is seeded from Math.random and differs every load.
   */
  rngEndState(): number;
  /** Longest unyielded stretch of the world bake, in milliseconds. */
  longestBakeSliceMs(): number;
  /** Whether the performance readout is showing. */
  isPerfOn(): boolean;
  /**
   * The shape of a purr, `age` seconds in.
   *
   * Exposed because the phrasing — three swells with quiet between them, each
   * rising and falling without a corner — is the whole point of it, and it is
   * far easier to assert on the curve than on a cat.
   */
  purrStrength(age: number): number;
  /**
   * How many purrs have been played this session.
   *
   * A sound that plays when it should not is invisible to every other kind of
   * assertion, and this game has more than one thing you can press the same
   * key for.
   */
  purrsPlayed(): number;
  /**
   * The dictionary, for the translation tests.
   *
   * A missing key is invisible in play — it falls back to English and reads as
   * a slightly odd translation rather than as a fault — so the only way to know
   * every language is complete is to ask.
   */
  i18n: {
    keys(): string[];
    languages(): string[];
    missing(lang: string): string[];
    setLanguage(lang: string): void;
    say(key: string, params?: Record<string, string | number>): string;
    list(parts: string[]): string;
  };
}

declare global {
  // eslint-disable-next-line no-var
  var pencil: DebugHandle | undefined;
}

export function exposeForTests(handle: DebugHandle): void {
  globalThis.pencil = handle;
}
