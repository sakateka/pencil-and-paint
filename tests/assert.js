/**
 * A very small assertion layer.
 *
 * Deliberately not a test framework: the suite is a handful of files driving a
 * browser, and a dependency-free runner keeps `npm test` honest about what it
 * actually does.
 */

export class Suite {
  constructor(name) {
    this.name = name;
    this.results = [];
    this.lastCheck = performance.now();
  }

  /**
   * Record a check. `detail` is printed either way, so passes are evidence too.
   *
   * A check itself is instant — the cost of a test is the browser work that
   * produced its answer, which happens between checks: the evaluates, the
   * waits, the opening of the page. So each result carries the wall time since
   * the previous one, and the first check of a suite also absorbs the setup,
   * because that too had to happen before it could run.
   */
  check(passed, description, detail = '') {
    const now = performance.now();
    const ms = now - this.lastCheck;
    this.lastCheck = now;
    this.results.push({ passed, description, detail, ms });
    return passed;
  }

  ok(value, description, detail = '') {
    return this.check(Boolean(value), description, detail);
  }

  equal(actual, expected, description) {
    return this.check(
      Object.is(actual, expected),
      description,
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }

  atMost(actual, limit, description) {
    return this.check(actual <= limit, description, `${actual} (limit ${limit})`);
  }

  atLeast(actual, limit, description) {
    return this.check(actual >= limit, description, `${actual} (minimum ${limit})`);
  }

  get failed() {
    return this.results.filter((r) => !r.passed);
  }

  report() {
    const pad = (s, n) => String(s).padEnd(n);
    // Seconds past a second, milliseconds below it — a fraction of a
    // millisecond is never the interesting part.
    const dur = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);
    console.log(`\n  ${this.name}`);
    for (const r of this.results) {
      const mark = r.passed ? '  ok  ' : '  FAIL';
      console.log(`${mark} ${pad(r.description, 52)} ${pad(dur(r.ms), 6)} ${r.detail}`);
    }
    return this.failed.length === 0;
  }
}
