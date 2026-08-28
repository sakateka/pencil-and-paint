import { Suite } from './assert.js';
import { openGame } from './harness.js';

const EASEL = { x: 1902, y: 1782 };

/**
 * The easel's drawing board.
 *
 * The part worth asserting hardest is the palette: what you can paint with is
 * what you have picked up, so an empty-handed walker gets a pencil and a rubber
 * and nothing else. That is the whole game restated in one row of buttons, and
 * it only works if every pot is a different colour — which is why that is
 * checked here too.
 */
export async function run(url) {
  const suite = new Suite('studio');
  const game = await openGame(url);

  try {
    // Fourteen pots, fourteen colours. A repeat is a pot that gives you nothing.
    const hues = await game.evaluate((pencil) => {
      const all = pencil.game.pots.map((p) => p.hue);
      return { count: all.length, distinct: new Set(all).size };
    });
    suite.equal(hues.count, 14, 'fourteen pots');
    suite.equal(hues.distinct, 14, 'and no two the same colour');

    // Walk up to the easel with nothing collected.
    await game.evaluate((pencil, at) => {
      pencil.game.teleport(at.x, at.y + 40);
      pencil.game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
    }, EASEL);
    const offered = await game.evaluate((pencil) => ({
      prompt: pencil.game.interaction,
      collected: pencil.game.collectedHues.length,
    }));

    suite.equal(offered.prompt?.kind, 'draw', 'the easel offers itself');
    suite.equal(offered.prompt?.say, 'prompt.draw', 'and says what for');
    suite.equal(offered.collected, 0, 'with no paint collected yet');

    // Open it with the key, the way anybody would.
    await game.evaluate(() => {
      dispatchEvent(new KeyboardEvent('keydown', { key: 'у', code: 'KeyE', bubbles: true }));
    });
    await game.page.waitForSelector('#studio:not(.hidden)', { timeout: 5000 });

    const empty = await game.page.evaluate(() => ({
      swatches: [...document.querySelectorAll('#palette .swatch')].map(
        (b) => b.style.background,
      ),
      nibs: document.querySelectorAll('#nibs .nib').length,
      gallery: document.querySelectorAll('#gallery img').length,
      emptyShown: getComputedStyle(document.getElementById('galleryEmpty')).display !== 'none',
      collectionHidden: document.getElementById('collection').classList.contains('hidden'),
    }));

    suite.equal(empty.swatches.length, 2, 'a pencil and a rubber, and nothing else');
    suite.equal(empty.nibs, 3, 'three nibs');
    suite.equal(empty.gallery, 0, 'nothing kept yet');
    suite.ok(empty.emptyShown, 'and it says so');
    suite.ok(empty.collectionHidden, 'and the collection is not shown yet either');

    // The walker must not wander off while somebody is drawing.
    const held = await game.evaluate((pencil) => {
      const { game } = pencil;
      const from = { x: game.walker.x, y: game.walker.y };
      dispatchEvent(new KeyboardEvent('keydown', { key: 'ц', code: 'KeyW', bubbles: true }));
      for (let i = 0; i < 60; i++) game.advance(1 / 60, pencil.input);
      dispatchEvent(new KeyboardEvent('keyup', { key: 'ц', code: 'KeyW', bubbles: true }));
      return +Math.hypot(game.walker.x - from.x, game.walker.y - from.y).toFixed(2);
    });
    suite.equal(held, 0, 'and the walker stays put while they do');

    // Draw something, and keep it.
    const paper = await game.page.$('#paper');
    const box = await paper.boundingBox();
    await game.page.mouse.move(box.x + 40, box.y + 40);
    await game.page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await game.page.mouse.move(box.x + 40 + i * 24, box.y + 40 + Math.sin(i) * 40);
    }
    await game.page.mouse.up();
    await game.page.click('#studioClose');

    const kept = await game.page.evaluate(() => {
      const raw = localStorage.getItem('pencil:drawings');
      const list = JSON.parse(raw ?? '[]');
      return {
        count: list.length,
        isPng: list[0]?.startsWith('data:image/png') ?? false,
        bytes: list[0]?.length ?? 0,
        thumbs: document.querySelectorAll('#gallery img').length,
      };
    });

    suite.equal(kept.count, 1, 'keeping it puts one drawing in the browser');
    suite.ok(kept.isPng, 'as a png');
    suite.ok(kept.bytes > 400, 'with something actually on it', `${kept.bytes} chars`);
    suite.equal(kept.thumbs, 1, 'and it turns up in the gallery');

    // And it goes onto the easel out in the valley.
    await game.page.waitForFunction(
      () => globalThis.pencil.game.easelPicture !== undefined,
      null,
      { timeout: 5000 },
    );
    const onEasel = await game.evaluate((pencil) => {
      pencil.renderOnce(); // the easel with a picture on it must draw cleanly
      const paper = document.getElementById('paper');
      return {
        width: pencil.game.easelPicture?.naturalWidth ?? 0,
        height: pencil.game.easelPicture?.naturalHeight ?? 0,
        // Read off the paper rather than written down here: the board has been
        // resized once already and a hardcoded size only fails afterwards.
        paperWidth: paper.width,
        paperHeight: paper.height,
      };
    });
    suite.equal(onEasel.width, onEasel.paperWidth, 'the easel is showing it');
    suite.equal(onEasel.height, onEasel.paperHeight, 'at the size it was drawn');
    suite.ok(onEasel.paperWidth >= 720, 'and the paper is worth drawing on', `${onEasel.paperWidth}px`);

    // That one button both kept it and closed the board.
    await game.page.waitForSelector('#studio.hidden', { state: 'attached', timeout: 5000 });
    const walked = await game.evaluate((pencil) => {
      const { game } = pencil;
      const from = { x: game.walker.x, y: game.walker.y };
      for (let i = 0; i < 30; i++) game.advance(1 / 60, { direction: () => ({ x: 1, y: 0 }) });
      return +Math.hypot(game.walker.x - from.x, game.walker.y - from.y).toFixed(1);
    });
    suite.ok(walked > 5, 'and they can walk again afterwards', `${walked}px`);

    /*
     * With paint collected, the palette grows by exactly what was picked up.
     */
    const armed = await game.evaluate((pencil, at) => {
      const { game } = pencil;
      game.collectAll();
      game.teleport(at.x, at.y + 40);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.interact();
      return game.collectedHues;
    }, EASEL);
    await game.page.waitForSelector('#studio:not(.hidden)', { timeout: 5000 });
    const full = await game.page.evaluate(() =>
      [...document.querySelectorAll('#palette .swatch')].length,
    );

    suite.equal(armed.length, 14, 'every pot found is every colour collected');
    suite.equal(full, 16, 'and the palette is the pencil, the fourteen, and the rubber');

    /*
     * The collection: every painting at once, and only once the valley is done.
     *
     * The point of it is recognition — somebody who walked past the frogs on the
     * pond and the owl up its tree gets to see, at the end, what they were drawn
     * from. So they all appear together rather than one at a time, and they do
     * not appear at all while there are still pots out there.
     */
    const shown = await game.page.evaluate(() => ({
      count: document.querySelectorAll('#collection img').length,
      hidden: document.getElementById('collection').classList.contains('hidden'),
      titled: document.getElementById('collectionTitle').textContent,
      named: [...document.querySelectorAll('#collection img')].map((i) => i.alt),
    }));

    suite.ok(!shown.hidden, 'with every pot found, the collection appears');
    // Not a fixed number: which paintings are in is a decision that keeps
    // changing, and a test that has to be edited every time one arrives is a
    // test that stops meaning anything.
    suite.ok(shown.count >= 1, 'with the paintings in it', `${shown.count}`);
    suite.ok(shown.titled.length > 0, 'under a line of its own', shown.titled);
    suite.equal(new Set(shown.named).size, shown.count, 'each named, and named differently');
    suite.ok(
      shown.named.every((n) => !n.includes('.')),
      'in words rather than keys',
      shown.named.join(' / '),
    );

    // Tapping one puts it up on the board, at its own shape.
    const looked = await game.page.evaluate(async () => {
      const before = document.getElementById('paper').toDataURL().length;
      document.querySelectorAll('#collection img')[0].click();
      await new Promise((r) => setTimeout(r, 800));
      return { before, after: document.getElementById('paper').toDataURL().length };
    });
    suite.ok(looked.after > looked.before * 1.2, 'and tapping one puts it on the board');

    await game.page.click('#studioClose');

    // What is kept survives the tab being closed, which is the point of keeping it.
    await game.page.reload();
    await game.page.waitForSelector('#startBtn');
    await game.page.click('#startBtn');
    await game.page.waitForFunction(() => globalThis.pencil !== undefined, null, { timeout: 30000 });
    const survived = await game.page.evaluate(
      () => JSON.parse(localStorage.getItem('pencil:drawings') ?? '[]').length,
    );
    suite.equal(survived, 1, 'and it is still there after a reload');
    await game.page.waitForFunction(
      () => globalThis.pencil.game.easelPicture !== undefined,
      null,
      { timeout: 5000 },
    );
    suite.ok(true, 'still standing on the easel, too');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
