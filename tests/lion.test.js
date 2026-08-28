import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The lion, lying in the top-left corner of the map.
 *
 * The corner is the whole point of it and also the whole problem: the camera
 * stops at the edge of the world, so standing up there pins world (0,0) to the
 * top-left of the screen — which is exactly where the paint-pot panel sits.
 * Anything placed too near the origin spends its life behind the HUD, so the
 * test that matters is not "is it there" but "can it be seen".
 */
export async function run(url) {
  const suite = new Suite('lion');
  const game = await openGame(url);

  try {
    const there = await game.evaluate((pencil) => {
      const { game } = pencil;
      return {
        x: Math.round(game.lion.x),
        y: Math.round(game.lion.y),
        width: game.world.width,
        height: game.world.height,
        solid: game.world.colliders.filter(
          (c) => c.kind === 'circle' && Math.hypot(c.x - game.lion.x, c.y - game.lion.y) < 34,
        ).length,
      };
    });

    suite.ok(there.x < there.width * 0.3, 'over on the left of the map', `x ${there.x}`);
    suite.ok(there.y < there.height * 0.3, 'and up at the top of it', `y ${there.y}`);
    suite.ok(there.solid >= 2, 'and it is something you bump into', `${there.solid} colliders`);

    /*
     * You cannot walk through it. Pushed straight at it from three sides, the
     * walker should end up against it rather than inside it — a lion asleep in
     * the grass that you stroll through is a decal, not an animal.
     */
    const bumped = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.collectAll();
      let deepest = -Infinity;
      for (const [dx, dy, px, py] of [
        [0, 70, 0, -1],
        [-90, 5, 1, 0],
        [90, 5, -1, 0],
        [0, -70, 0, 1],
      ]) {
        game.teleport(game.lion.x + dx, game.lion.y + dy);
        for (let i = 0; i < 240; i++) {
          game.advance(1 / 60, { direction: () => ({ x: px, y: py }) });
          /*
           * Measured every frame, not at the end.
           *
           * Walking into it does not stop you — you slide round it and carry
           * on, which is what colliding with something small looks like. So
           * the final position says nothing; what matters is that at no point
           * on the way past were you standing inside the animal.
           */
          deepest = Math.max(
            deepest,
            15 - Math.hypot(game.walker.x - (game.lion.x - 8), game.walker.y - (game.lion.y - 5)),
            11 - Math.hypot(game.walker.x - (game.lion.x + 9), game.walker.y - (game.lion.y - 4)),
          );
        }
      }
      return +deepest.toFixed(1);
    });

    suite.ok(bumped < 1, 'and you never end up standing inside it', `deepest ${bumped}px in`);

    /*
     * Walk into the very corner — as far as the camera will go — and check the
     * lion against every panel drawn over the canvas.
     */
    const seen = await game.evaluate((pencil) => {
      const { game, renderer } = pencil;
      game.collectAll();
      game.teleport(40, 60);
      for (let i = 0; i < 240; i++) game.advance(1 / 60, { direction: () => ({ x: -1, y: -1 }) });
      pencil.renderOnce();

      // Roughly what the lion covers on screen: mane, face and the small body.
      const sx = game.camera.toScreenX(game.lion.x);
      const sy = game.camera.toScreenY(game.lion.y);
      const box = { left: sx - 34, right: sx + 34, top: sy - 50, bottom: sy + 6 };

      const overlaps = [];
      for (const el of document.querySelectorAll('#hud, #corner, #hint, #action, #leave, #intro')) {
        if (el.classList.contains('hidden') || el.hidden) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const hit =
          r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top;
        if (hit) overlaps.push(`${el.id || el.className} ${Math.round(r.left)},${Math.round(r.top)}`);
      }

      return {
        box: `${Math.round(box.left)},${Math.round(box.top)} to ${Math.round(box.right)},${Math.round(box.bottom)}`,
        onScreen:
          box.left > 0 && box.top > 0 && box.right < innerWidth && box.bottom < innerHeight,
        overlaps,
        awake: game.lion.awake,
      };
    });

    suite.ok(seen.onScreen, 'from the corner the lion is on screen', seen.box);
    suite.equal(seen.overlaps.length, 0, 'and nothing is drawn over it', seen.overlaps.join(' | '));
    suite.ok(seen.awake, 'and the colour reaches it');

    /*
     * Walk up to it and it lifts its head; walk off and it puts it down again.
     *
     * The second half of that is the part that was broken: the pose used to be
     * updated only while the colour was on it, and leaving is precisely what
     * takes the colour away — so it stayed sat up staring for good.
     */
    const pose = await game.evaluate((pencil) => {
      const { game } = pencil;
      // A fresh world, so the colour is a small circle again and walking off
      // really does take it off the lion.
      game.restart();
      const settle = (x, y, frames) => {
        game.teleport(x, y);
        for (let i = 0; i < frames; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        return { alert: +game.lion.alert.toFixed(2), awake: game.lion.awake };
      };
      const near = settle(game.lion.x + 40, game.lion.y + 60, 60 * 4);
      const gone = settle(game.lion.x + 700, game.lion.y + 480, 60 * 6);
      const back = settle(game.lion.x + 40, game.lion.y + 60, 60 * 4);
      return { near, gone, back };
    });

    suite.equal(pose.near.alert, 1, 'come near and it lifts its head');
    suite.equal(pose.gone.alert, 0, 'walk away and it puts it back down');
    suite.ok(!pose.gone.awake, 'even though the colour has left it by then');
    suite.equal(pose.back.alert, 1, 'and it looks up again when you return');

    // Out in the graphite it is a drawing, and drawings hold still.
    const far = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.restart();
      game.teleport(game.lion.x + 380, game.lion.y + 210);
      for (let i = 0; i < 120; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const clock = game.lion.clock;
      for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      pencil.renderOnce();
      return { awake: game.lion.awake, ran: +(game.lion.clock - clock).toFixed(3) };
    });

    suite.ok(!far.awake, 'from across the field it is asleep');
    suite.equal(far.ran, 0, 'and its clock does not advance');

    /*
     * And it is drawn perfectly still. The wait is real time: the boil that
     * jitters pencil strokes is driven by the page's animation loop, so
     * stepping the simulation leaves it exactly where it was.
     */
    const sample = (pencil) => {
      const { game } = pencil;
      const ctx = document.querySelector('#game').getContext('2d');
      const sx = Math.round(game.camera.toScreenX(game.lion.x) * pencil.renderer.scale);
      const sy = Math.round(game.camera.toScreenY(game.lion.y) * pencil.renderer.scale);
      const R = 56;
      const data = ctx.getImageData(sx - R, sy - R * 1.5, R * 2, R * 2).data;
      let hash = 0;
      let opaque = 0;
      for (let i = 0; i < data.length; i++) hash = (hash * 31 + data[i]) | 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 200) opaque++;
      return { hash, opaque };
    };

    const first = await game.evaluate(sample);
    await game.page.waitForTimeout(450);
    const second = await game.evaluate(sample);

    suite.ok(first.opaque > 2000, 'the sample is looking at the page', `${first.opaque} pixels`);
    suite.equal(second.hash, first.hash, 'and it does not twitch between boil ticks');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
