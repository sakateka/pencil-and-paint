/**
 * The DOM around the canvas: the counter, the hint line, the title card and the
 * quiet note that appears when the valley is finished.
 *
 * All of it is plain elements over the canvas rather than drawn into it, so the
 * text stays crisp at any resolution and is selectable and readable to a screen
 * reader.
 */

import { list, setLanguage, t, translateDom, type Lang } from './i18n';

function element<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element: #${id}`);
  return el as T;
}



export class Ui {
  private readonly found = element('found');
  private readonly total = element('total');
  private readonly meter = element('meter');
  private readonly hint = element('hint');
  private readonly intro = element('intro');
  private readonly done = element('done');
  private readonly action = element<HTMLButtonElement>('action');
  private readonly actionLabel = element('actionLabel');
  private readonly leave = element<HTMLButtonElement>('leave');
  private readonly creel = element('creel');
  private readonly creelList = element('creelList');
  private readonly reachLine = element('reachLine');
  private readonly doneSub = element('doneSub');
  private readonly picker = element<HTMLSelectElement>('lang');

  private doneTimer: number | undefined;
  private noteTimer: number | undefined;
  private creelTimer: number | undefined;

  /**
   * What the hint says, as a key and its numbers rather than as a sentence.
   *
   * Kept this way so that changing language re-says whatever is on screen. A
   * stored English sentence cannot be translated after the fact.
   */
  private hintKey = 'hint.default';
  private hintParams: Record<string, number> = {};

  /** The last progress figures, for re-saying them in another language. */
  private progress = { found: 0, total: 0, reach: 0 };
  private wonSeconds: number | null = null;
  private landed: { kind: string; count: number }[] = [];

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

    // The picker's options are filled by `translateDom` before any of this
    // exists; all that is left is to listen to it.
    this.picker.addEventListener('change', () => {
      setLanguage(this.picker.value as Lang);
      this.retranslate();
      this.picker.blur();
    });

    // The language was chosen and the card translated before the world was
    // built; this only catches up the parts that did not exist yet.
    this.retranslate();
  }

  /**
   * Say everything again in the current language.
   *
   * Everything on screen is re-derived from what it means rather than patched,
   * which is why the counters and the hint are kept as numbers and keys: a
   * sentence already written cannot be translated.
   */
  retranslate(): void {
    translateDom();
    this.setProgress(this.progress.found, this.progress.total, this.progress.reach);
    if (this.noteTimer === undefined) this.hint.textContent = t(this.hintKey, this.hintParams);
    if (this.wonSeconds !== null) this.sayCompletion(this.wonSeconds);
    if (!this.creel.classList.contains('hidden')) this.sayCreel();
    // The prompt is re-said by the frame loop within a frame, so it needs no
    // help here — but the label it is showing is stale until then.
    this.prompt = null;
  }

  /**
   * The prompt for whatever is within reach, or nothing.
   *
   * Called every frame, hence the guard: setting textContent and rewriting the
   * class list sixty times a second is a style recalculation the browser does
   * not need to do to keep saying the same three words.
   */
  setAction(key: string | null): void {
    if (key === this.prompt) return;
    this.prompt = key;
    if (key === null) {
      this.action.classList.add('hidden');
      return;
    }
    this.actionLabel.textContent = t(key);
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

  /**
   * What the pond gave up, once the camp is down.
   *
   * Sits for a while and then goes, like the note does — nothing here should
   * need dismissing. An empty run says so rather than showing an empty box.
   */
  showCreel(landed: { kind: string; count: number }[]): void {
    this.landed = landed;
    this.sayCreel();
    this.creel.classList.remove('hidden');
    clearTimeout(this.creelTimer);
    this.creelTimer = setTimeout(() => this.creel.classList.add('hidden'), 9000);
  }

  /** The ledger as a sentence: plural forms and list joining, per language. */
  private sayCreel(): void {
    const parts = this.landed.map(({ kind, count }) => t(`creel.${kind}`, { n: count }));
    this.creelList.textContent = parts.length === 0 ? t('creel.empty') : list(parts);
  }

  /** A line that says itself and then gives the hint back. */
  note(key: string, ms = 4600): void {
    clearTimeout(this.noteTimer);
    this.hint.textContent = t(key);
    this.noteTimer = setTimeout(() => {
      this.hint.textContent = t(this.hintKey, this.hintParams);
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
    this.progress = { found, total, reach };
    this.found.textContent = String(found);
    this.total.textContent = String(total);
    this.reachLine.textContent = t('hud.reach', { n: Math.round(reach) });
    this.meter.style.width = `${(found / total) * 100}%`;
  }

  /**
   * Refreshed on every pickup. Updating it only every few pots left a stale
   * count on screen that disagreed with the counter.
   */
  setPotHint(found: number, total: number): void {
    const left = total - found;
    if (left === 0) this.setHint('hint.awake');
    else if (left === 1) this.setHint('hint.lastPot');
    else if (found === 1) this.setHint('hint.further');
    else this.setHint('hint.potsLeft', { n: left });
  }

  /**
   * Behind a passing note, the hint is written down rather than shown — so a
   * pot found while the note is up is not swallowed when the note clears.
   */
  private setHint(key: string, params: Record<string, number> = {}): void {
    this.hintKey = key;
    this.hintParams = params;
    if (this.noteTimer === undefined) this.hint.textContent = t(key, params);
  }

  /**
   * No overlay, no interruption. The colour floods out and you are left to
   * wander it; this is only a note in the corner, for whenever you want it.
   */
  announceCompletion(seconds: number, afterMs = 3400): void {
    this.wonSeconds = seconds;
    this.sayCompletion(seconds);
    clearTimeout(this.doneTimer);
    this.doneTimer = setTimeout(() => this.done.classList.remove('hidden'), afterMs);
  }

  private sayCompletion(seconds: number): void {
    const time = `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
    this.doneSub.textContent = t('done.sub', { time });
  }

  reset(): void {
    clearTimeout(this.doneTimer);
    clearTimeout(this.noteTimer);
    clearTimeout(this.creelTimer);
    this.creel.classList.add('hidden');
    this.noteTimer = undefined;
    this.done.classList.add('hidden');
    this.wonSeconds = null;
    this.landed = [];
    this.setHint('hint.default');
  }
}
