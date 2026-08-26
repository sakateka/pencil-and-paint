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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly handlers: InputHandlers,
  ) {
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  dispose(): void {
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // Ctrl+Shift+D and friends belong to the browser. Without this, a devtools
    // shortcut also sets the walker off, which makes for confusing reports.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    this.keys.add(key);
    if (MOVEMENT_KEYS.has(key)) e.preventDefault();
    if (key === 'r') this.handlers.onRestart();
    if (key === 'f') this.handlers.onTogglePerf();
    this.handlers.onEngage();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.pointer = null;
  };

  private onPointerDown = (e: PointerEvent): void => {
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
