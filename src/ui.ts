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
  private readonly action = element<HTMLButtonElement>('action');
  private readonly actionLabel = element('actionLabel');
  private readonly leave = element<HTMLButtonElement>('leave');

  private doneTimer: number | undefined;
  private noteTimer: number | undefined;

  /** What the hint said before a passing note took it over. */
  private hintText = HINT_DEFAULT;

  /** Last prompt shown, so the per-frame call touches the DOM only on change. */
  private prompt: string | null = null;
  private leaving = false;

  constructor(handlers: {
    onStart(): void;
    onRestart(): void;
    onAction(): void;
    onLeave(): void;
  }) {
    element('startBtn').addEventListener('click', handlers.onStart);
    element('againBtn').addEventListener('click', handlers.onRestart);
    this.action.addEventListener('click', () => {
      handlers.onAction();
      // Otherwise the button keeps focus and the next space bar presses it again.
      this.action.blur();
    });
    this.leave.addEventListener('click', () => {
      handlers.onLeave();
      this.leave.blur();
    });
  }

  /**
   * The prompt for whatever is within reach, or nothing.
   *
   * Called every frame, hence the guard: setting textContent and rewriting the
   * class list sixty times a second is a style recalculation the browser does
   * not need to do to keep saying the same three words.
   */
  setAction(label: string | null): void {
    if (label === this.prompt) return;
    this.prompt = label;
    if (label === null) {
      this.action.classList.add('hidden');
      return;
    }
    this.actionLabel.textContent = label;
    this.action.classList.remove('hidden');
  }

  /**
   * The way out of whatever you are in the middle of.
   *
   * On a keyboard this is only a reminder that Q exists. On a phone there is no
   * Q, and since you cannot walk while fishing, this button is the only way off
   * the riverbank — so it is not decoration there, it is the exit.
   */
  setLeave(showing: boolean): void {
    if (showing === this.leaving) return;
    this.leaving = showing;
    this.leave.classList.toggle('hidden', !showing);
  }

  /** A line that says itself and then gives the hint back. */
  note(text: string, ms = 4600): void {
    if (this.noteTimer === undefined) this.hintText = this.hint.textContent ?? HINT_DEFAULT;
    clearTimeout(this.noteTimer);
    this.hint.textContent = text;
    this.noteTimer = setTimeout(() => {
      this.hint.textContent = this.hintText;
      this.noteTimer = undefined;
    }, ms);
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
    if (left === 0) this.setHint('the whole page is awake');
    else if (left === 1) this.setHint('one last pot still in graphite');
    else if (found === 1) this.setHint('the colour reaches a little further now');
    else this.setHint(`${left} pots still in graphite`);
  }

  /**
   * Behind a passing note, the hint is written down rather than shown — so a
   * pot found while the note is up is not swallowed when the note clears.
   */
  private setHint(text: string): void {
    this.hintText = text;
    if (this.noteTimer === undefined) this.hint.textContent = text;
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
    clearTimeout(this.noteTimer);
    this.noteTimer = undefined;
    this.done.classList.add('hidden');
    this.hintText = HINT_DEFAULT;
    this.hint.textContent = HINT_DEFAULT;
  }
}
