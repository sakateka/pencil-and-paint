import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The hedgehog above the haystack.
 *
 * It will not come out for you. The whole of it is that lying back on the hay
 * and doing nothing is the one thing that brings it out — so the things worth
 * holding are the refusals: that walking up to the bush shows you nothing, that
 * the bench does not count, and that it waits before wandering into view.
 */
export async function run(url) {
  const suite = new Suite('hedgehog');
  const game = await openGame(url);

  try {
    const still = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.restart();
      const h = game.hedgehog;
      // Right up against the bush, for as long as anyone would stand there.
      game.teleport(h.x, h.y + 40);
      for (let i = 0; i < 60 * 8; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      }
      return { out: +h.out.toFixed(2), lit: h.lit, seen: h.seen };
    });

    suite.ok(still.lit, 'the colour reaches the bush when you stand at it');
    suite.equal(still.out, 0, 'but standing there shows you nothing');
    suite.equal(still.seen, false, 'and it has not been seen');

    const looks = await game.evaluate((pencil) => {
      const found = new Set();
      for (let i = 0; i < 40; i++) {
        pencil.game.restart();
        found.add(pencil.game.hedgehog.look);
      }
      return [...found].sort();
    });
    suite.equal(looks.join(), 'field,hybrid', 'new worlds randomly use both approved hedgehogs');

    const gated = await game.evaluate((pencil) => {
      const { game } = pencil;
      const samples = [];
      for (let found = 0; found <= 4; found++) {
        game.restart();
        for (let i = 0; i < found; i++) {
          const pot = game.pots.find((p) => !p.found);
          game.teleport(pot.x, pot.y + 6);
          game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        }
        const hay = game.perches.find((p) => p.pose === 'hay');
        game.teleport(hay.x, hay.y + 30);
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        game.interact();
        for (let i = 0; i < 60 * 6; i++) {
          game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        }
        samples.push({ found: game.found, lit: game.hedgehog.lit, out: game.hedgehog.out });
      }
      return samples;
    });
    suite.ok(gated.slice(0, 4).every((s) => !s.lit && s.out === 0), 'three pots cannot colour the raised bush');
    suite.ok(gated[4].lit && gated[4].out > 0, 'the fourth pot brings the hedgehog within reach');

    // The bench is a place to sit, not a place to be still enough.
    const bench = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.restart();
      const seat = game.perches.find((p) => p.pose === 'bench');
      game.teleport(seat.x, seat.y + 30);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const sat = game.interact();
      for (let i = 0; i < 60 * 8; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      }
      return { sat, resting: seat.resting, out: +game.hedgehog.out.toFixed(2) };
    });

    suite.ok(bench.sat && bench.resting, 'you can sit on the bench');
    suite.equal(bench.out, 0, 'and the hedgehog stays where it is');

    // The hay. Five full seconds of lying still are required before it moves.
    const hay = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.restart();
      for (let i = 0; i < 4; i++) {
        const pot = game.pots.find((p) => !p.found);
        game.teleport(pot.x, pot.y + 6);
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      }
      const perch = game.perches.find((p) => p.pose === 'hay');
      game.teleport(perch.x, perch.y + 30);
      game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const lay = game.interact();
      const run = (seconds) => {
        for (let i = 0; i < Math.round(60 * seconds); i++) {
          game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        }
        return +game.hedgehog.out.toFixed(2);
      };
      const waiting = run(4.9);
      const started = run(0.2);
      const snapshot = () => ({
        out: +game.hedgehog.out.toFixed(3),
        x: game.hedgehog.atX,
        y: game.hedgehog.atY,
        facing: game.hedgehog.facing,
        moving: game.hedgehog.moving,
      });
      let guard = 0;
      while (!game.hedgehog.seen && guard++ < 600) run(1 / 60);
      const firstStop = snapshot();
      run(1);
      const firstHeld = snapshot();
      let firstPauseFrames = 60;
      while (!game.hedgehog.moving && firstPauseFrames++ < 360) run(1 / 60);
      const firstDeparture = snapshot();

      let walkGuard = 0;
      while (game.hedgehog.moving && walkGuard++ < 600) run(1 / 60);
      const secondStop = snapshot();
      run(1);
      const secondHeld = snapshot();
      let secondPauseFrames = 60;
      while (!game.hedgehog.moving && secondPauseFrames++ < 360) run(1 / 60);
      const secondDeparture = snapshot();

      // Follow enough destinations to prove that this is an area, not another
      // disguised rail. The simulation is cheap; these are game-time seconds.
      const stops = [firstStop, secondStop];
      const departures = [firstDeparture, secondDeparture];
      for (let leg = 0; leg < 10; leg++) {
        let movingGuard = 0;
        while (game.hedgehog.moving && movingGuard++ < 600) run(1 / 60);
        stops.push(snapshot());
        let pauseGuard = 0;
        while (!game.hedgehog.moving && pauseGuard++ < 360) run(1 / 60);
        departures.push(snapshot());
      }

      const home = { x: game.hedgehog.x, y: game.hedgehog.y };
      const diameter = Math.hypot(34 * 0.9, 34);
      const radius = diameter / 2;
      const centre = { x: home.x - (34 * 0.9) / 2, y: home.y + 34 / 2 };
      const axis = { x: (-34 * 0.9) / diameter, y: 34 / diameter };
      const projected = stops.map((point) => {
        const dx = point.x - centre.x;
        const dy = point.y - centre.y;
        return {
          radius: Math.hypot(dx, dy),
          along: dx * axis.x + dy * axis.y,
          across: dx * -axis.y + dy * axis.x,
        };
      });
      const span = (values) => Math.max(...values) - Math.min(...values);
      const steps = stops.slice(1).map((point, index) =>
        Math.hypot(point.x - stops[index].x, point.y - stops[index].y),
      );
      return {
        lay,
        waiting,
        started,
        firstStop,
        firstHeld,
        firstDeparture,
        firstPause: firstPauseFrames / 60,
        secondStop,
        secondHeld,
        secondDeparture,
        secondPause: secondPauseFrames / 60,
        stops,
        departures,
        diameter,
        radius,
        maxRadius: Math.max(...projected.map((point) => point.radius)),
        alongSpan: span(projected.map((point) => point.along)),
        acrossSpan: span(projected.map((point) => point.across)),
        shortestStep: Math.min(...steps),
        seen: game.hedgehog.seen,
        home,
      };
    });

    suite.ok(hay.lay, 'you can lie back on the hay');
    suite.equal(hay.waiting, 0, 'it stays hidden for the first five seconds');
    suite.ok(hay.started > 0 && hay.started < 0.1, 'then it starts to come out', `${hay.started}`);
    suite.ok(hay.firstStop.out >= 0.22, 'until it reaches its first clear patch', `${hay.firstStop.out}`);
    suite.equal(hay.firstStop.moving, false, 'and lies down there');
    suite.ok(hay.seen, 'and that counts as having seen it');
    suite.equal(hay.firstHeld.x, hay.firstStop.x, 'it does not creep during the first rest');
    suite.equal(hay.firstHeld.y, hay.firstStop.y, 'in either direction');
    suite.equal(hay.firstHeld.facing, hay.firstStop.facing, 'and does not turn before setting off');
    suite.equal(hay.firstHeld.moving, false, 'with its feet tucked away');
    suite.ok(hay.firstPause >= 2.5 && hay.firstPause <= 5.1, 'like livestock, it pauses for a while', `${hay.firstPause}s`);
    suite.ok(hay.firstDeparture.moving, 'then starts its next walk');
    suite.equal(
      hay.firstDeparture.facing,
      hay.secondStop.x < hay.firstStop.x ? -1 : 1,
      'facing the new point only as it sets off',
    );
    suite.equal(hay.secondStop.moving, false, 'then lies down at a different point');
    suite.equal(hay.secondHeld.x, hay.secondStop.x, 'it holds the second resting place');
    suite.equal(hay.secondHeld.y, hay.secondStop.y, 'without sliding along the old line');
    suite.equal(hay.secondHeld.facing, hay.secondStop.facing, 'or turning before the next walk');
    suite.ok(hay.secondPause >= 2.5 && hay.secondPause <= 5.1, 'and takes another livestock-like rest', `${hay.secondPause}s`);
    suite.ok(hay.secondDeparture.moving, 'before choosing another point');
    suite.ok(hay.maxRadius <= hay.radius + 0.01, 'every stop stays inside the circular patch', `${hay.maxRadius.toFixed(1)} / ${hay.radius.toFixed(1)}px`);
    suite.ok(hay.shortestStep >= 7.9, 'the targets are real walks rather than tiny shuffles', `${hay.shortestStep.toFixed(1)}px`);
    suite.ok(hay.alongSpan > hay.radius * 0.5, 'the stops spread along the old route', `${hay.alongSpan.toFixed(1)}px`);
    suite.ok(hay.acrossSpan > hay.radius * 0.5, 'and broadly across it as a two-dimensional area', `${hay.acrossSpan.toFixed(1)}px`);
    suite.ok(
      Math.hypot(hay.firstStop.x - hay.home.x, hay.firstStop.y - hay.home.y) >= hay.diameter * 0.22,
      'it has left the bush, not appeared inside it',
      `${Math.round(hay.firstStop.x)},${Math.round(hay.firstStop.y)} from ${hay.home.x},${hay.home.y}`,
    );

    // And it does not stay for somebody who gets up.
    const gone = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.cancel();
      const before = game.hedgehog.out;
      const lingered = (() => {
        for (let i = 0; i < 30; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        return +game.hedgehog.out.toFixed(2);
      })();
      let retreatFrames = 0;
      while (game.hedgehog.out >= before && retreatFrames++ < 300) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      }
      for (let i = 0; i < 12; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      }
      const retreating = +game.hedgehog.out.toFixed(2);
      for (let i = 0; i < 480; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return {
        before: +before.toFixed(2),
        lingered,
        retreating,
        retreatDelay: retreatFrames / 60,
        out: +game.hedgehog.out.toFixed(2),
      };
    });

    suite.equal(gone.lingered, gone.before, 'getting up does not frighten it away at once');
    suite.ok(
      gone.retreating < gone.lingered,
      'then it walks back towards the bush',
      `${gone.retreating} after ${gone.retreatDelay.toFixed(1)}s`,
    );
    suite.equal(gone.out, 0, 'and it is gone');

    // Out of the colour it is a drawing of a bush, and nothing happens in one.
    const dark = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.restart();
      game.teleport(400, 1500);
      for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      return { lit: game.hedgehog.lit, out: game.hedgehog.out };
    });

    suite.equal(dark.lit, false, 'away across the valley the bush is unlit');
    suite.equal(dark.out, 0, 'and nothing is happening in it');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
