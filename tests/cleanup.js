import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Removes the per-run build directories that `npm test` leaves under tmp/.
 *
 * Nothing deletes them on its own — a run names its directory in the output
 * and keeps it, so what was actually served can be looked at afterwards
 * (diffed, opened, replayed by hand). This is the broom, and it is the only
 * one: it takes exactly the directories named `tmp/test-*` and nothing else,
 * so the rest of tmp/ — recordings, scratch, other tools' output — is never
 * touched.
 */
const scratch = join(import.meta.dirname, '..', 'tmp');
if (!existsSync(scratch)) {
  console.log('no test build directories to remove');
  process.exit(0);
}
const ours = readdirSync(scratch, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.startsWith('test-'))
  .map((e) => join(scratch, e.name));

if (!ours.length) {
  console.log('no test build directories to remove');
} else {
  for (const dir of ours) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`removed ${dir}`);
  }
}
