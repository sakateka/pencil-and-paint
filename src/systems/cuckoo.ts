const CROSSFADE_START = 13;
const CROSSFADE_END = 18;

interface StreamPosition {
  /** Where the local opening begins in the full remote recording. */
  startAt: number;
  /** The remote recording's level relative to the complete local mix. */
  level: number;
}

/**
 * A short local lead-in followed by the full forest recording from Freesound.
 *
 * The lead-in makes the first cuckoo dependable even on a slow connection. It
 * contains an excerpt of the same remote recording, so that recording can run
 * silently beside it from the matching timestamp. The crossfade removes the
 * local bed while preserving the excerpt at a constant level.
 */
export class CuckooAmbience {
  private intro: HTMLAudioElement | undefined;
  private forest: HTMLAudioElement | undefined;
  private wanted = false;
  private synced = false;
  private outcome = 'untried';

  constructor(
    private readonly introUrl: string,
    private readonly forestUrl: string,
    private readonly volume: number,
    private readonly fade = 2.6,
    private readonly stream: StreamPosition = { startAt: 0, level: 1 },
  ) {}

  private element(url: string, name: string, loop: boolean, level: number): HTMLAudioElement {
    const audio = new Audio(url);
    audio.loop = loop;
    audio.preload = 'auto';
    audio.volume = 0;
    audio.style.display = 'none';
    audio.dataset.sound = name;
    audio.dataset.level = String(Number(level.toFixed(4)));
    document.body.append(audio);
    audio.addEventListener('error', () => {
      this.outcome = 'failed';
    });
    return audio;
  }

  private ensureIntro(): HTMLAudioElement {
    this.intro ??= this.element(this.introUrl, 'cuckoo-intro', false, this.volume);
    return this.intro;
  }

  private ensureForest(): HTMLAudioElement {
    this.forest ??= this.element(
      this.forestUrl,
      'cuckoo-forest',
      true,
      this.volume * this.stream.level,
    );
    this.forest.dataset.startAt = String(this.stream.startAt);
    return this.forest;
  }

  /**
   * Tests substitute the eighteen-second intro for the three-minute stream.
   * Falling back to zero for that short fixture keeps the media clock useful;
   * the production recording is long enough to use its real timestamp.
   */
  private streamOffset(forest: HTMLAudioElement): number {
    return Number.isFinite(forest.duration) &&
      forest.duration > this.stream.startAt + CROSSFADE_END
      ? this.stream.startAt
      : 0;
  }

  private seekForest(forest: HTMLAudioElement, introTime: number): void {
    const seek = (): void => {
      const wanted = this.streamOffset(forest) + introTime;
      if (Math.abs(forest.currentTime - wanted) > 0.2) forest.currentTime = wanted;
    };
    if (forest.readyState >= 1) seek();
    else forest.addEventListener('loadedmetadata', seek, { once: true });
  }

  /** Fetch only the small local lead-in while the game is idle. */
  preload(): Promise<void> {
    const intro = this.ensureIntro();
    if (intro.readyState >= 3) return Promise.resolve();
    return new Promise((resolve) => {
      const done = (): void => resolve();
      intro.addEventListener('canplaythrough', done, { once: true });
      intro.addEventListener('error', done, { once: true });
      setTimeout(done, 8000);
    });
  }

  /** Begin locally; the full recording starts streaming silently beside it. */
  play(): void {
    const intro = this.ensureIntro();
    const forest = this.ensureForest();
    this.wanted = true;
    this.synced = false;
    this.outcome = 'loading';
    intro.currentTime = 0;
    this.seekForest(forest, 0);
    intro.volume = 0;
    forest.volume = 0;
    void intro.play().then(
      () => {
        if (this.outcome !== 'failed') this.outcome = 'playing';
      },
      () => {
        this.outcome = 'blocked';
      },
    );
    // This call is still inside the gesture that put the walker on the hay.
    // Keeping it at zero lets the network get a thirteen-second head start.
    void forest.play().catch(() => {
      if (this.outcome !== 'failed') this.outcome = 'stream blocked';
    });
  }

  stop(): void {
    this.wanted = false;
  }

  private approach(audio: HTMLAudioElement, target: number, dt: number): void {
    const step = (dt / this.fade) * this.volume;
    const gap = target - audio.volume;
    audio.volume = Math.max(
      0,
      Math.min(1, audio.volume + Math.sign(gap) * Math.min(step, Math.abs(gap))),
    );
    if (!this.wanted && audio.volume === 0 && !audio.paused) audio.pause();
  }

  update(dt: number): void {
    const intro = this.intro;
    const forest = this.forest;
    if (!intro) return;

    let introTarget = 0;
    let forestTarget = 0;
    if (this.wanted) {
      const time = intro.currentTime;
      const blend = Math.max(
        0,
        Math.min(1, (time - CROSSFADE_START) / (CROSSFADE_END - CROSSFADE_START)),
      );
      introTarget = this.volume * (1 - blend);
      forestTarget = this.volume * this.stream.level * blend;

      // Both files share the same underlying forest. Correct any network lag
      // just before the fade, while the remote element is still inaudible.
      if (
        forest &&
        !this.synced &&
        time >= CROSSFADE_START - 1 &&
        forest.readyState >= 1
      ) {
        this.seekForest(forest, time);
        this.synced = true;
      }
      if (time >= CROSSFADE_END && !intro.paused) intro.pause();
    }

    this.approach(intro, introTarget, dt);
    if (forest) this.approach(forest, forestTarget, dt);
  }

  status(): string {
    const intro = this.intro?.volume.toFixed(2) ?? '—';
    const forest = this.forest?.volume.toFixed(2) ?? '—';
    return `${this.outcome} ${intro}/${forest}`;
  }
}
