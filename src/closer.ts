import { context2d } from './core/canvas';
import { t } from './i18n';
import { CLOSE_SPAN, type Lookable } from './world/lookables';

/**
 * Leaning in on something.
 *
 * A panel over the page rather than a camera push, for one reason: the world is
 * a bitmap baked at one to one, so pushing in would show it soft. Drawing the
 * thing again, close, on its own canvas shows it sharp — and lets it show what
 * the world view never could.
 *
 * The same shape as the drawing board: while it is open the walker has no keys,
 * because they are somebody looking at something rather than somebody walking.
 */
export class Closer {
  open = false;

  private readonly root = document.getElementById('closer') as HTMLElement;
  private readonly canvas = document.getElementById('closerArt') as HTMLCanvasElement;
  private readonly title = document.getElementById('closerTitle') as HTMLElement;
  private readonly line = document.getElementById('closerLine') as HTMLElement;
  private readonly ctx: CanvasRenderingContext2D;

  /** Held so the words can be redone when the language changes under it. */
  private showing: Lookable | null = null;

  constructor(private readonly onClose: () => void) {
    this.ctx = context2d(this.canvas);
    (document.getElementById('closerDone') as HTMLElement).addEventListener('click', () =>
      this.close(),
    );
    /*
     * Q gets you out, and the button says so.
     *
     * Its own listener rather than the walker's: while this is open their keys
     * are suspended — they are somebody looking at something, not somebody
     * walking — and `input` stops reading before it ever gets to Q. Escape is
     * here too because a panel over the page is a thing people press Escape at,
     * whatever it says on the button.
     *
     * `e.code` rather than `e.key`, matching `physicalKey` in systems/input.ts:
     * it is the same key wherever the layout thinks it is, so this works for
     * somebody typing in Cyrillic.
     */
    document.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code !== 'KeyQ' && e.code !== 'Escape') return;
      e.preventDefault();
      this.close();
    });
  }

  show(subject: Lookable): void {
    this.showing = subject;
    this.open = true;
    this.words();
    this.paint();
    this.root.classList.remove('hidden');
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.showing = null;
    this.root.classList.add('hidden');
    this.onClose();
  }

  /** Redo the words in the language now selected, without closing. */
  retranslate(): void {
    if (this.showing) this.words();
  }

  private words(): void {
    const subject = this.showing;
    if (!subject) return;
    this.title.textContent = t(`closer.${subject.id}.title`);
    this.line.textContent = t(`closer.${subject.id}.line`);
  }

  /**
   * Draw the subject into the middle of its square, at whatever size fits.
   *
   * The backing store is fixed and the element is sized by CSS, so this does
   * not care what the window is doing — the drawing is composed inside a square
   * of `CLOSE_SPAN` units and scaled to it.
   */
  private paint(): void {
    const subject = this.showing;
    if (!subject) return;
    const { ctx } = this;
    const size = this.canvas.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    const fit = (size / CLOSE_SPAN) * 0.92;
    ctx.scale(fit, fit);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    subject.draw(ctx);
    ctx.restore();
  }
}
