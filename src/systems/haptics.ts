/**
 * The phone's vibration motor.
 *
 * Used for one thing only, and deliberately: a game about a quiet valley that
 * buzzes at you constantly is not quiet. Petting the cat is the one moment
 * where touch is the whole point of the interaction, so it is the one moment
 * the phone answers back.
 *
 * Absent on desktop and on iOS Safari, which has never shipped the API. Both
 * fall through silently — the sound and the hearts carry it on their own.
 */

/**
 * Roughly a purr.
 *
 * A real one is a 25Hz rumble, which no vibration motor can render — it cannot
 * spin up and down four hundred times. So this is the impression of one: soft
 * pulses with gaps short enough to roll together, swelling slightly, over about
 * half a second. Long enough to feel like an animal, short enough not to be an
 * alarm.
 */
const PURR: number[] = [55, 30, 55, 30, 70, 30, 95];

/**
 * Live, not sampled once: someone who turns motion down mid-session means it.
 */
const reducedMotion =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

function buzz(pattern: number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (reducedMotion?.matches) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers expose the method and refuse to run it — outside a user
    // gesture, or with the setting off. Nothing here is worth an exception.
  }
}

/** The cat has been stroked. */
export function buzzPurr(): void {
  buzz(PURR);
}
