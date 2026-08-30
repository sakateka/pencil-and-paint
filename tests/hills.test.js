import { Suite } from './assert.js';
import { openGame, waitForBoil } from './harness.js';

/** Two pieces of walkable meadow above the old, otherwise flat horizon. */
export async function run(url) {
  const suite = new Suite('hills');
  const game = await openGame(url);

  try {
    const landmarks = await game.evaluate((pencil) => {
      const { game } = pencil;
      return {
        house: game.world.colliders.some((c) => c.kind === 'rect' && c.y < 0),
        pine: game.world.colliders.some((c) => c.kind === 'circle' && c.y < 0),
        falseLowland: game.world.colliders.some((c) => c.kind === 'ellipse' && c.y < 0),
        lion: { x: Math.round(game.lion.x), y: Math.round(game.lion.y) },
      };
    });

    suite.ok(landmarks.house, 'the house is solid on the left hill');
    suite.ok(landmarks.pine, 'and the pine is solid on the right hill');
    suite.equal(landmarks.falseLowland, false, 'there is no false-sky lowland collider');
    suite.equal(
      `${landmarks.lion.x},${landmarks.lion.y}`,
      '620,190',
      'the existing lion has not moved',
    );

    const reached = await game.evaluate((pencil) => {
      const { game } = pencil;
      const climb = (x) => {
        game.teleport(x, 80);
        for (let i = 0; i < 240; i++) {
          game.advance(1 / 60, { direction: () => ({ x: 0, y: -1 }) });
        }
        return { x: Math.round(game.walker.x), y: Math.round(game.walker.y) };
      };
      return {
        left: climb(100),
        right: climb(820),
        oldHorizon: climb(1120),
      };
    });

    suite.ok(reached.left.y < -20, 'the walker can climb onto the left hill', JSON.stringify(reached.left));
    suite.ok(reached.right.y < -20, 'and onto the right hill', JSON.stringify(reached.right));
    suite.atLeast(reached.oldHorizon.y, 10, 'the old horizon still stops them elsewhere');

    /*
     * The line you can see is the ground you walk on.
     *
     * The silhouette, the meadow polygon and the walker's northern boundary are
     * one array now, but "one array" is a claim about the code, and the claim
     * worth holding is about the game: walk north anywhere along the hills and
     * you stop on the drawn line, not near it. Forty-odd places along them,
     * through the real collision — not reading the boundary back out of the
     * thing that set it.
     */
    const agree = await game.evaluate((pencil) => {
      const { game } = pencil;
      const surface = pencil.hillSurface();
      // Straight off the drawn polyline, by the same walk a renderer would do.
      const drawnAt = (x) => {
        for (let i = 1; i < surface.length; i++) {
          if (surface[i][0] < x) continue;
          const a = surface[i - 1];
          const b = surface[i];
          return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
        }
        return 0;
      };
      const off = [];
      let checked = 0;
      for (let i = 0; i < 70; i++) {
        // Inside the map and clear of the two landmarks, which stop you early
        // and honestly — a wall is not the boundary being measured here.
        const x = 40 + i * 14;
        if (Math.abs(x - 340) < 120 || Math.abs(x - 690) < 95) continue;
        checked++;
        game.teleport(x, 120);
        for (let f = 0; f < 240; f++) {
          game.advance(1 / 60, { direction: () => ({ x: 0, y: -1 }) });
        }
        const want = Math.min(0, drawnAt(x)) + 12;
        const got = game.walker.y;
        if (Math.abs(got - want) > 2) off.push(`x${x}: ${got.toFixed(1)} vs ${want.toFixed(1)}`);
      }
      return { checked, off, surface: surface.length };
    });

    suite.ok(agree.surface > 150, 'the hills are one polyline', `${agree.surface} points`);
    suite.atLeast(agree.checked, 30, 'enough places along them to mean something');
    suite.equal(agree.off.length, 0, 'and you stop on the drawn line at every one', agree.off.join(' | '));

    /*
     * And the whole northern view holds still.
     *
     * Everything above the top edge — the sky's ruled strokes, the two green
     * caps, the house and the pine standing on them — is drawn live, because
     * the baked layers stop at y = 0 and there is nothing up here to blit. Live
     * drawing is what the boil is for, and it is exactly wrong for scenery: a
     * house whose graphite re-inks itself sixty times a second reads as the
     * hillside crawling. So the whole pass is made under a still hand.
     *
     * Watched in graphite, from the far hill. In colour these drawings replay
     * from a fixed seed and hold still regardless, so a flooded sample would
     * pass over a view that is visibly boiling. Only the pencil answers this.
     *
     * A real wait, not simulated frames: the boil is driven by the page's own
     * animation loop, so stepping the simulation leaves it exactly where it was
     * and a re-inking house would still match itself.
     */
    const sample = (pencil) => {
      const { game } = pencil;
      const wall = game.world.colliders.find((c) => c.kind === 'rect' && c.y < 0);
      const ctx = document.querySelector('#game').getContext('2d');
      const k = pencil.renderer.scale;
      // Wall and roof only, inside the silhouette on all four sides: the ruled
      // strokes of the sky behind it do boil, and are not what is being asked.
      const sx = Math.round(game.camera.toScreenX(wall.x + wall.w / 2) * k);
      const sy = Math.round(game.camera.toScreenY(wall.y + wall.h / 2 - 20) * k);
      const r = Math.round(60 * k);
      const d = ctx.getImageData(sx - r, sy - r, r * 2, r * 2).data;
      let hash = 0;
      let opaque = 0;
      for (let i = 0; i < d.length; i++) hash = (hash * 31 + d[i]) | 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 200) opaque++;
      return { hash, opaque };
    };

    const graphite = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.restart();
      // Over on the pine hill: the house stays on screen and stays out of the
      // colour, and the walker — who is alive by design — is nowhere near it.
      game.teleport(820, -60);
      for (let i = 0; i < 240; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      /*
       * The world stopped, but not the page: the rAF loop still ticks the clock
       * the boil reads, so the pencil wobble is live while everything that could
       * drift — the motes, most of all — is frozen.
       */
      game.running = false;
      // The real rAF loop may not have painted the teleported camera yet.
      // Under a crowded runner the following read can otherwise see the old
      // frame, even though the simulation state is already the new one.
      pencil.renderOnce();
      const wall = game.world.colliders.find((c) => c.kind === 'rect' && c.y < 0);
      return {
        away: Math.round(Math.hypot(game.walker.x - wall.x - wall.w / 2, game.walker.y - wall.y)),
        lit: Math.round(game.litRadius),
      };
    });

    const first = await game.evaluate(sample);
    await waitForBoil(game.page);
    const second = await game.evaluate(sample);

    suite.ok(
      graphite.away > graphite.lit,
      'the house is left in graphite',
      `${graphite.away} away, colour reaches ${graphite.lit}`,
    );
    suite.ok(first.opaque > 4000, 'the sample is looking at the house', `${first.opaque} pixels`);
    suite.equal(second.hash, first.hash, 'and it does not twitch between boil ticks');

    /*
     * Last, because it takes the world apart.
     *
     * The two landmarks are cached at module scope rather than on the World, so
     * they used to sit out the teardown that hands every other canvas back on
     * `pagehide`. `dispose` now shrinks them too — and a frame afterwards must
     * not throw, which is the failure mode of shrinking a cached surface while
     * leaving it in the map for the next draw to find.
     */
    await game.evaluate((pencil) => {
      pencil.game.world.dispose();
      pencil.renderOnce();
      pencil.renderOnce();
    });

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
