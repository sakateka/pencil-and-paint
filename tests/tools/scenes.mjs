/**
 * Scripted moments the tools can put the game into.
 *
 * Shared so that "how smooth is this" and "did this change the picture" ask
 * about exactly the same moment, and so that a moment worth looking at is
 * written down once rather than retyped into a scratch script each time.
 *
 * `begin`, `step` and `still` are stringified and rebuilt inside the page, so
 * none of them may close over anything in this file; they receive the debug
 * handle, the same `globalThis.pencil` the suites use. `find` runs out here,
 * over the pixels of a screenshot.
 */

/** The pale, warm cloth of the hammock against grass or paper. */
function isCloth(r, g, b) {
  return r > 190 && g > 175 && b > 140 && r - b > 20;
}

/** The walker's shirt. */
function isShirt(r, g, b) {
  return r > 150 && r - g > 60 && r - b > 60;
}

/** A frog's yellow front, the one warm thing out on the pond. */
function isFrogBelly(r, g, b) {
  return r > 215 && g > 165 && b < 130 && r - b > 90;
}

/**
 * A deep red, of which there are two in the valley worth tracking.
 *
 * The lion's mane is painted in four colours and the head under it is gold;
 * keeping only the red separates the mane from the face it rings, since gold
 * and orange are both far too green to pass this. The first paint pot is the
 * same kind of red, and nothing that grows out of doors is.
 */
function isDeepRed(r, g, b) {
  return r > 180 && g < 95 && b < 90;
}

/** A cow's muzzle: the one pink thing in a green field, and it rides the head. */
function isMuzzle(r, g, b) {
  return r > 190 && g > 110 && r - g > 45 && r - b > 45;
}

