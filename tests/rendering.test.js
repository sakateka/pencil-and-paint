import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The renderer's two load-bearing optimisations, and the occluder trick.
 *
 * These are the things most likely to be broken by an innocent-looking change,
 * and the least likely to be noticed by eye: the frame still looks right when
 * the dirty rectangle silently becomes the whole screen.
 */
export async function run(url) {
  const suite = new Suite('rendering');
  const game = await openGame(url, { viewport: { width: 1600, height: 1000 } });

  try {
    // The colour is composited inside a box around the walker, not screen-wide.
    const dirty = await game.evaluate((pencil) => {
      const { game, renderer } = pencil;
      renderer.render(game.scene);
      const rect = game.field.computeDirty(
        game.camera.toScreenX(game.walker.x),
        game.camera.toScreenY(game.walker.y - 14),
        game.maskRadius * game.camera.zoom,
        renderer.width,
        renderer.height,
      );
      return {
        share: (rect.width * rect.height) / (renderer.width * renderer.height),
        empty: rect.empty,
      };
    });

    suite.ok(!dirty.empty, 'the colour region is non-empty');
    suite.atMost(
      +(dirty.share * 100).toFixed(1),
      35,
      'composites a fraction of the screen, not all of it',
    );

    // Standing behind a building must hide the walker behind its roof.
    const occlusion = await game.evaluate((pencil) => {
      const { game } = pencil;
      const tall = [...game.world.occludersInFrontOf(-Infinity, {
        x0: -Infinity,
        y0: -Infinity,
        x1: Infinity,
        y1: Infinity,
      })];
      /*
       * Find an actual building by its rectangular wall. Height used to be a
       * convenient proxy, until the painted pine became the first genuinely
       * tall tree in the scenery list.
       */
      const building = tall.find((o) =>
        game.world.colliders.some(
          (c) => c.kind === 'rect' && Math.abs(c.y + c.h - o.scenery.y) < 2,
        ),
      );
      if (!building) return null;

      const wall = game.world.colliders.find(
        (c) => c.kind === 'rect' && Math.abs(c.y + c.h - building.scenery.y) < 2,
      );

      const count = (bodyY) => {
        const body = {
          x0: (building.bounds.x0 + building.bounds.x1) / 2 - 16,
          x1: (building.bounds.x0 + building.bounds.x1) / 2 + 16,
          y0: bodyY - 52,
          y1: bodyY + 6,
        };
        return [...game.world.occludersInFrontOf(bodyY, body)].length;
      };

      return {
        roofBand: Math.round(wall.y - building.bounds.y0),
        behind: count(wall.y - 12),
        inFront: count(building.scenery.y + 55),
      };
    });

    suite.ok(occlusion, 'found a building to test against');
    if (occlusion) {
      suite.atLeast(occlusion.roofBand, 40, 'there is walkable space behind the walls');
      suite.atLeast(occlusion.behind, 1, 'standing behind it, the roof is drawn over you');
      suite.equal(occlusion.inFront, 0, 'standing in front of it, nothing covers you');
    }

    // An occluder sprite must reproduce the baked strokes exactly, or the
    // overlay would ghost against the copy underneath.
    const deterministic = await game.evaluate((pencil) => {
      const { game } = pencil;
      const occluder = [...game.world.occludersInFrontOf(-Infinity, {
        x0: -Infinity,
        y0: -Infinity,
        x1: Infinity,
        y1: Infinity,
      })][0];

      const snapshot = () => {
        occluder.sprites.clear();
        const sprite = game.world.spriteFor(occluder, 'sketch');
        const ctx = sprite.canvas.getContext('2d');
        const { data } = ctx.getImageData(0, 0, sprite.canvas.width, sprite.canvas.height);
        let hash = 2166136261;
        for (let i = 0; i < data.length; i += 4) {
          hash = Math.imul(hash ^ data[i + 3], 16777619) >>> 0;
        }
        return hash;
      };
      return { first: snapshot(), second: snapshot() };
    });

    suite.equal(
      deterministic.first,
      deterministic.second,
      'occluder re-renders identically from its seed',
    );

    // The side view must read as a profile, not a face-on head sliding
    // sideways — which is what it looked like before, and reads as walking
    // backwards. Assert the head is actually asymmetric and mirrors.
    const profile = await game.evaluate((pencil) => {
      const { game, renderer } = pencil;
      const near = (a, b, t) => Math.abs(a - b) <= t;
      const measure = (face) => {
        game.walker.x = 1300;
        game.walker.y = 1330;
        game.walker.vx = 210 * face;
        game.walker.vy = 0;
        game.walker.face = face;
        game.walker.facing = 'side';
        game.walker.step = 0;
        game.camera.snapTo(game.walker.x, game.walker.y - 14);
        renderer.render(game.scene);
        const cx = Math.round(game.camera.toScreenX(game.walker.x) * renderer.scale);
        const cy = Math.round(game.camera.toScreenY(game.walker.y) * renderer.scale);
        // Both layers stacked: the frame is two canvas elements now and neither
        // of them holds the whole picture on its own.
        const ctx = { getImageData: (x, y, w, h) => pencil.composited(x, y, w, h) };
        const R = 60;
        const img = ctx.getImageData(cx - R, cy - R * 1.4, R * 2, R * 1.6);
        // Head band only, so the brush hand does not count as a face.
        let eyeX = 0;
        let eyeN = 0;
        // Track both extremes: "front" is the max x facing right and the min x
        // facing left, and measuring max for both silently compared the nose
        // against the back of the head.
        let skinMax = -Infinity;
        let skinMin = Infinity;
        let hairMax = -Infinity;
        let hairMin = Infinity;
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const i = (y * img.width + x) * 4;
            if (img.data[i + 3] < 200) continue;
            const headY = y - R * 1.4;
            if (headY <= -48 || headY >= -26) continue;
            const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
            if (near(r, 58, 8) && near(g, 47, 8) && near(b, 38, 8)) {
              eyeX += x - R;
              eyeN++;
            }
            if (near(r, 242, 12) && near(g, 195, 12) && near(b, 152, 12)) {
              skinMax = Math.max(skinMax, x - R);
              skinMin = Math.min(skinMin, x - R);
            }
            if (near(r, 74, 12) && near(g, 53, 12) && near(b, 39, 12)) {
              hairMax = Math.max(hairMax, x - R);
              hairMin = Math.min(hairMin, x - R);
            }
          }
        }
        return { eye: eyeN ? eyeX / eyeN : null, skinMax, skinMin, hairMax, hairMin };
      };
      return { right: measure(1), left: measure(-1) };
    });

    // The head must read as a profile pointing the way it is going. The cue is
    // the single forward eye and the nose breaking the hairline — deliberately
    // NOT the hair, which is the same cut from every angle.
    suite.atLeast(+profile.right.eye.toFixed(1), 3, 'facing right, the eye sits forward');
    suite.atMost(+profile.left.eye.toFixed(1), -3, 'facing left, the eye sits forward');
    const cycle = await game.evaluate((pencil) => pencil.walkCycle);

    // The body, which is what actually sells the direction of travel. Two
    // things are asserted because both were wrong and neither shows in a still:
    // the chest is narrower seen edge-on than face-on, and the scarf streams
    // backwards rather than being blown ahead of the walker.
    const body = await game.evaluate((pencil) => {
      const { game, renderer } = pencil;
      const near = (a, b, t) => Math.abs(a - b) <= t;
      const measure = (facing, face) => {
        game.walker.x = 1300;
        game.walker.y = 1330;
        game.walker.vx = facing === 'side' ? 210 * face : 0;
        game.walker.vy = facing === 'side' ? 0 : 210;
        game.walker.face = face;
        game.walker.facing = facing;
        game.walker.step = Math.PI / 2;
        game.camera.snapTo(game.walker.x, game.walker.y - 14);
        renderer.render(game.scene);

        const cx = Math.round(game.camera.toScreenX(game.walker.x) * renderer.scale);
        const cy = Math.round(game.camera.toScreenY(game.walker.y) * renderer.scale);
        // Both layers stacked: the frame is two canvas elements now and neither
        // of them holds the whole picture on its own.
        const ctx = { getImageData: (x, y, w, h) => pencil.composited(x, y, w, h) };
        const R = 45;
        const img = ctx.getImageData(cx - R, cy - R * 1.5, R * 2, R * 1.7);
        let shirtMin = Infinity;
        let shirtMax = -Infinity;
        let scarfMin = Infinity;
        let scarfMax = -Infinity;
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const i = (y * img.width + x) * 4;
            if (img.data[i + 3] < 200) continue;
            const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
            if (near(r, 232, 10) && near(g, 86, 10) && near(b, 63, 10)) {
              shirtMin = Math.min(shirtMin, x - R);
              shirtMax = Math.max(shirtMax, x - R);
            }
            if (near(r, 247, 14) && near(g, 193, 14) && near(b, 75, 20)) {
              scarfMin = Math.min(scarfMin, x - R);
              scarfMax = Math.max(scarfMax, x - R);
            }
          }
        }
        return { width: shirtMax - shirtMin, scarfMin, scarfMax };
      };
      return { front: measure('down', 1), right: measure('side', 1), left: measure('side', -1) };
    });

    // Asserted on the geometry, not on pixels: the near arm is the same colour
    // as the shirt, so its swing counts as chest width and the measurement is
    // meaningless.
    suite.atLeast(
      +(cycle.torsoHalfFront - cycle.torsoHalfSide).toFixed(1),
      1.5,
      'the chest is narrower seen edge-on than face-on',
    );
    suite.atMost(body.right.scarfMin, -9, 'facing right, the scarf streams backwards');
    suite.atLeast(body.left.scarfMax, 9, 'facing left, the scarf streams backwards');

    // The walk cycle. Two things went wrong here before and neither is visible
    // in a still frame, so both are pinned down.
    const gait = await game.evaluate((pencil) => {
      const { game, renderer } = pencil;
      const near = (a, b, t) => Math.abs(a - b) <= t;

      const sample = (step, moving) => {
        game.walker.x = 1300;
        game.walker.y = 1330;
        game.walker.vx = moving ? 210 : 0;
        game.walker.vy = 0;
        game.walker.face = 1;
        game.walker.facing = 'side';
        game.walker.step = step;
        game.camera.snapTo(game.walker.x, game.walker.y - 14);
        renderer.render(game.scene);

        const cx = Math.round(game.camera.toScreenX(game.walker.x) * renderer.scale);
        const cy = Math.round(game.camera.toScreenY(game.walker.y) * renderer.scale);
        // Both layers stacked: the frame is two canvas elements now and neither
        // of them holds the whole picture on its own.
        const ctx = { getImageData: (x, y, w, h) => pencil.composited(x, y, w, h) };
        const R = 60;
        const img = ctx.getImageData(cx - R, cy - R * 1.4, R * 2, R * 1.6);

        let woodX = 0;
        let woodN = 0;
        let hair = 0;
        let skin = 0;
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const i = (y * img.width + x) * 4;
            if (img.data[i + 3] < 200) continue;
            const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
            const worldY = y - R * 1.4; // relative to the feet
            if (near(r, 169, 18) && near(g, 121, 18) && near(b, 63, 18)) {
              woodX += x - R;
              woodN++;
            }
            // only the head band, so hands do not count as skin
            if (worldY > -48 && worldY < -26) {
              if (near(r, 74, 12) && near(g, 53, 12) && near(b, 39, 12)) hair++;
              if (near(r, 242, 12) && near(g, 195, 12) && near(b, 152, 12)) skin++;
            }
          }
        }
        return { brushX: woodN ? woodX / woodN : null, hair, skin };
      };

      const rest = sample(0, false);
      const forward = sample(Math.PI / 2, true);
      const back = sample(Math.PI * 1.5, true);
      return {
        restBrushX: +rest.brushX.toFixed(1),
        forwardBrushX: +forward.brushX.toFixed(1),
        backBrushX: +back.brushX.toFixed(1),
        hairShare: +(rest.hair / (rest.hair + rest.skin)).toFixed(2),
      };
    });

    // Standing still, the arm should hang near vertical. Pixels cannot express
    // this without a reference for "vertical", so it is asserted where it
    // actually lives: the resting angle must be small next to the swing, or
    // the hand is parked behind the body for most of the cycle.
    suite.atMost(
      +(Math.abs(cycle.armRest) / cycle.armSwing).toFixed(2),
      0.25,
      'the arm has no meaningful resting bias',
    );

    // And it must actually swing, reaching further forward at one end of the
    // cycle than the other.
    suite.atLeast(
      +(gait.forwardBrushX - gait.backBrushX).toFixed(1),
      6,
      'the arm swings through the cycle',
    );

    // The hair is a filled cap, not a thin band around the crown.
    suite.atLeast(gait.hairShare, 0.3, 'the walker has hair on their head');

    // Blitting the world is the biggest thing in the frame, and it is only
    // cheap when it is one-to-one. Every rung of an earlier scale ladder was
    // slower than simply staying at 1, so dropping the resolution to save time
    // cost time, and the machine sank to the bottom of the ladder.
    const blit = await game.evaluate((pencil) => {
      const { game, renderer } = pencil;
      const cost = (scale) => {
        renderer.resize(innerWidth, innerHeight, scale, game.field);
        game.camera.frame(renderer.width, renderer.height, scale);
        const ctx = renderer.context;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        const blitOnce = () =>
          game.world.drawRegion(
            ctx,
            'sketch',
            game.camera.viewX,
            game.camera.viewY,
            game.camera.viewWidth,
            game.camera.viewHeight,
            0,
            0,
            renderer.width,
            renderer.height,
          );
        for (let i = 0; i < 5; i++) blitOnce();
        const started = performance.now();
        for (let i = 0; i < 30; i++) blitOnce();
        ctx.getImageData(0, 0, 1, 1); // flush, so the number means something
        return (performance.now() - started) / 30;
      };
      const fractional = cost(0.7);
      const oneToOne = cost(1);
      renderer.resize(innerWidth, innerHeight, 1, game.field);
      return { fractional, oneToOne };
    });

    suite.atMost(
      +(blit.oneToOne / blit.fractional).toFixed(2),
      1,
      'a one-to-one world blit is no slower than a fractional one',
    );
    const snapshot = await game.evaluate((p) => p.perf.snapshot());
    suite.equal(snapshot.scale, 1, 'the render scale is one to one');

    /*
     * A cow standing still is drawn by a hand that has stopped.
     *
     * Not obvious, because a cow the colour has reached is alive, and the boil
     * is exactly what a live pencil drawing is meant to do. But `hand` is a
     * graphite dimension only — the paint ignores it — so a boiling hand moves
     * nothing except the pencil copy underneath the paint, and the only part of
     * that copy anyone can see is the sliver of outline the paint does not
     * quite cover. That fringe was reported as a shimmer along the cows' backs,
     * and measured at forty-odd pixels changing seven times a second.
     *
     * The simulation is stopped and the clock is not: `advance` counts elapsed
     * before it checks whether it is running, so the ink clock keeps ticking
     * over a world that is holding perfectly still. Anything that moves here is
     * the hand.
     *
     * Two things this is deliberately not.
     *
     * It is not a hash of the region, which is how the owl and the lion are
     * pinned. Those two stand outside the colour, where the mask is nothing and
     * the pencil is byte-for-byte the same frame after frame. Inside the colour
     * nothing ever is: the haze breathes four units either side of its radius
     * every four seconds, on purpose, and that walks the alpha of the whole
     * coloured layer by a unit or two continuously. So this counts pixels that
     * moved *visibly* — the same threshold the shimmer instrument uses — rather
     * than pixels that moved.
     *
     * And it reads screenshots rather than `pencil.composited`, which every
     * other picture test here uses. Phaser presents on its own frame, so a
     * `renderOnce` followed by a read-back returns whatever was last put on the
     * screen and not necessarily what that call drew. That is invisible while
     * the question is "what does this look like" and fatal when it is "did this
     * change between two frames": measured, it smeared a boiling cow's shimmer
     * evenly across ticks and hid the fault this asserts.
     */
    const hand = await game.evaluate((pencil) => {
      const { game } = pencil;
      /*
       * One named cow, alone in the frame.
       *
       * Both halves of that matter. The field is laid out from a random seed,
       * so "the first cow" is a different cow with different neighbours every
       * run, and a suite that has already walked the walker about the valley
       * hands this one whatever state it finished in. Sending everybody else
       * off the map and picking the animal by where she lives makes the
       * picture the same picture twice — without which this measured anything
       * between nought and a hundred and twenty-seven pixels of "shimmer" on a
       * build that has none.
       */
      const cow = game.herd.animals
        .filter((a) => a.kind === 'cow')
        .sort((a, b) => a.homeX - b.homeX || a.homeY - b.homeY)[0];
      for (const a of game.herd.animals) {
        if (a === cow) continue;
        a.x = -9000;
        a.y = -9000;
      }
      cow.x = cow.homeX;
      cow.y = cow.homeY;
      /*
       * Beside her, not on her.
       *
       * Close enough that the colour has reached her, far enough that the
       * walker is below the patch being watched — and, the point of the
       * distance, out where the paint does not completely bury the pencil.
       * Standing on top of her hides the fault outright, which is worth
       * knowing: it only ever showed on animals towards the rim of the colour,
       * which early in a game is most of them.
       */
      game.teleport(cow.x, cow.y + 90);
      for (let i = 0; i < 30; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.camera.snapTo(cow.x, cow.y - 20);
      game.running = false;
      cow.face = 1;
      cow.moving = false;
      cow.state = 'graze';
      cow.timer = 999;
      // The camera only works out what it can see while a frame is being
      // drawn, so the snap above means nothing to `toScreenX` until one is.
      pencil.renderOnce();
      return {
        awake: cow.awake,
        buried: game.isBuriedInColour(cow.x, cow.y, 60),
        tick: pencil.boilTick(),
        clip: {
          x: Math.round(game.camera.toScreenX(cow.homeX) - 45),
          y: Math.round(game.camera.toScreenY(cow.homeY) - 55),
          width: 90,
          height: 60,
        },
      };
    });

    /*
     * Blank shots are dropped. Under a throwaway display the frame comes back
     * as bare paper now and then — a known environment fault, not this build's
     * — and a blank shot beside a real one reads as the whole cow having moved.
     */
    const { PNG } = await import('pngjs');
    const shots = [];
    for (let i = 0; i < 14; i++) {
      const png = PNG.sync.read(await game.page.screenshot({ clip: hand.clip }));
      let dark = 0;
      for (let p = 0; p < png.data.length; p += 4) {
        if (png.data[p] + png.data[p + 1] + png.data[p + 2] < 450) dark++;
      }
      if (dark > png.width * png.height / 100) shots.push(png.data);
      await new Promise((r) => setTimeout(r, 60));
    }
    const ticked = await game.evaluate((pencil) => {
      pencil.game.running = true;
      return pencil.boilTick();
    });

    let stir = 0;
    for (let i = 1; i < shots.length; i++) {
      let moved = 0;
      for (let p = 0; p < shots[i].length; p += 4) {
        const d =
          Math.abs(shots[i][p] - shots[i - 1][p]) +
          Math.abs(shots[i][p + 1] - shots[i - 1][p + 1]) +
          Math.abs(shots[i][p + 2] - shots[i - 1][p + 2]);
        if (d > 24) moved++;
      }
      if (moved > stir) stir = moved;
    }

    suite.ok(hand.awake, 'the colour has reached the cow being watched');
    suite.ok(!hand.buried, 'and has not buried her pencil drawing outright');
    suite.atLeast(shots.length, 8, 'enough frames of her came back to compare');
    suite.atLeast(ticked - hand.tick, 4, 'the ink clock ticked several times while she stood there');
    suite.atMost(stir, 8, 'and a grazing cow does not twitch as the hand re-inks her');

    // The ending grows the colour past anything ordinary play needs, and it
    // has to reach the edges of the window when it does. There used to be a
    // scratch surface sized for ordinary play in the way: until it was grown
    // with the blob the composite was silently clipped to whatever it could
    // hold, and a wide stripe of the screen never got its colour. The scratch
    // is gone now — the colour is drawn straight onto its own layer, which is
    // the size of the window — but the thing it broke is still worth pinning.
    const flood = await game.evaluate((pencil) => {
      const { game, renderer } = pencil;
      game.teleport(1300, 1330);

      const reach = () => {
        // The frame's own size in device pixels. It used to be read off the
        // #game canvas; the frame is one WebGL canvas Phaser owns now, and the
        // renderer is the thing that knows how big it is.
        const width = Math.round(renderer.width * renderer.scale);
        const height = Math.round(renderer.height * renderer.scale);
        const img = pencil.composited(0, 0, width, height);
        const mid = Math.floor(img.height / 2);
        let left = -1;
        let right = -1;
        for (let x = 0; x < img.width; x++) {
          const i = (mid * img.width + x) * 4;
          const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
          if (g > 90 && g > r * 1.15 && g > b * 1.15) {
            if (left < 0) left = x;
            right = x;
          }
        }
        const walker = Math.round(game.camera.toScreenX(game.walker.x) * renderer.scale);
        return { left: walker - left, right: right - walker };
      };

      const out = [];
      game.won = true;
      for (const radius of [700, 1000]) {
        Object.defineProperty(game, 'maskRadius', { value: radius, configurable: true });
        renderer.render(game.scene);
        const r = reach();
        // Only meaningful while both sides are still short of the screen edge.
        out.push({ radius, left: r.left, right: r.right });
      }
      delete game.maskRadius;
      game.won = false;
      return out;
    });

    const midFlood = flood[0];
    suite.atMost(
      Math.abs(midFlood.left - midFlood.right),
      120,
      'the flooding colour is not clipped to one side',
      `left ${midFlood.left}px, right ${midFlood.right}px`,
    );

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
