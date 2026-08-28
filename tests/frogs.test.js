import { Suite } from './assert.js';
import { openGame } from './harness.js';

const POND = { x: 790, y: 760 };

/**
 * The frogs out on the pond.
 *
 * They come from one of the paintings on the easel, and the point of them is
 * that somebody who walked past the pond early on can put the two together at
 * the end. So what matters is that they are *there*, on the water, in numbers,
 * and that they stay put: a frog that drifts to the bank has stopped being a
 * frog on a lily pad and become a sheep.
 *
 * Staying put is not free. Every other animal is stepped and then pushed out of
 * solid scenery each frame, and the pond is solid — one round of that and the
 * whole lot would be standing in the reeds.
 */
export async function run(url) {
  const suite = new Suite('frogs');
  const game = await openGame(url);

  try {
    const there = await game.evaluate((pencil) => {
      const { game } = pencil;
      const pond = game.world.pond;
      const frogs = game.herd.animals.filter((a) => a.kind === 'frog');
      return {
        count: frogs.length,
        // How far out each one sits, in the pond's own radii.
        out: frogs.map((f) =>
          +Math.hypot((f.x - pond.x) / pond.rx, (f.y - pond.y) / pond.ry).toFixed(2),
        ),
        spread: new Set(frogs.map((f) => `${Math.round(f.x)},${Math.round(f.y)}`)).size,
        scales: frogs.map((f) => +f.scale.toFixed(2)),
      };
    });

    suite.ok(there.count >= 4, 'there are frogs on the pond', `${there.count}`);
    suite.ok(
      there.out.every((d) => d < 0.8),
      'all of them out on the water, none in the reeds',
      there.out.join(' '),
    );
    suite.equal(there.spread, there.count, 'each on its own pad, not stacked on one');
    // Deliberately larger than their leaf — see the note in the layout. What is
    // worth asserting is that they are all of a size with each other.
    suite.ok(
      there.scales.every((s) => s > 0.8 && s < 1.7),
      'big enough to have a face',
      there.scales.join(' '),
    );

    /*
     * Ten seconds with somebody standing at the water's edge. A chicken would
     * have bolted by now, and anything that gets stepped and then shoved out of
     * the pond collider would be on the bank.
     */
    const later = await game.evaluate((pencil, at) => {
      const { game } = pencil;
      const before = game.herd.animals
        .filter((a) => a.kind === 'frog')
        .map((f) => ({ x: f.x, y: f.y }));
      game.teleport(at.x, at.y + 190);
      for (let i = 0; i < 600; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const frogs = game.herd.animals.filter((a) => a.kind === 'frog');
      return {
        drift: +Math.max(
          ...frogs.map((f, i) => Math.hypot(f.x - before[i].x, f.y - before[i].y)),
        ).toFixed(2),
        awake: frogs.filter((f) => f.awake).length,
        of: frogs.length,
      };
    }, POND);

    suite.equal(later.drift, 0, 'and not one of them has moved an inch');
    suite.ok(later.awake > 0, 'the near ones are in colour', `${later.awake}/${later.of}`);

    // Far side of the valley: they go back to being a drawing, like everything.
    const away = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.teleport(2400, 1800);
      for (let i = 0; i < 120; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      pencil.renderOnce();
      const frogs = game.herd.animals.filter((a) => a.kind === 'frog');
      return { awake: frogs.filter((f) => f.awake).length };
    });

    suite.equal(away.awake, 0, 'from across the valley they are pencil again');

    // A new world puts them back on the water rather than scattering them.
    const restarted = await game.evaluate((pencil) => {
      const { game } = pencil;
      const pond = game.world.pond;
      game.restart();
      const frogs = game.herd.animals.filter((a) => a.kind === 'frog');
      return +Math.max(
        ...frogs.map((f) => Math.hypot((f.x - pond.x) / pond.rx, (f.y - pond.y) / pond.ry)),
      ).toFixed(2);
    });

    suite.ok(restarted < 0.8, 'and a new world does not scatter them ashore', `${restarted}`);

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
