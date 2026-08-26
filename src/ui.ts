/**
 * The DOM around the canvas: the counter, the hint line, the title card and the
 * quiet note that appears when the valley is finished.
 *
 * All of it is plain elements over the canvas rather than drawn into it, so the
 * text stays crisp at any resolution and is selectable and readable to a screen
 * reader.
 */

function element<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element: #${id}`);
  return el as T;
}

const HINT_DEFAULT = 'the world is only coloured where you stand — go and find the rest';

export class Ui {
  private readonly found = element('found');
  private readonly total = element('total');
  private readonly reach = element('reach');
  private readonly meter = element('meter');
  private readonly hint = element('hint');
  private readonly intro = element('intro');
  private readonly done = element('done');
  private readonly time = element('wintime');

  private doneTimer: number | undefined;

  constructor(handlers: { onStart(): void; onRestart(): void }) {
    element('startBtn').addEventListener('click', handlers.onStart);
    element('againBtn').addEventListener('click', handlers.onRestart);
  }

  /** True the first time, so the caller knows play has actually begun. */
  dismissIntro(): boolean {
    if (this.intro.classList.contains('hidden')) return false;
    this.intro.classList.add('hidden');
    return true;
  }

  setProgress(found: number, total: number, reach: number): void {
    this.found.textContent = String(found);
    this.total.textContent = String(total);
    this.reach.textContent = String(Math.round(reach));
    this.meter.style.width = `${(found / total) * 100}%`;
  }

  /**
   * Refreshed on every pickup. Updating it only every few pots left a stale
   * count on screen that disagreed with the counter.
   */
  setPotHint(found: number, total: number): void {
    const left = total - found;
    if (left === 0) this.hint.textContent = 'the whole page is awake';
    else if (left === 1) this.hint.textContent = 'one last pot still in graphite';
    else if (found === 1) this.hint.textContent = 'the colour reaches a little further now';
    else this.hint.textContent = `${left} pots still in graphite`;
  }

  /**
   * No overlay, no interruption. The colour floods out and you are left to
   * wander it; this is only a note in the corner, for whenever you want it.
   */
  announceCompletion(seconds: number, afterMs = 3400): void {
    this.time.textContent = `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
    clearTimeout(this.doneTimer);
    this.doneTimer = setTimeout(() => this.done.classList.remove('hidden'), afterMs);
  }

  reset(): void {
    clearTimeout(this.doneTimer);
    this.done.classList.add('hidden');
    this.hint.textContent = HINT_DEFAULT;
  }
}
