import { Suite } from './assert.js';
import { openGame } from './harness.js';

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

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
