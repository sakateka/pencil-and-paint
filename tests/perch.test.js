import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The bench and the haystack: two places to stop that want nothing from you.
 *
 * The stump next door is a place where something arrives if you wait. These are
 * deliberately not that, and most of what is worth testing is the difference —
 * that they say their own lines rather than the stump's, that you cannot be on
 * two at once, and that sitting really does take the keys away.
 *
 * The last group is the one that came from a bug report. The haystack is a tall
 * occluder — it gets laid back over the walker when they are north of its base
 * — and lying on it means being north of its base. Drawn with the other live
 * things, somebody who walked up from behind and lay down was painted over with
 * straw and vanished outright. The lounger is drawn after the occluder pass now,
 * with the bird on the tree and the face at the treehouse window.
 */
export async function run(url) {
  const suite = new Suite('perch');
  const game = await openGame(url);

  try {
    const both = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.collectAll();
      const walk = (p, dx, dy) => {
        game.cancel();
        game.teleport(p.x + dx, p.y + dy);
        for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        return game.interaction;
      };
      const [bench, hay] = game.perches;
      return {
        bench: walk(bench, 0, 34),
        hay: walk(hay, 0, 34),
        away: walk(bench, 300, 0)?.say ?? null,
        poses: game.perches.map((p) => p.pose),
      };
    });

    suite.equal(both.poses.join(), 'bench,hay', 'there are two of them');
    suite.equal(both.bench?.say, 'prompt.sitBench', 'the bench offers a seat');
    suite.equal(both.hay?.say, 'prompt.lieHay', 'and the haystack offers a lie down');
    suite.ok(
      both.away !== 'prompt.sitBench' && both.away !== 'prompt.lieHay',
      'and neither is on offer from across the field',
      `${both.away}`,
    );

    /*
     * Sitting stops you, standing up starts you again, and neither is the
     * stump's line — the stump says there is nothing to do but wait, which is
     * true there and a lie here.
     */
    const used = await game.evaluate((pencil) => {
      const { game } = pencil;
      const notes = [];
      const events = game.events;
      const was = { start: events.onSitStart, end: events.onSitEnd };
      events.onSitStart = (n) => notes.push(n);
      events.onSitEnd = (n) => notes.push(n);

      game.collectAll();
      game.cancel();
      const hay = game.perches[1];
      game.teleport(hay.x, hay.y + 34);
      for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.interact();
      const at = { x: game.walker.x, y: game.walker.y };
      for (let i = 0; i < 120; i++) game.advance(1 / 60, { direction: () => ({ x: 1, y: 1 }) });
      const moved = Math.hypot(game.walker.x - at.x, game.walker.y - at.y);
      const leaving = game.leaving;
      const offered = game.interaction;
      const twice = game.interact();
      game.cancel();
      for (let i = 0; i < 120; i++) game.advance(1 / 60, { direction: () => ({ x: 1, y: 1 }) });
      const after = Math.hypot(game.walker.x - at.x, game.walker.y - at.y);

      events.onSitStart = was.start;
      events.onSitEnd = was.end;
      return { moved: +moved.toFixed(1), leaving, offered, twice, after: +after.toFixed(1), notes };
    });

    suite.equal(used.moved, 0, 'lying in the hay, the keys do nothing');
    suite.equal(used.leaving, 'prompt.standUp', 'and the way out is to stand up');
    suite.equal(used.offered, null, 'nothing else is on offer while you are down');
    suite.equal(used.twice, false, 'and you cannot settle onto it twice');
    suite.ok(used.after > 40, 'get up and you walk again', `${used.after}px`);
    suite.equal(used.notes.join(), 'note.lainHay,note.leftHay', 'the hay says its own two lines');

    /*
     * Visible from either side of the haystack.
     *
     * The shirt is the one strong red in that corner of the map, so counting
     * red pixels over the seat says whether there is a person there or a pile
     * of straw. Approached from the north the count used to be zero.
     */
    const seen = await game.evaluate((pencil) => {
      const { game } = pencil;
      const hay = game.perches[1];
      // The haystack itself, found among the tall scenery by standing next to
      // the perch — its base line is what the occluder pass compares against.
      const stack = game.world.occluders.find(
        (o) =>
          Math.abs(o.scenery.y - hay.y) < 60 &&
          Math.abs((o.bounds.x0 + o.bounds.x1) / 2 - hay.x) < 80,
      );
      const look = (dx, dy) => {
        game.cancel();
        game.collectAll();
        game.teleport(hay.x + dx, hay.y + dy);
        for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        const sat = game.interact();
        for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        pencil.renderOnce();
        // Both layers stacked: the frame is two canvas elements now and neither
        // of them holds the whole picture on its own.
        const ctx = { getImageData: (x, y, w, h) => pencil.composited(x, y, w, h) };
        const k = pencil.renderer.scale;
        const sx = Math.round(game.camera.toScreenX(hay.x) * k);
        const sy = Math.round(game.camera.toScreenY(hay.y) * k);
        const r = Math.round(44 * k);
        const d = ctx.getImageData(sx - r, sy - r, r * 2, r * 2).data;
        let red = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > 150 && d[i] > d[i + 1] + 50 && d[i] > d[i + 2] + 50) red++;
        }
        return { sat, red, northOfIt: game.walker.y < stack.scenery.y };
      };
      return { found: !!stack, front: look(0, 34), behind: look(-25, -39) };
    });

    suite.ok(seen.front.sat && seen.behind.sat, 'you can lie down from either side');
    suite.ok(seen.behind.northOfIt, 'the second one really is from behind the stack');
    suite.ok(seen.front.red > 80, 'from the front there is somebody there', `${seen.front.red}px`);
    suite.ok(
      seen.behind.red > seen.front.red * 0.9,
      'and from behind the hay is not laid back over them',
      `${seen.behind.red}px vs ${seen.front.red}px`,
    );

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
