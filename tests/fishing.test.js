import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * Fishing at the pond: the one thing here you have to earn.
 *
 * It opens only once the last pot is found, so the first thing asserted is that
 * it stays shut until then — an ending you can reach at the start is not an
 * ending. After that it is a quiet loop: cast, wait, answer the bite or don't,
 * cast again. And the camp belongs to you rather than to the valley, so it
 * follows you in the only way it can — by packing itself up when you go.
 */
export async function run(url) {
  const suite = new Suite('fishing');
  const game = await openGame(url);

  try {
    // Stand at the water's edge with the valley still unfinished.
    const early = await game.evaluate((pencil) => {
      const { game } = pencil;
      const pond = game.world.pond;
      game.teleport(pond.x, pond.y + pond.ry + 22);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { won: game.won, prompt: game.interaction, cast: game.interact() };
    });

    suite.ok(!early.won, 'the valley is not finished yet');
    suite.equal(early.prompt, null, 'so the pond offers nothing');
    suite.ok(!early.cast, 'and there is no fishing to be had');

    // Finish it, and come back.
    const offered = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.collectAll();
      const pond = game.world.pond;
      game.teleport(pond.x, pond.y + pond.ry + 22);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { won: game.won, prompt: game.interaction };
    });

    suite.ok(offered.won, 'every pot found');
    suite.equal(offered.prompt?.kind, 'fish', 'now the pond offers something');
    suite.equal(offered.prompt?.label, 'fish here', 'and says what');

    // Away from the water it is still nothing, won or not.
    const inland = await game.evaluate((pencil) => {
      pencil.game.teleport(1900, 1500);
      pencil.game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return pencil.game.interaction;
    });
    suite.equal(inland, null, 'and only at the water, not anywhere in the valley');

    // Pitch camp.
    const camp = await game.evaluate((pencil) => {
      const { game } = pencil;
      const pond = game.world.pond;
      game.teleport(pond.x, pond.y + pond.ry + 22);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const started = game.interact();
      const f = game.fishing;
      const inside = (e, x, y, pad) =>
        ((x - e.x) / (e.rx + pad)) ** 2 + ((y - e.y) / (e.ry + pad)) ** 2 < 1;
      // The blue part, not the pond's own ellipse, which is the reedy bank.
      const water = { x: pond.x + 6, y: pond.y + 4, rx: pond.rx * 0.74, ry: pond.ry * 0.7 };
      return {
        started,
        phase: f.phase,
        label: game.interaction?.label,
        floatOnWater: inside(water, f.floatX, f.floatY, -6),
        tentOnLand: !inside(pond, f.tentX, f.tentY, 0),
        fireOnLand: !inside(pond, f.fireX, f.fireY, 0),
        tentClear: Math.round(Math.hypot(f.tentX - game.walker.x, f.tentY - game.walker.y)),
      };
    });

    suite.ok(camp.started, 'camp is pitched');
    suite.equal(camp.phase, 'waiting', 'and the line goes straight out');
    suite.equal(camp.label, 'wait for it…', 'the prompt says to wait');
    suite.ok(camp.floatOnWater, 'the float lands on the blue water, not in the reeds');
    suite.ok(camp.tentOnLand, 'the tent is pitched on dry ground');
    suite.ok(camp.fireOnLand, 'and so is the fire');
    suite.ok(camp.tentClear > 20 && camp.tentClear < 90, 'the tent is beside you, not on you',
      `${camp.tentClear}px`);

    // Striking before the bite is not punished.
    const early2 = await game.evaluate((pencil) => {
      const before = pencil.game.fishing.phase;
      const landed = pencil.game.interact();
      return { landed, before, after: pencil.game.fishing.phase };
    });
    suite.ok(!early2.landed, 'striking early lands nothing');
    suite.equal(early2.after, 'waiting', 'but costs nothing either');

    // Wait for the bite, and answer it.
    const landed = await game.evaluate((pencil) => {
      const { game } = pencil;
      // Up to twenty seconds of waiting: the bite comes between five and fifteen.
      let sawBite = false;
      for (let i = 0; i < 20 * 60 && !sawBite; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        if (game.fishing.phase === 'bite') sawBite = true;
      }
      const label = game.interaction?.label;
      const took = game.interact();
      pencil.renderOnce(); // the camp and a leaping fish must draw without complaint
      return { sawBite, label, took, caught: game.fishing.caught, phase: game.fishing.phase };
    });

    suite.ok(landed.sawBite, 'a bite comes if you wait');
    suite.equal(landed.label, 'now!', 'and the prompt says so');
    suite.ok(landed.took, 'answering it lands a fish');
    suite.equal(landed.caught, 1, 'which is counted');
    suite.equal(landed.phase, 'caught', 'and shown for a moment');

    // It goes back out on its own.
    const again = await game.evaluate((pencil) => {
      const { game } = pencil;
      for (let i = 0; i < 200; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return game.fishing.phase;
    });
    suite.equal(again, 'waiting', 'then the line goes back out by itself');

    // Miss one.
    const missed = await game.evaluate((pencil) => {
      const { game } = pencil;
      for (let i = 0; i < 20 * 60; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        if (game.fishing.phase === 'bite') break;
      }
      // Say nothing and let it go.
      for (let i = 0; i < 130; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { phase: game.fishing.phase, label: game.interaction?.label, caught: game.fishing.caught };
    });

    suite.equal(missed.phase, 'missed', 'ignore a bite and it gets away');
    suite.equal(missed.label, 'it got away', 'and it says so');
    suite.equal(missed.caught, 1, 'with nothing added to the tally');

    // Walk away: the camp packs itself up.
    const left = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.teleport(game.fishing.campX + 200, game.fishing.campY + 90);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { active: game.fishing.active, phase: game.fishing.phase, caught: game.fishing.caught };
    });

    suite.ok(!left.active, 'walking away packs up the camp');
    suite.equal(left.phase, 'off', 'and puts the rod down');
    suite.equal(left.caught, 1, 'the fish you caught are still yours');

    // A fresh game closes it again.
    const restarted = await game.evaluate((pencil) => {
      pencil.game.restart();
      return { won: pencil.game.won, caught: pencil.game.fishing.caught, active: pencil.game.fishing.active };
    });
    suite.ok(!restarted.won, 'a new world is unfinished again');
    suite.equal(restarted.caught, 0, 'and the tally starts over');
    suite.ok(!restarted.active, 'with no camp standing');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
