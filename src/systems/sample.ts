/**
 * A recorded sound, fetched the first time it is wanted and faded in and out.
 *
 * Almost everything this game makes a noise with is an oscillator, because
 * almost everything it draws is a few strokes of a pencil. Two things are not:
 * the birds you hear from the hammock, and the cat. Both were synthesised
 * first, and both were a lesson in the same thing — a whistle is easy, and a
 * blackbird answering another blackbird across a garden is not; a low rumble is
 * easy, and a cat is not.
 *
 * Neither is fetched at load. Most sessions never lie in the hammock and plenty
 * never find the cat, and a hundred kilobytes on the critical path for a sound
 * nobody hears is a poor trade.
 */
export class Sample {
  private element: HTMLAudioElement | undefined;

  /** What is wanted right now: the base volume, scaled by `level`. */
  private wanted = false;

  /** A multiplier the caller drives — distance, mostly. */
  level = 1;

  /** What the last attempt did, for the diagnostics readout. */
  private outcome = 'untried';

  constructor(
    private readonly url: string,
    private readonly volume: number,
    /** Seconds to fade over, both ways. */
    private readonly fade = 1.2,
  ) {}

  private ensure(): HTMLAudioElement | undefined {
    if (this.element) return this.element;
    try {
      const audio = new Audio(this.url);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      /*
       * Attached, though nothing displays it.
       *
       * A detached media element is not reliably preloaded — some browsers wait
       * for it to be in a document before fetching anything — and it is invisible
       * to anything inspecting the page, which includes the tests that check
       * these are fetched once and only when they are wanted.
       */
      audio.style.display = 'none';
      audio.dataset.sound = this.url.split('/').pop() ?? '';
      document.body.append(audio);
      audio.addEventListener('canplaythrough', () => {
        this.outcome = 'ready';
      });
      audio.addEventListener('error', () => {
        this.outcome = 'failed';
      });
      this.outcome = 'loading';
      this.element = audio;
      return audio;
    } catch {
      this.outcome = 'unavailable';
      return undefined;
    }
  }

  /**
   * Start it, from wherever it left off.
   *
   * Resuming rather than restarting: stroking the cat twice in a row should not
   * replay the same half-second of purr, which is the tell that it is a
   * recording rather than a cat.
   */
  play(): void {
    this.wanted = true;
    const audio = this.ensure();
    if (!audio) return;
    void audio.play().then(
      () => {
        if (this.outcome !== 'failed') this.outcome = 'playing';
      },
      () => {
        // Refused, almost certainly for want of a gesture. Whatever starts this
        // is a tap or a keypress, so the next try will be inside one.
        this.outcome = 'blocked';
      },
    );
  }

  stop(): void {
    this.wanted = false;
  }

  /**
   * Follow the fade, once per frame.
   *
   * Faded rather than switched, and paused only once it is silent — a recording
   * that stops dead is a recording, and one that fades is an animal going quiet.
   */
  update(dt: number): void {
    const audio = this.element;
    if (!audio) return;
    const target = this.wanted ? this.volume * Math.max(0, Math.min(1, this.level)) : 0;
    const step = (dt / this.fade) * this.volume;
    const gap = target - audio.volume;
    audio.volume = Math.max(0, Math.min(1, audio.volume + Math.sign(gap) * Math.min(step, Math.abs(gap))));
    if (audio.volume === 0 && !audio.paused && !this.wanted) audio.pause();
  }

  /** One line for the diagnostics overlay. */
  status(): string {
    return `${this.outcome} ${this.element ? this.element.volume.toFixed(2) : '—'}`;
  }
}
