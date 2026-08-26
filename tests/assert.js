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
  }

  /** Record a check. `detail` is printed either way, so passes are evidence too. */
  check(passed, description, detail = '') {
    this.results.push({ passed, description, detail });
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
    console.log(`\n  ${this.name}`);
    for (const r of this.results) {
      const mark = r.passed ? '  ok  ' : '  FAIL';
      console.log(`${mark} ${pad(r.description, 52)} ${r.detail}`);
    }
    return this.failed.length === 0;
  }
}
