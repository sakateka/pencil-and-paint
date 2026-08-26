import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The renderer's two load-bearing optimisations, and the occluder trick.
 *
 * These are the things most likely to be broken by an innocent-looking change,
 * and the least likely to be noticed by eye: the frame still looks right when
 * the dirty rectangle silently becomes the whole screen.
 */
export async function run(url) {
  const suite = new Suite('rendering');
  const game = await openGame(url, { viewport: { width: 1600, height: 1000 } });

  try {
    // The colour is composited inside a box around the walker, not screen-wide.
    const dirty = await game.evaluate((pencil) => {
      const { game, renderer } = pencil;
      renderer.render(game.scene);
      const rect = game.field.computeDirty(
        game.camera,
        game.camera.toScreenX(game.walker.x),
        game.camera.toScreenY(game.walker.y - 14),
        game.maskRadius * game.camera.zoom,
        renderer.width,
        renderer.height,
      );
      return {
        share: (rect.width * rect.height) / (renderer.width * renderer.height),
        empty: rect.empty,
      };
    });

    suite.ok(!dirty.empty, 'the colour region is non-empty');
    suite.atMost(
      +(dirty.share * 100).toFixed(1),
      35,
      'composites a fraction of the screen, not all of it',
    );

    // Standing behind a building must hide the walker behind its roof.
    const occlusion = await game.evaluate((pencil) => {
      const { game } = pencil;
      const tall = [...game.world.occludersInFrontOf(-Infinity, {
        x0: -Infinity,
        y0: -Infinity,
        x1: Infinity,
        y1: Infinity,
      })];
      const building = tall.find((o) => o.bounds.y1 - o.bounds.y0 > 180);
      if (!building) return null;

      const wall = game.world.colliders.find(
        (c) => c.kind === 'rect' && Math.abs(c.y + c.h - building.scenery.y) < 2,
      );

      const count = (bodyY) => {
        const body = {
          x0: (building.bounds.x0 + building.bounds.x1) / 2 - 16,
          x1: (building.bounds.x0 + building.bounds.x1) / 2 + 16,
          y0: bodyY - 52,
          y1: bodyY + 6,
        };
        return [...game.world.occludersInFrontOf(bodyY, body)].length;
      };

      return {
        roofBand: Math.round(wall.y - building.bounds.y0),
        behind: count(wall.y - 12),
        inFront: count(building.scenery.y + 55),
      };
    });

    suite.ok(occlusion, 'found a building to test against');
    if (occlusion) {
      suite.atLeast(occlusion.roofBand, 40, 'there is walkable space behind the walls');
      suite.atLeast(occlusion.behind, 1, 'standing behind it, the roof is drawn over you');
      suite.equal(occlusion.inFront, 0, 'standing in front of it, nothing covers you');
    }

    // An occluder sprite must reproduce the baked strokes exactly, or the
    // overlay would ghost against the copy underneath.
    const deterministic = await game.evaluate((pencil) => {
      const { game } = pencil;
      const occluder = [...game.world.occludersInFrontOf(-Infinity, {
        x0: -Infinity,
        y0: -Infinity,
        x1: Infinity,
        y1: Infinity,
      })][0];

      const snapshot = () => {
        occluder.sprites.clear();
        const sprite = game.world.spriteFor(occluder, 'sketch');
        const ctx = sprite.canvas.getContext('2d');
        const { data } = ctx.getImageData(0, 0, sprite.canvas.width, sprite.canvas.height);
        let hash = 2166136261;
        for (let i = 0; i < data.length; i += 4) {
          hash = Math.imul(hash ^ data[i + 3], 16777619) >>> 0;
        }
        return hash;
      };
      return { first: snapshot(), second: snapshot() };
    });

    suite.equal(
      deterministic.first,
      deterministic.second,
      'occluder re-renders identically from its seed',
    );

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
