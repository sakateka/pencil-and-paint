import type { Game } from './game';
import type { WALK_CYCLE } from './entities/player';
import type { Renderer } from './render/renderer';
import type { Input } from './systems/input';
import type { Performance } from './systems/perf';
import type { CuckooAmbience } from './systems/cuckoo';

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
  /** Audio clock, exposed so tests can advance fades without wall time. */
  cuckoo: CuckooAmbience;
  /** Current live ink tick, exposed so render tests can await a real change. */
  boilTick(): number;
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
   * The build this page is running, as shown on the title card.
   *
   * The first question about any report from a deployed page is whether it is
   * even the code you think it is. Answering that by hunting for a function
   * that only exists in newer builds is not a method.
   */
  build: string;
  /**
   * Throw this canvas away and draw on a new one, and say what happened.
   *
   * The same thing `systems/rescue.ts` does on its own when the frames go soft.
   * By hand it is the only way to see the effect deliberately — and the only
   * honest A/B of whether a session's stutter was the browser's fallback: if a
   * rebuild fixes it, it was.
   */
  rescue(): string;
  /**
   * Everything worth knowing about the current frame, flat enough to read.
   *
   * Deliberately one object of plain values: a browser console collapses
   * anything nested and truncates anything long, and the number you wanted is
   * always the one behind the ellipsis.
   */
  snapshot(): Record<string, string | number | boolean>;
  /**
   * Watch `frames` real frames go by, and report what they cost.
   *
   * Real ones, through the page's own animation loop, because calling
   * `render` in a tight loop measures nothing useful: canvas work is recorded
   * now and rasterised later, so a hundred back-to-back renders queue a hundred
   * frames of commands and return almost instantly. An early version of this
   * reported 0.1ms a frame on a page whose own average was 0.56ms.
   *
   * Timed across the batch rather than per frame — Firefox rounds
   * `performance.now()` to whole milliseconds, and a sub-millisecond frame
   * measured individually is noise wearing a decimal point.
   */
  probe(frames?: number): Promise<Record<string, number>>;
  /**
   * Everything worth knowing, in one string, ready to paste.
   *
   * The single call to make when something is wrong and you do not yet know
   * what. It gathers the build, the machine, the frame budget split three ways,
   * an honest batch-timed probe, which render path is running, the state of the
   * game, every stage, the canvas the world is holding, and the bake — and
   * hands back formatted JSON rather than an object, because a console collapses
   * objects, truncates long ones, and hides the number you needed behind an
   * ellipsis. This has happened enough times to be worth designing against.
   *
   * It includes a `verdict` line naming which part of the frame is at fault,
   * because the readings alone have been misread more than once.
   *
   * Takes about a second and a half of real time, because it watches that many
   * frames go by rather than driving any itself. Nothing here touches the
   * world, so asking has no effect on the game.
   */
  report(frames?: number): Promise<string>;
  /**
   * The hills, as the one polyline everything about them is read off.
   *
   * The silhouette drawn over the sky, the polygon the meadow is filled inside
   * and the floor the walker is held to are all this array. Exposed because
   * "the line you can see is the ground you walk on" is a claim about two
   * things agreeing, and a screenshot can only ever show one of them.
   */
  hillSurface(): readonly (readonly [number, number])[];
  /** Where the northern floor sits at this x — read off `hillSurface`. */
  northernSurfaceY(x: number): number;
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
   * Wait for each render stage's canvas work before timing the next, and say
   * whether it is now on.
   *
   * Canvas calls are queued, so by default a stage is timed around asking for
   * work rather than around doing it, and the cost lands on whichever later
   * call forces a flush. Switch this on for a capture when the question is
   * *which* stage is expensive; leave it off otherwise, because forcing a
   * readback every stage is itself the kind of stall being looked for.
   */
  settleStages(on: boolean): boolean;
  /**
   * Time the same colour-world blit into a fresh offscreen canvas and into the
   * displayed one, and return both numbers plus the session's drawMs and a
   * per-blit-flushed variant for the displayed canvas.
   *
   * The four numbers together separate the two ways `intoDisplayed` can be
   * slow. If the per-blit-flushed figure is dozens of times the batched one,
   * the cost is one synchronisation wait landing on whichever call forces the
   * flush — the cross-process checkpoint of bug7 — rather than per-blit work;
   * compare with `drawMs` to know whether the session had stepped at all.
   * Freezes the page for up to a second on a slow session — that is the
   * measurement. Pass true to blit the full viewport instead of the last
   * dirty rectangle.
   */
  roundtrip(full?: boolean): {
    region: string;
    drawMs: number;
    intoScratch: number;
    intoDisplayed: number;
    displayedFlushEach: number;
  };
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
