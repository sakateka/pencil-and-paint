import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The walker must not end up inside anything solid, and must not be able to
 * walk across a roof.
 *
 * Buildings are the interesting case: only their walls are solid, because a
 * house whose roof was also solid could not be walked behind and felt like a
 * bunker. The roof is handled by drawing it back over the walker instead — so
 * what is asserted here is that the walls stop you and the map edges hold.
 */
export async function run(url) {
  const suite = new Suite('collision');
  const game = await openGame(url);

  try {
    // Drive hard at every building from four sides, and at speed.
    const worst = await game.evaluate((pencil) => {
      const { game } = pencil;
      const rects = game.world.colliders.filter((c) => c.kind === 'rect');
      let deepest = 0;
      let where = null;

      for (const rect of rects) {
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        const from = [
          [cx, rect.y - 140],
          [cx, rect.y + rect.h + 140],
          [rect.x - 160, cy],
          [rect.x + rect.w + 160, cy],
        ];
        for (const [sx, sy] of from) {
          game.walker.x = sx;
          game.walker.y = sy;
          game.walker.vx = 0;
          game.walker.vy = 0;
          for (let i = 0; i < 100; i++) {
            const dx = cx - game.walker.x;
            const dy = cy - game.walker.y;
            const d = Math.hypot(dx, dy) || 1;
            game.walker.x += (dx / d) * 280 * (1 / 60);
            game.walker.y += (dy / d) * 280 * (1 / 60);
            game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
          }
          const insideX = Math.min(game.walker.x - rect.x, rect.x + rect.w - game.walker.x);
          const insideY = Math.min(game.walker.y - rect.y, rect.y + rect.h - game.walker.y);
          if (insideX > 0 && insideY > 0 && Math.min(insideX, insideY) > deepest) {
            deepest = Math.min(insideX, insideY);
            where = { x: Math.round(game.walker.x), y: Math.round(game.walker.y) };
          }
        }
      }
      return { buildings: rects.length, deepest: +deepest.toFixed(2), where };
    });

    suite.atLeast(worst.buildings, 4, 'buildings found to test against');
    suite.equal(worst.deepest, 0, 'never intrudes into a building', JSON.stringify(worst.where));

    // Roam the whole map and confirm nothing solid is ever penetrated.
    const roam = await game.evaluate((pencil) => {
      const { game } = pencil;
      const dirs = [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 0, y: -1 },
        { x: 0.7, y: 0.7 },
        { x: -0.7, y: 0.7 },
        { x: 0.7, y: -0.7 },
        { x: -0.7, y: -0.7 },
      ];
      let worstOverlap = 0;
      for (const dir of dirs) {
        for (let i = 0; i < 120; i++) {
          game.advance(1 / 60, { direction: () => dir });
        }
        for (const c of game.world.colliders) {
          if (c.kind !== 'circle') continue;
          const d = Math.hypot(game.walker.x - c.x, (game.walker.y - c.y) * 1.6);
          worstOverlap = Math.max(worstOverlap, c.r + game.walker.radius - d);
        }
      }
      return {
        overlap: +worstOverlap.toFixed(2),
        x: Math.round(game.walker.x),
        y: Math.round(game.walker.y),
        inBounds:
          game.walker.x >= 20 &&
          game.walker.y >= 60 &&
          game.walker.x <= game.world.width - 20 &&
          game.walker.y <= game.world.height - 20,
      };
    });

    suite.atMost(roam.overlap, 0.01, 'never overlaps solid scenery while roaming');
    suite.ok(roam.inBounds, 'stays inside the map', `at ${roam.x},${roam.y}`);
    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