export const SCENES = {
  hammock: {
    describe: 'somebody lying down: the cloth sags under them over about a second',

    motion: {
      /**
       * A column of pixels a third of the way across the cloth.
       *
       * Not through the middle: that is exactly where the sleeper lies, and a
       * probe looking for pale cloth loses it the moment somebody fades in on
       * top of it. Off to one side the cloth is uncovered the whole way down.
       */
      begin: (pencil) => {
        const { game, renderOnce } = pencil;
        game.teleport(game.rest.x, game.rest.y + 40);
        game.camera.snapTo(game.rest.x, game.rest.y);
        game.running = false;
        game.rest.resting = false;
        game.rest.settled = 0;
        renderOnce();
        game.rest.resting = true;
        return {
          x: Math.round(game.camera.toScreenX(game.rest.x - 45)),
          y: Math.round(game.camera.toScreenY(game.rest.y - 90)),
          width: 1,
          height: 120,
        };
      },
      step: (pencil) => {
        pencil.game.rest.update(1 / 60, false);
        pencil.renderOnce();
      },
      /** The lowest row of cloth in that column. */
      find: (strip) => {
        let last = -1;
        for (let y = 0; y < strip.height; y++) {
          const i = y * strip.width * 4;
          if (isCloth(strip.data[i], strip.data[i + 1], strip.data[i + 2])) last = y;
        }
        return last;
      },
    },

    /** The hammock with somebody settled in it, held still. */
    still: (pencil) => {
      const { game, renderOnce } = pencil;
      game.teleport(game.rest.x, game.rest.y + 40);
      game.camera.snapTo(game.rest.x, game.rest.y);
      game.running = false;
      game.rest.resting = true;
      game.rest.settled = 1;
      game.rest.clock = 0;
      renderOnce();
      return {
        x: Math.round(game.camera.toScreenX(game.rest.x) - 150),
        y: Math.round(game.camera.toScreenY(game.rest.y) - 110),
        width: 300,
        height: 200,
      };
    },
  },

  herd: {
    describe: 'a cow bringing its head up out of the grass over about a second',

    motion: {
      /**
       * A box around the head, watching the one pink thing on a cow.
       *
       * The muzzle rides the head and nothing else in a field is that colour,
       * so its centroid answers "where is the head" to a fraction of a pixel —
       * which is the resolution the question needs. A head that comes up in
       * steps and a head that comes up smoothly look identical in a still.
       */
      begin: (pencil) => {
        const { game, renderOnce } = pencil;
        /*
         * The same cow every time, standing where it was put.
         *
         * Two things about a field are not seeded: the scatter that spreads the
         * animals out at the start, and the order they end up in once they have
         * been sorted by depth — so both "which cow" and "where is it" have to
         * be pinned, or two runs are looking at different animals in different
         * places and any difference between them means nothing.
         */
        const cow = game.herd.animals
          .filter((a) => a.kind === 'cow')
          .sort((a, b) => a.homeX - b.homeX || a.homeY - b.homeY)[0];
        cow.x = cow.homeX;
        cow.y = cow.homeY;
        game.teleport(cow.x, cow.y + 90);
        // Let the colour reach it, so there is a coloured cow to look at.
        for (let i = 0; i < 30; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        game.camera.snapTo(cow.x, cow.y - 20);
        game.running = false;
        cow.face = 1;
        cow.moving = false;
        cow.state = 'idle';
        cow.headDown = 1;
        renderOnce();
        return {
          x: Math.round(game.camera.toScreenX(cow.x + 18 * cow.scale)),
          y: Math.round(game.camera.toScreenY(cow.y - 50 * cow.scale)),
          width: 34,
          height: 56,
        };
      },
      /** The head rises on the game's own easing, one frame at a time. */
      step: (pencil) => {
        const cow = pencil.game.herd.animals
          .filter((a) => a.kind === 'cow')
          .sort((a, b) => a.homeX - b.homeX || a.homeY - b.homeY)[0];
        cow.headDown += (0 - cow.headDown) * Math.min(1, 3.2 / 60);
        pencil.renderOnce();
      },
      find: (strip) => {
        let sum = 0;
        let n = 0;
        for (let y = 0; y < strip.height; y++) {
          for (let x = 0; x < strip.width; x++) {
            const i = (y * strip.width + x) * 4;
            if (isMuzzle(strip.data[i], strip.data[i + 1], strip.data[i + 2])) {
              sum += y;
              n++;
            }
          }
        }
        return n ? sum / n : -1;
      },
    },

    /** A cow standing in its field, head down, held still. */
    still: (pencil) => {
      const { game, renderOnce } = pencil;
      const cow = game.herd.animals
        .filter((a) => a.kind === 'cow')
        .sort((a, b) => a.homeX - b.homeX || a.homeY - b.homeY)[0];
      cow.x = cow.homeX;
      cow.y = cow.homeY;
      game.teleport(cow.x, cow.y + 90);
      for (let i = 0; i < 30; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.camera.snapTo(cow.x, cow.y - 20);
      game.running = false;
      cow.face = 1;
      cow.moving = false;
      cow.headDown = 1;
      renderOnce();
      return {
        x: Math.round(game.camera.toScreenX(cow.x) - 80),
        y: Math.round(game.camera.toScreenY(cow.y) - 80),
        width: 160,
        height: 110,
      };
    },
  },

  cownorth: {
    describe: 'a cow walking north, across the one long horizontal edge she has',

    motion: {
      /*
       * The top of her back, which is where a shimmer was reported.
       *
       * Walking north moves that edge along its own normal, which is the worst
       * case for it: a long horizontal boundary sliding vertically shows every
       * fraction of a pixel it is resampled at.
       *
       * Time is slowed rather than the cow: a fifth of a frame per step, so
       * consecutive samples are a fifth of a pixel apart. At her own pace she
       * covers exactly one pixel a frame, which is the one speed at which a
       * sprite that snapped to whole pixels and one that did not would produce
       * the same numbers.
       */
      begin: (pencil) => {
        const { game, renderOnce } = pencil;
        const cow = game.herd.animals
          .filter((a) => a.kind === 'cow')
          .sort((a, b) => a.homeX - b.homeX || a.homeY - b.homeY)[0];
        cow.x = cow.homeX;
        cow.y = cow.homeY;
        // Everybody else off the map: two cows in one box is two edges.
        for (const a of game.herd.animals) {
          if (a === cow) continue;
          a.x = -9000;
          a.y = -9000;
        }
        game.teleport(cow.x, cow.y + 90);
        for (let i = 0; i < 30; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        game.camera.snapTo(cow.homeX, cow.homeY - 20);
        /*
         * The page's own loop is stopped and the field is stepped by hand.
         *
         * Left running, the wall-clock time a screenshot takes goes into the
         * simulation between samples, and she covers two or three pixels
         * between one frame and the next however small a `dt` the probe asks
         * for — which is exactly the resolution this is trying to get below.
         */
        game.running = false;
        cow.face = 1;
        cow.headDown = 0;
        renderOnce();
        /*
         * Only the columns right of her middle. The near blotch comes within a
         * pixel of the top of her back on the left, and a dark ellipse under
         * the edge being measured is a second edge for the probe to find.
         */
        return {
          x: Math.round(game.camera.toScreenX(cow.homeX + 1 * cow.scale)),
          y: Math.round(game.camera.toScreenY(cow.homeY - 34 * cow.scale) - 12),
          width: 12,
          height: 20,
        };
      },

      step: (pencil) => {
        const { game } = pencil;
        const cow = game.herd.animals
          .filter((a) => a.kind === 'cow')
          .sort((a, b) => a.homeX - b.homeX || a.homeY - b.homeY)[0];
        // Held on course: the field's own state machine would otherwise roll a
        // new destination partway through and turn her.
        cow.state = 'walk';
        cow.timer = 999;
        cow.targetX = cow.x;
        cow.targetY = cow.homeY - 4000;
        game.herd.update(1 / 300, {
          walkerX: game.walker.x,
          walkerY: game.walker.y,
          isAwakeAt: game.isAwakeAt,
          resolveCollisions: () => {},
        });
        game.camera.snapTo(cow.homeX, cow.homeY - 20);
        pencil.renderOnce();
      },

      /**
       * Where the grass gives way to her back, to a fraction of a pixel.
       *
       * Per column, because averaging a curved edge over columns that come and
       * go moves the answer on its own. The crossing is interpolated on how
       * green the pixel is, which is what actually fades across the edge.
       */
      find: (strip) => {
        const green = (x, y) => {
          const i = (y * strip.width + x) * 4;
          return strip.data[i + 1] - (strip.data[i] + strip.data[i + 2]) / 2;
        };
        let total = 0;
        let n = 0;
        for (let x = 0; x < strip.width; x++) {
          const grass = green(x, 0);
          const cow = green(x, strip.height - 1);
          if (grass - cow < 25) continue; // no edge in this column
          const mid = (grass + cow) / 2;
          for (let y = 1; y < strip.height; y++) {
            const above = green(x, y - 1);
            const below = green(x, y);
            if (above > mid && below <= mid) {
              total += y - 1 + (above - mid) / (above - below);
              n++;
              break;
            }
          }
        }
        return n ? total / n : -1;
      },
    },
  },

  pots: {
    describe: 'a paint pot bobbing on the spot, which is all it ever does',

    motion: {
      /**
       * The red jar, as the centroid of its own colour.
       *
       * The bob is three and a half pixels either way over three seconds, so at
       * sixty frames it moves about a tenth of a pixel at a time and there is no
       * other way to see it. This is the movement most likely to be quantised by
       * accident, because it is the smallest one in the game.
       */
      begin: (pencil) => {
        const { game, renderOnce } = pencil;
        const pot = game.pots.find((p) => p.hue === '#e8563f') ?? game.pots[0];
        // To one side, or the walker stands in front of the thing being watched.
        game.teleport(pot.x + 55, pot.y + 30);
        // Let the colour reach it: an unfound pot in the pencil is not red.
        for (let i = 0; i < 40; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        game.camera.snapTo(pot.x, pot.y);
        game.running = false;
        // Start where it is rising fastest, not at the top of the bob.
        pot.clock = -pot.phase / 2.2;
        renderOnce();
        return {
          x: Math.round(game.camera.toScreenX(pot.x) - 20),
          y: Math.round(game.camera.toScreenY(pot.y) - 34),
          width: 40,
          height: 44,
        };
      },
      step: (pencil) => {
        const pot = pencil.game.pots.find((p) => p.hue === '#e8563f') ?? pencil.game.pots[0];
        pot.clock += 1 / 60;
        pencil.renderOnce();
      },
      find: (strip) => {
        let sum = 0;
        let n = 0;
        for (let y = 0; y < strip.height; y++) {
          for (let x = 0; x < strip.width; x++) {
            const i = (y * strip.width + x) * 4;
            if (isDeepRed(strip.data[i], strip.data[i + 1], strip.data[i + 2])) {
              sum += y;
              n++;
            }
          }
        }
        return n ? sum / n : -1;
      },
    },

    /** A pot standing in the colour, at the bottom of its bob. */
    still: (pencil) => {
      const { game, renderOnce } = pencil;
      const pot = game.pots.find((p) => p.hue === '#e8563f') ?? game.pots[0];
      game.teleport(pot.x + 55, pot.y + 30);
      for (let i = 0; i < 40; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.camera.snapTo(pot.x, pot.y);
      game.running = false;
      pot.clock = -pot.phase / 2.2;
      renderOnce();
      return {
        x: Math.round(game.camera.toScreenX(pot.x) - 60),
        y: Math.round(game.camera.toScreenY(pot.y) - 70),
        width: 120,
        height: 110,
      };
    },
  },

  lion: {
    describe: 'the lion lifting its head to look at you, over about a second',

    motion: {
      /**
       * The centre of the mane, as the centroid of its red strokes.
       *
       * The head does not change shape when it comes up — it travels — so the
       * whole question about it is whether it travels smoothly, and a centroid
       * answers that to a fraction of a pixel where a silhouette cannot.
       *
       * A column will not do, which cost an evening: the mane is twenty-two
       * separate strokes thrown outward, not a solid ring, and the head slides
       * six pixels sideways as it lifts — so a fixed column threads between two
       * strokes halfway through and starts reporting the top of the face
       * instead, which reads as an eleven-pixel jump that never happened. The
       * box has to hold the whole ring at both ends of the movement.
       */
      begin: (pencil) => {
        const { game, renderOnce } = pencil;
        const { lion } = game;
        game.teleport(lion.x, lion.y + 70);
        // Let the colour reach it: the graphite lion has no mane worth finding.
        for (let i = 0; i < 40; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        game.camera.snapTo(lion.x, lion.y);
        game.running = false;
        lion.clock = 0;
        lion.alert = 0;
        renderOnce();
        return {
          x: Math.round(game.camera.toScreenX(lion.x - 35)),
          y: Math.round(game.camera.toScreenY(lion.y - 50)),
          width: 60,
          height: 62,
        };
      },
      /** It wakes on its own easing, with the walker standing where it is. */
      step: (pencil) => {
        const { lion } = pencil.game;
        lion.update(1 / 60, lion.x, lion.y + 70, true);
        pencil.renderOnce();
      },
      find: (strip) => {
        let sum = 0;
        let n = 0;
        for (let y = 0; y < strip.height; y++) {
          for (let x = 0; x < strip.width; x++) {
            const i = (y * strip.width + x) * 4;
            if (isDeepRed(strip.data[i], strip.data[i + 1], strip.data[i + 2])) {
              sum += y;
              n++;
            }
          }
        }
        return n ? sum / n : -1;
      },
    },

    /** The lion awake and looking at you, held still. */
    still: (pencil) => {
      const { game, renderOnce } = pencil;
      const { lion } = game;
      game.teleport(lion.x, lion.y + 70);
      for (let i = 0; i < 40; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.camera.snapTo(lion.x, lion.y);
      game.running = false;
      lion.clock = 0;
      lion.alert = 1;
      renderOnce();
      return {
        x: Math.round(game.camera.toScreenX(lion.x) - 70),
        y: Math.round(game.camera.toScreenY(lion.y) - 70),
        width: 140,
        height: 110,
      };
    },
  },

  frog: {
    describe: 'a frog taking fright and going under, which lasts a third of a second',

    motion: {
      /**
       * The frog's yellow front, over the water it is about to be under.
       *
       * A third of a second is twenty frames, and the old path gave the whole
       * leap four pictures — so this is the probe that says whether a dive is a
       * leap or a slideshow.
       */
      begin: (pencil) => {
        const { game, renderOnce } = pencil;
        const frog = game.herd.animals
          .filter((a) => a.kind === 'frog')
          .sort((a, b) => a.homeX - b.homeX || a.homeY - b.homeY)[0];
        /*
         * The whole valley in colour, because a frog cannot be walked up to:
         * it sits out on the water and the bank holds you a long way off, far
         * enough that the colour never reaches it.
         */
        game.collectAll();
        game.teleport(frog.x, frog.y + 70);
        for (let i = 0; i < 60; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
        game.camera.snapTo(frog.x, frog.y - 20);
        game.running = false;
        frog.face = 1;
        frog.dive = 0;
        frog.diving = true;
        renderOnce();
        return {
          x: Math.round(game.camera.toScreenX(frog.x) - 20),
          y: Math.round(game.camera.toScreenY(frog.y) - 40),
          width: 60,
          height: 50,
        };
      },
      step: (pencil) => {
        const frog = pencil.game.herd.animals
          .filter((a) => a.kind === 'frog')
          .sort((a, b) => a.homeX - b.homeX || a.homeY - b.homeY)[0];
        frog.dive = Math.min(1, frog.dive + 1 / 60 / 0.34);
        pencil.renderOnce();
      },
      /** Where its front is, up and along. */
      find: (strip) => {
        let sum = 0;
        let n = 0;
        for (let y = 0; y < strip.height; y++) {
          for (let x = 0; x < strip.width; x++) {
            const i = (y * strip.width + x) * 4;
            if (isFrogBelly(strip.data[i], strip.data[i + 1], strip.data[i + 2])) {
              sum += y;
              n++;
            }
          }
        }
        return n ? sum / n : -1;
      },
    },
  },

  bird: {
    describe: 'the bird on the tree, once the valley is finished',
    still: (pencil) => {
      const { game, renderOnce } = pencil;
      game.collectAll();
      game.teleport(game.rest.x, game.rest.y + 60);
      for (let i = 0; i < 240; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.camera.snapTo(game.rest.perchX, game.rest.perchY);
      game.running = false;
      renderOnce();
      return {
        x: Math.round(game.camera.toScreenX(game.rest.perchX) - 60),
        y: Math.round(game.camera.toScreenY(game.rest.perchY) - 45),
        width: 120,
        height: 90,
      };
    },
  },

  mirage: {
    describe: 'the mirage cloud hanging in the sky over the north, drifting on its own breath',

    motion: {
      /**
       * The left edge of the cloud, against the sky it hangs in.
       *
       * The cloud is the palest thing up there and the sky behind it is a
       * gradient, so the probe carries its own reference: the rightmost column
       * of the box is pure sky for every row the cloud can reach, and a column
       * counts as cloud when its red channel stands above that row's sky by
       * more than the sky's own variation — red is the channel white moves
       * hardest. The bob is vertical and this is a horizontal measure, so what
       * it watches is the drift and nothing else.
       */
      begin: (pencil) => {
        const { game, renderOnce } = pencil;
        const v = game.vigil;
        game.teleport(v.x, v.y + 60);
        game.camera.snapTo(v.elephantX, v.elephantY - 140);
        game.running = false;
        v.lit = true;
        v.beastClock = 0;
        renderOnce();
        return {
          x: Math.round(game.camera.toScreenX(v.elephantX) - 210),
          y: Math.round(game.camera.toScreenY(v.elephantY - 290)),
          width: 420,
          height: 300,
        };
      },
      /** The cloud drifts on the beast's clock, which runs only when lit. */
      step: (pencil) => {
        const v = pencil.game.vigil;
        v.lit = true;
        v.beastClock += 1 / 60;
        pencil.renderOnce();
      },
      find: (strip) => {
        let left = -1;
        for (let x = 0; x < strip.width && left < 0; x++) {
          for (let y = 0; y < strip.height; y++) {
            const i = (y * strip.width + x) * 4;
            const j = (y * strip.width + (strip.width - 1)) * 4;
            // Absolute, because the two media pull opposite ways: the cloud is
            // brighter red than the blue sky it hangs in, and darker red than
            // the paper it is rubbed onto.
            if (Math.abs(strip.data[i] - strip.data[j]) > 18) {
              left = x;
              break;
            }
          }
        }
        return left;
      },
    },

    /** The resting cloud, held still. */
    still: (pencil) => {
      const { game, renderOnce } = pencil;
      const v = game.vigil;
      game.teleport(v.x, v.y + 60);
      game.camera.snapTo(v.elephantX, v.elephantY - 140);
      game.running = false;
      v.lit = true;
      v.beastClock = 0;
      renderOnce();
      return {
        x: Math.round(game.camera.toScreenX(v.elephantX) - 210),
        y: Math.round(game.camera.toScreenY(v.elephantY - 290)),
        width: 420,
        height: 300,
      };
    },
  },

  sun: {
    describe: 'the sun coming over the top-right corner of the paper, flames and all',

    /**
     * The north-east corner, camera as high as it is allowed to go.
     *
     * The sun's centre is off the map by design and only its near quarter is
     * ever on screen, so there is exactly one place to stand to see it at all:
     * over at its own longitude with the view lifted to the ceiling of the sky.
     * The whole valley is collected first, because the flames are two flat
     * fills in paint and a thin pencil ring outside the colour — and it is the
     * paint that carries the size.
     */
    still: (pencil) => {
      const { game, renderOnce } = pencil;
      game.collectAll();
      game.teleport(2792, 100);
      for (let i = 0; i < 30; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.camera.snapTo(2792, game.camera.viewHeight / 2 - 530);
      game.running = false;
      renderOnce();
      return { x: Math.round(game.camera.toScreenX(2540)), y: 0, width: 520, height: 260 };
    },
  },

  elephant: {
    describe: 'the elephant after its arrival, standing in the sky over the north',

    /**
     * Summoned, fully arrived, held at one instant of its breath.
     *
     * The recipe is the vigil suite's: the whole valley in colour, so the beast
     * is lit and allowed to arrive, then the camera carried up to it. This is
     * the frame to compare builds on — every part of the animal is in it, at
     * full solidity, at one fixed phase of the bob.
     */
    still: (pencil) => {
      const { game, renderOnce } = pencil;
      const v = game.vigil;
      game.restart();
      game.collectAll();
      game.teleport(v.x, v.y + 30);
      game.summonElephant();
      for (let i = 0; i < 60 * 12; i++) game.advance(1 / 60, { direction: () => ({ x: 0, y: 0 }) });
      game.running = false;
      v.lit = true;
      v.beastClock = 0;
      game.camera.snapTo(v.elephantX, v.elephantY - 140);
      renderOnce();
      return {
        x: Math.round(game.camera.toScreenX(v.elephantX) - 190),
        y: Math.round(game.camera.toScreenY(v.elephantY - 290)),
        width: 380,
        height: 330,
      };
    },
  },

  walk: {
    describe: 'walking west, which is the motion the camera has to follow',

    motion: {
      /** A band of pixels across the walker's chest. */
      begin: (pencil) => {
        const { game, renderOnce } = pencil;
        /*
         * Running, which this used to turn off — and `advance` counts elapsed
         * and then returns, so every step of the probe was a walker standing
         * perfectly still. It reported a biggest step of half a pixel and read
         * as a clean pass; what it was measuring was the noise on a screenshot
         * of somebody who had not moved.
         */
        game.running = true;
        const west = { direction: () => ({ x: -1, y: 0 }) };
        for (let i = 0; i < 30; i++) game.advance(1 / 60, west);
        renderOnce();
        return {
          x: Math.round(game.camera.toScreenX(game.walker.x) - 120),
          y: Math.round(game.camera.toScreenY(game.walker.y) - 30),
          width: 240,
          height: 6,
        };
      },
      step: (pencil) => {
        pencil.game.advance(1 / 60, { direction: () => ({ x: -1, y: 0 }) });
        pencil.renderOnce();
      },
      /** Where the shirt is, across that band. */
      find: (strip) => {
        let sum = 0;
        let n = 0;
        for (let y = 0; y < strip.height; y++) {
          for (let x = 0; x < strip.width; x++) {
            const i = (y * strip.width + x) * 4;
            if (isShirt(strip.data[i], strip.data[i + 1], strip.data[i + 2])) {
              sum += x;
              n++;
            }
          }
        }
        return n ? sum / n : -1;
      },
    },
  },
};

export const SCENE_NAMES = Object.keys(SCENES);
