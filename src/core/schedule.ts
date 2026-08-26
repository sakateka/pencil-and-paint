/**
 * Hand control back to the browser, briefly.
 *
 * `setTimeout(fn, 0)` is the obvious way and it is a trap: browsers clamp it,
 * nominally to 4ms and in practice to far more on a phone during page load.
 * Firefox on Android was clamping hard enough that a bake yielding ~250 times
 * spent about a minute doing nothing but waiting — the work itself was a
 * fraction of a second.
 *
 * A `MessageChannel` message is a macrotask with no such clamp, so it yields to
 * the event loop and comes straight back. `scheduler.yield()` is better still
 * where it exists, because it returns at the front of the queue rather than
 * behind whatever else has been posted.
 */

interface SchedulerWithYield {
  yield?: () => Promise<void>;
}

const scheduler = (globalThis as { scheduler?: SchedulerWithYield }).scheduler;
const nativeYield = typeof scheduler?.yield === 'function' ? scheduler.yield.bind(scheduler) : null;

const channel = typeof MessageChannel === 'function' ? new MessageChannel() : null;
if (channel) channel.port1.start();

/** Resolves after the browser has had a turn. */
export function yieldToBrowser(): Promise<void> {
  if (nativeYield) return nativeYield();
  if (!channel) return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => {
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });
}
