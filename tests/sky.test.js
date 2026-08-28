import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The sky, over the top edge of the map.
 *
 * The camera stops at the paper's edge on three sides and is allowed over it on
 * the fourth. Everything here is about that one exception: that it opens
 * gradually rather than all at once, that it is only sky where the colour has
 * reached — bare paper otherwise, like the rest of an unfinished drawing — and
 * that the composite still paints every pixel, since it used to be able to
 * assume there was always a world tile underneath.
 */
export async function run(url) {
  const suite = new Suite('sky');
  const game = await openGame(url);

  try {
    const view = await game.evaluate((pencil) => {
      const { game } = pencil;
      /*
       * Rendered before reading, not just stepped.
       *
       * `viewY` is worked out in `Camera.frame`, which runs as part of drawing
       * — so stepping the simulation moves the camera's centre and leaves the
       * visible region reporting whatever the last real frame computed.
       */
      const at = (y) => {
        game.teleport(1400, y);
        for (let i = 0; i < 180; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        pencil.renderOnce();
        return Math.round(game.camera.viewY);
      };
      return {
        middle: at(1000),
        approaching: at(360),
        top: at(40),
        bottom: at(game.world.height - 40),
        height: game.world.height,
      };
    });

    suite.ok(view.middle >= 0, 'no sky from the middle of the valley', `viewY ${view.middle}`);
    suite.ok(
      view.approaching < 0 && view.approaching > -200,
      'a band of it as you come up the field',
      `viewY ${view.approaching}`,
    );
    suite.ok(view.top <= -300, 'and all of it at the very top', `viewY ${view.top}`);
    suite.ok(
      view.bottom + 1 >= view.height - 800,
      'and the bottom edge still stops dead',
      `viewY ${view.bottom}`,
    );

    /*
     * Every pixel painted, both media.
     *
     * The colour composite blits the world into a scratch surface and does not
     * clear it first, on the grounds that the camera is always inside the map
     * and so every pixel has a tile under it. Above the top edge it has not,
     * and an unpainted band shows up as whatever was in the buffer last frame.
     */
    const painted = await game.evaluate((pencil) => {
      const { game } = pencil;
      const look = (flooded) => {
        game.restart();
        if (flooded) game.collectAll();
        game.teleport(1400, 40);
        for (let i = 0; i < 180; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        pencil.renderOnce();
        const ctx = document.querySelector('#game').getContext('2d');
        const scale = pencil.renderer.scale;
        // A row well up inside the sky band.
        const row = Math.round(game.camera.toScreenY(-200) * scale);
        const data = ctx.getImageData(0, row, Math.round(400 * scale), 1).data;
        let clear = 0;
        let blue = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 250) clear++;
          if (data[i + 2] > data[i] + 12) blue++;
        }
        return { clear, blue, of: data.length / 4 };
      };
      return { sketch: look(false), colour: look(true) };
    });

    suite.equal(painted.sketch.clear, 0, 'the sky band is opaque in graphite');
    suite.equal(painted.colour.clear, 0, 'and opaque in colour');
    suite.equal(painted.sketch.blue, 0, 'out in the graphite it is paper, not sky');
    suite.ok(
      painted.colour.blue > painted.colour.of * 0.8,
      'and blue once the colour reaches it',
      `${painted.colour.blue}/${painted.colour.of}`,
    );

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
