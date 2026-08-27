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
 * spin up and down four hundred times. So this is the impression of one: pulses
 * with gaps short enough to roll together, over about half a second.
 *
 * The pulses are long on purpose. A phone's motor takes a few tens of
 * milliseconds just to spin up, so anything much under 50ms is a request the
 * hardware answers with silence — which is indistinguishable, from the far side
 * of a screen, from the API being switched off.
 */
const PURR: number[] = [90, 55, 90, 55, 130];

/**
 * What the last attempt did, for the diagnostics readout.
 *
 * The Vibration API fails silently by design: no event, no exception, and a
 * return value everyone ignores. On a phone that is not buzzing, that leaves
 * nothing at all to look at — so the outcome is kept and shown behind the
 * chart icon rather than guessed at.
 */
let calls = 0;
let outcome = 'untried';

function buzz(pattern: number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    outcome = 'no api';
    return;
  }
  calls++;
  try {
    // False means the browser declined: no motor, a silenced device, or a call
    // it did not consider to be inside a user gesture.
    outcome = navigator.vibrate(pattern) ? 'ok' : 'declined';
  } catch (error) {
    outcome = error instanceof Error ? error.name : 'threw';
  }
}

/** The cat has been stroked. */
export function buzzPurr(): void {
  buzz(PURR);
}

/** One line for the diagnostics overlay. */
export function hapticStatus(): string {
  const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  return `vibro ${supported ? 'api' : 'no api'} · pets ${calls} · ${outcome}`;
}
