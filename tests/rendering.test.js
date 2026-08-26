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
        game.camera,
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
      const building = tall.find((o) => o.bounds.y1 - o.bounds.y0 > 180);
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
        const ctx = document.querySelector('#game').getContext('2d');
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
    suite.atLeast(
      +(profile.right.skinMax - profile.right.hairMax).toFixed(1),
      1.5,
      'facing right, the nose leads the hairline',
    );
    suite.atLeast(
      +(profile.left.hairMin - profile.left.skinMin).toFixed(1),
      1.5,
      'facing left, the nose leads the hairline',
    );

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
        const ctx = document.querySelector('#game').getContext('2d');
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
    const cycle = await game.evaluate((pencil) => pencil.walkCycle);
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

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
