/**
 * Keyboard and pointer, normalised to a single direction vector.
 *
 * Movement is read as state rather than delivered as events, so the update loop
 * can sample it at whatever rate it likes. One-shot actions are callbacks.
 */

export interface InputHandlers {
  /** Any input at all — used to dismiss the title card. */
  onEngage(): void;
  onRestart(): void;
  onTogglePerf(): void;
  /** Reach out and do whatever is within arm's length. */
  onInteract(): void;
  /** Put down whatever is currently being done. */
  onCancel(): void;
}

/**
 * Which key this is, regardless of what is printed on it.
 *
 * `e.key` is the character the current layout produces. On a Cyrillic keyboard
 * the key where E sits reports `у`, so `key === 'e'` is false and the game
 * simply ignores it — and the same goes for W, A, S and D, which is most of
 * how you move. `e.code` is the physical key, which is what a game wants: the
 * one under your finger, wherever the layout thinks it is.
 *
 * Falls back to `e.key` for anything without a code, and for layouts where the
 * code is unhelpful.
 */
function physicalKey(e: KeyboardEvent): string {
  const code = e.code ?? '';
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Arrow')) return code.toLowerCase();
  if (code === 'Space') return ' ';
  return e.key.toLowerCase();
}

const MOVEMENT_KEYS = new Set([
  'w',
  'a',
  's',
  'd',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  ' ',
]);

export class Input {
  private readonly keys = new Set<string>();
  private pointer: { x: number; y: number } | null = null;

  /**
   * Ignore everything, without tearing the listeners down.
   *
   * Set while the drawing board is open: the same keys mean different things
   * there, and a walker who quietly strolls off while somebody is drawing is
   * somewhere else entirely when they look up.
   */
  suspended = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private readonly handlers: InputHandlers,
  ) {
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('blur', this.onBlur);
    this.listen(canvas);
  }

  private listen(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  private unlisten(canvas: HTMLCanvasElement): void {
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
  }

  /**
   * Follow the game onto a different canvas.
   *
   * The renderer may replace the canvas mid-session — see `systems/rescue.ts`.
   * A finger already down is let go of first: the pointer was captured by an
   * element that is about to leave the document, and nothing will ever tell us
   * it came up.
   */
  retarget(canvas: HTMLCanvasElement): void {
    this.unlisten(this.canvas);
    this.pointer = null;
    this.canvas = canvas;
    this.listen(canvas);
  }

  dispose(): void {
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('blur', this.onBlur);
    this.unlisten(this.canvas);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // Ctrl+Shift+D and friends belong to the browser. Without this, a devtools
    // shortcut also sets the walker off, which makes for confusing reports.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.suspended) return;
    const key = physicalKey(e);
    this.keys.add(key);
    if (MOVEMENT_KEYS.has(key)) e.preventDefault();
    if (key === 'r') this.handlers.onRestart();
    if (key === 'f') this.handlers.onTogglePerf();
    // Held keys repeat, and a repeat is not a second stroke of the cat.
    if (key === 'e' && !e.repeat) this.handlers.onInteract();
    if (key === 'q' && !e.repeat) this.handlers.onCancel();
    this.handlers.onEngage();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    // Must match `onKeyDown` exactly, or a key goes down and never comes up
    // and the walker keeps going by itself.
    this.keys.delete(physicalKey(e));
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.pointer = null;
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.suspended) return;
    this.pointer = { x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture(e.pointerId);
    this.handlers.onEngage();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.pointer) this.pointer = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (): void => {
    this.pointer = null;
  };

  /**
   * Which way to walk, as a unit-ish vector.
   *
   * Takes the walker's position on screen so that dragging steers towards the
   * finger rather than in an absolute direction.
   */
  direction(walkerScreenX: number, walkerScreenY: number): { x: number; y: number } {
    if (this.suspended) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;

    if (this.pointer) {
      const dx = this.pointer.x - walkerScreenX;
      const dy = this.pointer.y - walkerScreenY - 18;
      const d = Math.hypot(dx, dy);
      if (d > 22) {
        x += dx / d;
        y += dy / d;
      }
    }

    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }
}
