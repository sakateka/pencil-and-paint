import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The owl, up a tree in the north.
 *
 * It does exactly one thing and this is all about that one thing: it watches
 * you. Everything else in the valley either ignores the walker or runs from
 * them, so the head coming round to follow you is the whole character of it,
 * and a test that only checked it existed would be checking nothing.
 */
export async function run(url) {
  const suite = new Suite('owl');
  const game = await openGame(url);

  try {
    const there = await game.evaluate((pencil) => {
      const { game } = pencil;
      const owl = game.owl;
      // The trunk it is sitting in: a round collider below it and about level.
      const trunk = game.world.colliders.filter(
        (c) => c.kind === 'circle' && Math.abs(c.x - owl.x) < 45 && c.y > owl.y + 20,
      ).length;
      return {
        x: Math.round(owl.x),
        y: Math.round(owl.y),
        scale: +owl.scale.toFixed(2),
        height: game.world.height,
        trunk,
      };
    });

    suite.ok(there.trunk > 0, 'it is up a tree, not standing in a field');
    suite.ok(there.y < there.height * 0.5, 'in the northern half', `y ${there.y}`);
    suite.ok(there.scale >= 0.95, 'big enough to have a face', `${there.scale}`);

    // From across the valley it is a drawing, and drawings hold still.
    const far = await game.evaluate((pencil) => {
      const { game } = pencil;
      /*
       * Far enough out of the colour to be asleep, near enough to still be on
       * screen — the stillness check below reads pixels where it is drawn, and
       * an owl over the horizon samples a rectangle of nothing.
       */
      game.teleport(game.owl.x + 360, game.owl.y + 170);
      for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const clock = game.owl.clock;
      for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      pencil.renderOnce(); // an owl in graphite must draw cleanly too
      return { awake: game.owl.awake, ran: +(game.owl.clock - clock).toFixed(3) };
    });

    suite.ok(!far.awake, 'from across the valley it is asleep');
    suite.equal(far.ran, 0, 'and its clock does not advance');

    /*
     * And it is drawn perfectly still, which is a separate thing from its clock
     * being stopped.
     *
     * Pencil strokes are jittered against a "boil" counter that ticks seven
     * times a second, and anything drawn outside `withBoil` gets the live one —
     * so the frozen owl was re-inked continuously and sat in its tree with its
     * eyes darting about.
     *
     * The wait is real time, not simulated. The boil is advanced by the page's
     * own animation loop, so stepping the simulation two hundred frames in a
     * microsecond leaves it exactly where it was — the first version of this
     * test did that and passed happily with the bug still in place.
     */
    const sample = (pencil) => {
      const { game } = pencil;
      const ctx = document.querySelector('#game').getContext('2d');
      const sx = Math.round(game.camera.toScreenX(game.owl.x) * pencil.renderer.scale);
      const sy = Math.round(game.camera.toScreenY(game.owl.y) * pencil.renderer.scale);
      const R = 44;
      const data = ctx.getImageData(sx - R, sy - R * 1.7, R * 2, R * 2).data;
      let hash = 0;
      let opaque = 0;
      for (let i = 0; i < data.length; i++) hash = (hash * 31 + data[i]) | 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 200) opaque++;
      return { hash, opaque, awake: game.owl.awake, sx, sy };
    };

    const first = await game.evaluate(sample);
    // Three boil ticks' worth, wall clock.
    await game.page.waitForTimeout(450);
    const second = await game.evaluate(sample);

    suite.ok(!first.awake, 'still out in the graphite');
    // Guard against the assertion below passing on a rectangle of nothing,
    // which is exactly what it did when the vantage point was off the map.
    suite.ok(
      first.opaque > 1000,
      'and the sample is actually looking at the page',
      `${first.opaque} opaque pixels at ${first.sx},${first.sy}`,
    );
    suite.equal(second.hash, first.hash, 'and it does not move a hair between boil ticks');

    /*
     * The head turn. Stand to one side and then the other: it should end up
     * looking at you both times, which is a different assertion from it merely
     * moving — a head that swung about on its own would pass that.
     */
    const watched = await game.evaluate((pencil) => {
      const { game } = pencil;
      const owl = game.owl;
      const settle = (dx) => {
        game.teleport(owl.x + dx, owl.y + 120);
        for (let i = 0; i < 180; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        return { look: +owl.look.toFixed(2), awake: owl.awake };
      };
      const right = settle(90);
      const left = settle(-90);
      const rightAgain = settle(90);
      return { right, left, rightAgain };
    });

    suite.ok(watched.right.awake, 'up close the colour reaches it');
    suite.ok(watched.right.look > 0.7, 'stand to its right and it looks right', `${watched.right.look}`);
    suite.ok(watched.left.look < -0.7, 'stand to its left and it looks left', `${watched.left.look}`);
    suite.ok(
      watched.rightAgain.look > 0.7,
      'and it follows you back again',
      `${watched.rightAgain.look}`,
    );

    const locked = await game.evaluate((pencil) => {
      const { game } = pencil;
      // Near enough to touch, so that the click below is refused for one
      // reason only — the world is not finished — and not for being far away.
      game.teleport(game.owl.x + 60, game.owl.y + 60);
      for (let i = 0; i < 30; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      pencil.renderOnce();
      return {
        x: game.camera.toScreenX(game.owl.x),
        y: game.camera.toScreenY(game.owl.y) - 16 * game.owl.scale * game.camera.zoom,
      };
    });
    await game.page.mouse.click(locked.x, locked.y);
    const beforeWin = await game.evaluate((pencil) => ({
      flap: pencil.game.owl.flap,
      sounds: document.querySelectorAll('audio[data-sound="owl-hoot"]').length,
    }));
    suite.equal(beforeWin.flap, 0, 'before the whole world is coloured it keeps still');
    suite.equal(beforeWin.sounds, 0, 'and keeps quiet');

    // Far enough off and it stops paying attention, rather than staring across
    // the whole valley.
    const ignored = await game.evaluate((pencil) => {
      const { game } = pencil;
      const owl = game.owl;
      // Awake — the colour is flooded — but well outside its notice.
      game.collectAll();
      game.teleport(owl.x + 420, owl.y + 60);
      for (let i = 0; i < 240; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      const first = owl.look;
      let moved = 0;
      for (let i = 0; i < 1800; i++) {
        game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        moved = Math.max(moved, Math.abs(owl.look - first));
      }
      return { awake: owl.awake, moved: +moved.toFixed(2) };
    });

    suite.ok(ignored.awake, 'with every pot found it is awake wherever you are');
    suite.ok(
      ignored.moved > 0.5,
      'but out of range it looks about on its own',
      `${ignored.moved}`,
    );

    /*
     * The same click from across the meadow does nothing at all.
     *
     * The old rule was only "the click landed on the owl", which worked from
     * wherever the camera happened to be. Now the bird answers a touch, and a
     * touch means being there: from over here it goes on watching, in silence.
     * The walker is still wherever the block above left them, well awake and
     * well out of reach.
     */
    const distant = await game.evaluate((pencil) => {
      const { game } = pencil;
      pencil.renderOnce();
      return {
        x: game.camera.toScreenX(game.owl.x),
        y: game.camera.toScreenY(game.owl.y) - 16 * game.owl.scale * game.camera.zoom,
      };
    });
    await game.page.mouse.click(distant.x, distant.y);
    const noHoot = await game.evaluate((pencil) => ({
      flap: pencil.game.owl.flap,
      sounds: document.querySelectorAll('audio[data-sound="owl-hoot"]').length,
    }));
    suite.equal(noHoot.flap, 0, 'clicked at arm’s length it does not stir');
    suite.equal(noHoot.sounds, 0, 'and does not hoot');

    const target = await game.evaluate((pencil) => {
      const { game } = pencil;
      game.collectAll();
      // Under its branch, near enough that the bird can be touched.
      game.teleport(game.owl.x, game.owl.y + 60);
      for (let i = 0; i < 90; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      pencil.renderOnce();
      return {
        x: game.camera.toScreenX(game.owl.x),
        y: game.camera.toScreenY(game.owl.y) - 16 * game.owl.scale * game.camera.zoom,
      };
    });

    await game.page.mouse.click(target.x, target.y);
    const clicked = await game.evaluate((pencil) => {
      const audio = document.querySelector('audio[data-sound="owl-hoot"]');
      return {
        flap: pencil.game.owl.flap,
        sounds: document.querySelectorAll('audio[data-sound="owl-hoot"]').length,
        loops: audio?.loop,
        level: Number(audio?.dataset.level),
      };
    });

    suite.ok(clicked.flap > 0, 'touching it starts a wing beat');
    suite.equal(clicked.sounds, 1, 'and asks for one hoot');
    suite.ok(!clicked.loops, 'the hoot does not loop');
    suite.equal(clicked.level, 0.85, 'and plays clearly without shouting');

    const sound = await game.evaluate(async (pencil) => {
      const audio = document.querySelector('audio[data-sound="owl-hoot"]');
      if (!audio) return { found: false };
      const response = await fetch(audio.src);
      const encoded = await response.arrayBuffer();
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(encoded.slice(0));
      await context.close();
      for (let i = 0; i < 60; i++) {
        pencil.game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      }
      return {
        found: true,
        ok: response.ok,
        bytes: encoded.byteLength,
        seconds: decoded.duration,
        flap: pencil.game.owl.flap,
      };
    });

    suite.ok(sound.found && sound.ok, 'the recorded hoot is served');
    suite.ok(sound.bytes > 35000 && sound.bytes < 50000, 'with only the hoot kept', `${sound.bytes} bytes`);
    suite.ok(sound.seconds > 2.5 && sound.seconds < 3, 'and no stray sound at the tail', `${sound.seconds}s`);
    suite.equal(sound.flap, 0, 'the wings settle again after the beat');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
