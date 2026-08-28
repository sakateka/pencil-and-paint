import { existsSync } from 'node:fs';
import { serve } from './harness.js';

import { run as collision } from './collision.test.js';
import { run as stillness } from './stillness.test.js';
import { run as progression } from './progression.test.js';
import { run as rendering } from './rendering.test.js';
import { run as devpanel } from './devpanel.test.js';
import { run as startup } from './startup.test.js';
import { run as petting } from './petting.test.js';
import { run as fishing } from './fishing.test.js';
import { run as i18n } from './i18n.test.js';
import { run as hammock } from './hammock.test.js';
import { run as studio } from './studio.test.js';
import { run as treehouse } from './treehouse.test.js';
import { run as frogs } from './frogs.test.js';

const SUITES = [startup, collision, stillness, progression, rendering, devpanel, petting, fishing, hammock, studio, treehouse, frogs, i18n];

/**
 * Runs every suite against the production build, served over HTTP the way a
 * static host would. Testing `dist/` rather than the dev server means the thing
 * under test is the thing that ships.
 */
async function main() {
  const dist = process.env.PENCIL_DIST
    ? `${process.env.PENCIL_DIST.replace(/\/?$/, '/')}index.html`
    : new URL('../dist/index.html', import.meta.url).pathname;
  if (!existsSync(dist)) {
    console.error('No build found. Run `npm run build` first.');
    process.exit(1);
  }

  const server = await serve();
  let allPassed = true;

  try {
    for (const suite of SUITES) {
      const result = await suite(server.url);
      if (!result.report()) allPassed = false;
    }
  } finally {
    await server.close();
  }

  console.log(allPassed ? '\nall suites passed\n' : '\nFAILURES\n');
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
