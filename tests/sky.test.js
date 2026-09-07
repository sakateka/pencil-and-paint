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
      const at = (x, y) => {
        game.teleport(x, y);
        for (let i = 0; i < 180; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        pencil.renderOnce();
        return Math.round(game.camera.viewY);
      };
      return {
        middle: at(1400, 1000),
        northA: at(1400, 700),
        northB: at(1400, 500),
        approaching: at(1400, 360),
        // The new hill itself reaches into the extra sky without a camera lift.
        top: at(200, -90),
        bottom: at(1400, game.world.height - 40),
        height: game.world.height,
      };
    });

    suite.ok(view.middle >= 0, 'no sky from the middle of the valley', `viewY ${view.middle}`);
    suite.ok(
      Math.abs(view.northA - view.northB - 200) <= 2,
      'the camera does not accelerate on the walk north',
      `${view.northA} to ${view.northB}`,
    );
    suite.ok(
      view.approaching < 0 && view.approaching > -300,
      'a band of it as you come up the field',
      `viewY ${view.approaching}`,
    );
    suite.ok(view.top <= -500, 'and all of the taller sky at the very top', `viewY ${view.top}`);
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
        // Both layers stacked: the frame is two canvas elements now and neither
        // of them holds the whole picture on its own.
        const ctx = { getImageData: (x, y, w, h) => pencil.composited(x, y, w, h) };
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

    /*
     * The sun has rays, in both media.
     *
     * It went without them for months and nothing noticed: the flame ring was
     * drawn out at the sun's world position while the disc it rings was drawn
     * at the origin, so every flame landed two and a half thousand units off
     * its own picture and was clipped away. What was left was a plain circle,
     * and a plain circle is a perfectly good-looking thing — which is why no
     * screenshot ever raised its hand.
     *
     * So this asks the one question that separates them: how far west of the
     * centre does the drawing reach at the sun's own latitude? The disc stops
     * at 150 units; the flames go out to nearly 200. Anything that finds ink
     * past the disc's edge has found a ray.
     *
     * A band of rows rather than one, because the flames are twenty-two licks
     * with gaps between them and a single row can fall in a gap. Each column
     * is compared against the same row of the westmost column, which is well
     * outside any flame and is therefore whatever the sky happens to be doing
     * there — a gradient in paint, ruled lines and paper grain in graphite.
     */
    const rays = await game.evaluate((pencil) => {
      const { game } = pencil;
      const scale = pencil.renderer.scale;
      const west = (flooded) => {
        game.restart();
        if (flooded) game.collectAll();
        // The one place the sun is on screen: its own longitude, camera at the
        // ceiling of the sky. Its centre is off the corner of the paper.
        game.teleport(2792, 100);
        for (let i = 0; i < 180; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        game.camera.snapTo(2792, game.camera.viewHeight / 2 - 530);
        pencil.renderOnce();
        const at = (wx, wy) => [
          Math.round(game.camera.toScreenX(wx) * scale),
          Math.round(game.camera.toScreenY(wy) * scale),
        ];
        const [x0, y0] = at(2560, -526);
        const [x1, y1] = at(2700, -446);
        const w = x1 - x0;
        const h = y1 - y0;
        const { data } = pencil.composited(x0, y0, w, h);
        for (let x = 0; x < w; x++) {
          for (let y = 0; y < h; y++) {
            const i = (y * w + x) * 4;
            const ref = y * w * 4;
            const d = Math.max(
              Math.abs(data[i] - data[ref]),
              Math.abs(data[i + 1] - data[ref + 1]),
              Math.abs(data[i + 2] - data[ref + 2]),
            );
            if (d > 12) return 2560 + (x / w) * 140;
          }
        }
        return Infinity;
      };
      return { sketch: west(false), colour: west(true) };
    });

    // The disc's own edge is at 2792 - 150 = 2642, with a little room for the
    // shortest flame: past this and it can only be a ray.
    for (const [medium, reach] of [
      ['in graphite', rays.sketch],
      ['in paint', rays.colour],
    ]) {
      suite.ok(
        reach < 2628,
        `the sun has its rays ${medium}`,
        `ink reaches west to ${Math.round(reach)}, disc edge 2642`,
      );
    }

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
