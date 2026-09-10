import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * The camera is intentionally slower to answer than the walker.
 *
 * These checks use the camera directly so they can distinguish a dead zone
 * from a merely slow lerp, and acceleration from a position-based spring.
 */
export async function run(url) {
  const suite = new Suite('camera');
  const game = await openGame(url);

  try {
    const motion = await game.evaluate((pencil) => {
      const { game, renderer } = pencil;
      game.running = false;
      const camera = game.camera;
      const dt = 1 / 60;
      const frame = () => camera.frame(renderer.width, renderer.height, renderer.scale);

      camera.snapTo(1000, 1000);
      frame();
      const still = camera.x;
      for (let i = 0; i < 20; i++) camera.follow(1100, 1000, dt);
      const inside = camera.x - still;

      camera.snapTo(1000, 1000);
      frame();
      const accelerating = [];
      for (let i = 0; i < 30; i++) {
        camera.follow(1500, 1000, dt);
        accelerating.push(camera.x);
      }
      const accelerationDeltas = accelerating.slice(1).map((x, i) => x - accelerating[i]);

      for (let i = 0; i < 240; i++) camera.follow(1500, 1000, dt);
      const settled = camera.x;
      camera.follow(1500, 1000, dt);
      const settledDelta = camera.x - settled;
      const deadZone = renderer.width * 0.09;

      const beforeReverse = [];
      camera.snapTo(1000, 1000);
      frame();
      for (let i = 0; i < 30; i++) {
        camera.follow(1500, 1000, dt);
        beforeReverse.push(camera.x);
      }
      const movingForward = beforeReverse[beforeReverse.length - 1];
      const reverse = [];
      for (let i = 0; i < 240; i++) {
        camera.follow(700, 1000, dt);
        reverse.push(camera.x);
      }
      const reverseGoal = 700 + deadZone;

      camera.snapTo(700.25, 900.75);
      const resetRemainder = { subX: camera.subX, subY: camera.subY };
      frame();
      const snapped = {
        x: camera.x,
        y: camera.y,
        subX: camera.subX,
        subY: camera.subY,
      };
      const beforeSnapFollow = { x: camera.x, y: camera.y };
      camera.follow(700.25, 914.75, dt);

      return {
        inside,
        accelerationDeltas: accelerationDeltas.slice(0, 8),
        settled,
        settledGoal: 1500 - deadZone,
        settledDelta,
        reverseStart: reverse[0],
        reverseMin: Math.min(...reverse),
        reverseGoal,
        reverseEnd: reverse[reverse.length - 1],
        reverseEndDelta: reverse[reverse.length - 1] - reverse[reverse.length - 2],
        movingForward,
        snap: snapped,
        resetRemainder,
        snapFollowDelta: {
          x: camera.x - beforeSnapFollow.x,
          y: camera.y - beforeSnapFollow.y,
        },
      };
    });

    suite.equal(motion.inside, 0, 'the walker can move inside the dead zone without moving the camera');
    suite.ok(
      motion.accelerationDeltas[1] > motion.accelerationDeltas[0],
      'the camera starts from zero speed and accelerates',
      motion.accelerationDeltas.slice(0, 3).map((v) => v.toFixed(3)).join(', '),
    );
    suite.ok(
      Math.abs(motion.settled - motion.settledGoal) < 0.01,
      'the camera catches up to the near edge of the zone',
      `${motion.settled.toFixed(2)} (goal ${motion.settledGoal.toFixed(2)})`,
    );
    suite.equal(motion.settledDelta, 0, 'the camera comes to rest without residual drift');
    suite.ok(
      motion.reverseStart > motion.movingForward,
      'a change of direction answers with its old momentum',
      `${motion.movingForward.toFixed(2)} to ${motion.reverseStart.toFixed(2)}`,
    );
    suite.ok(
      motion.reverseMin >= motion.reverseGoal - 0.01,
      'the camera does not overshoot while reversing',
      `${motion.reverseMin.toFixed(2)} (goal ${motion.reverseGoal.toFixed(2)})`,
    );
    suite.ok(
      Math.abs(motion.reverseEnd - motion.reverseGoal) < 0.01 && motion.reverseEndDelta === 0,
      'the reversed camera settles softly',
      `${motion.reverseEnd.toFixed(2)} (last step ${motion.reverseEndDelta})`,
    );
    suite.equal(motion.snap.x, 700.25, 'snapTo moves the camera instantly');
    suite.equal(motion.snap.y, 900.75, 'snapTo also moves the vertical axis instantly');
    suite.equal(motion.resetRemainder.subX, 0, 'snapTo clears the old horizontal sub-pixel remainder');
    suite.equal(motion.resetRemainder.subY, 0, 'snapTo clears the old vertical sub-pixel remainder');
    suite.equal(motion.snapFollowDelta.x, 0, 'snapTo clears horizontal momentum');
    suite.equal(motion.snapFollowDelta.y, 0, 'snapTo clears vertical momentum');

    const pan = await game.evaluate((pencil) => {
      const camera = pencil.game.camera;
      const run = (steps) => {
        camera.snapTo(1000, 1000);
        let previousSpeed = 0;
        let maxSpeedChange = 0;
        let reversed = false;
        let atOne = 0;
        for (let i = 0; i < steps.length; i++) {
          const before = camera.y;
          camera.focus(1000, 414, steps[i]);
          const speed = (before - camera.y) / steps[i];
          maxSpeedChange = Math.max(maxSpeedChange, Math.abs(speed - previousSpeed));
          reversed ||= speed < -1e-8;
          previousSpeed = speed;
          if (i === 59) atOne = camera.y;
        }
        return { y: camera.y, maxSpeedChange, reversed, atOne };
      };
      const sixty = run(Array(900).fill(1 / 60));
      const atThree = [30, 60, 144].map((fps) => run(Array(fps * 3).fill(1 / fps)).y);
      const uneven = run(Array.from({ length: 120 }, () => [1 / 120, 1 / 24]).flat()).y;
      return { sixty, atThree, uneven, regular: run(Array(360).fill(1 / 60)).y };
    });

    suite.atMost(pan.sixty.maxSpeedChange, 15, 'the sky pan changes speed gently on every frame');
    suite.equal(pan.sixty.reversed, false, 'the sky pan never bounces back');
    suite.ok(pan.sixty.atOne > 760 && pan.sixty.atOne < 1000, 'the first second eases into the climb');
    suite.equal(pan.sixty.y, 400, 'the pan settles at its destination');
    suite.atMost(
      Math.max(...pan.atThree) - Math.min(...pan.atThree),
      1e-7,
      '30, 60 and 144 fps follow the same pan',
    );
    suite.atMost(Math.abs(pan.uneven - pan.regular), 1e-7, 'uneven frames keep the same gentle trajectory');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
