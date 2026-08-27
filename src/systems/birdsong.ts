import birdsongUrl from '../assets/birdsong.mp3';

/**
 * Birds, from a real morning.
 *
 * This is the only recorded sound in the game — everything else is a handful of
 * oscillators — and it is recorded because a synthesised bird is unmistakably a
 * synthesised bird. Whistles and chirps are easy; what is not is the way real
 * birds answer each other at a distance, in a garden with air in it. That is
 * what makes lying in a hammock feel like lying in a hammock.
 *
 * "Birds singing in garden" by ezwa, from pdsounds.org via Wikimedia Commons.
 * Public domain. Trimmed to a loop, high-passed to take out the traffic rumble
 * the original had under it, and levelled. See CREDITS.md.
 *
 * Fetched the first time it is wanted rather than at load. Most sessions never
 * lie down in the hammock, and none of them can before the valley is finished
 * — a hundred kilobytes on the critical path for that would be a poor trade.
 */

let element: HTMLAudioElement | undefined;
let wanted = false;

/** What happened, for the diagnostics readout. */
let outcome = 'untried';

function ensure(): HTMLAudioElement | undefined {
  if (element) return element;
  try {
    element = new Audio(birdsongUrl);
    element.loop = true;
    element.preload = 'auto';
    element.volume = 0;
    /*
     * Attached, though nothing displays it.
     *
     * A detached media element is not reliably preloaded — some browsers wait
     * for it to be in a document before fetching anything — and it is invisible
     * to anything inspecting the page, which includes the test that checks the
     * recording is fetched once and only when it is wanted.
     */
    element.style.display = 'none';
    document.body.append(element);
    outcome = 'loading';
    element.addEventListener('canplaythrough', () => {
      outcome = 'ready';
    });
    element.addEventListener('error', () => {
      outcome = 'failed';
    });
    return element;
  } catch {
    outcome = 'unavailable';
    return undefined;
  }
}

/**
 * Start them, from wherever they left off.
 *
 * Resuming rather than restarting: lying down twice in a row should not replay
 * the same bird saying the same thing, which is the tell that it is a recording.
 */
export function startBirdsong(): void {
  wanted = true;
  const audio = ensure();
  if (!audio) return;
  void audio.play().then(
    () => {
      if (outcome !== 'failed') outcome = 'playing';
    },
    () => {
      // Refused, almost certainly for want of a gesture. It will be tried again
      // the next time somebody lies down, which is itself a gesture.
      outcome = 'blocked';
    },
  );
}

export function stopBirdsong(): void {
  wanted = false;
}

/**
 * Follow the fade, once per frame.
 *
 * Faded rather than switched, and paused only once it is silent — a recording
 * that stops dead is a recording, and one that fades is a morning going quiet.
 */
export function updateBirdsong(dt: number): void {
  if (!element) return;
  const target = wanted ? 0.42 : 0;
  const step = dt / 1.4;
  element.volume = Math.max(0, Math.min(1, element.volume + Math.sign(target - element.volume) * Math.min(step, Math.abs(target - element.volume))));
  if (!wanted && element.volume === 0 && !element.paused) element.pause();
}

/** One line for the diagnostics overlay. */
export function birdsongStatus(): string {
  const volume = element ? element.volume.toFixed(2) : '—';
  return `birds ${outcome} · vol ${volume}`;
}
