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

  walk: {
    describe: 'walking west, which is the motion the camera has to follow',

    motion: {
      /** A band of pixels across the walker's chest. */
      begin: (pencil) => {
        const { game, renderOnce } = pencil;
        game.running = false;
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
