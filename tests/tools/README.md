# Instruments

Small tools for looking at a build. Not tests — nothing here passes or fails.
They exist because the questions they answer had been guessed at instead, and
every guess cost days.

## The rig

The frame is WebGL, and headless Chromium cannot make a WebGL context in every
environment — where it cannot, the game never appears and everything times out.
A display fixes it, and it does not have to be a screen:

```sh
nix-shell -p xorg-server --run '
  Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >/dev/null 2>&1 & XPID=$!
  sleep 3
  PENCIL_HEADED=1 DISPLAY=:99 node tests/tools/look.mjs
  kill $XPID'
```

`PENCIL_HEADED=1` is what makes `tests/harness.js` launch against that display
instead of headless. It is off by default, because on a workstation it would
open browser windows over whatever you were doing.

Every tool reads a build from `tmp/dist` unless told otherwise with `--dist=`:

```sh
npx vite build --outDir tmp/dist --emptyOutDir
```

Never build into `dist/` — that directory belongs to whoever publishes the game.

## The tools

### `look.mjs [scene]` — what does this frame cost?

Opens a build, prints the picture library, what the last frame uploaded and
created, and the worst frame of the session; writes a screenshot.

The two numbers that matter are `upload` and `new`. The whole render design is
built to hold both at zero once the valley is warm: a frame is meant to be
nothing but transforms. Anything else is a fault, and this is where it shows up
before a player ever feels it.

### `motion.mjs <scene>` — is this movement smooth, or is it stepped?

Samples where a moving thing actually is, once per frame, and prints the steps.

Run this on anything that moves. A screenshot cannot answer the question and
believing it could cost a rewrite: the hammock's sag was once baked as six
pictures, every single frame of it was correct, and the movement between them
read as a dropped frame. Measured, that version moved five frames out of
forty-four in jumps of four and five pixels; the version that replaced it moved
twenty-one of forty-four and never by more than two.

That is the shape to look for in the `steps` line — a run of zeroes and then a
jump is what a player calls lag, whatever the frame rate says.

### `compare.mjs <scene> --before=<dir>` — did the picture change?

Puts two builds into the same scripted moment and compares the pixels the game
drew. Use a worktree for the other build:

```sh
git worktree add tmp/before <sha>
(cd tmp/before && npx vite build --outDir tmp/dist --emptyOutDir)
node tests/tools/compare.mjs hammock --before=tmp/before/tmp/dist
```

It says nothing about motion. Two builds can agree on every still and disagree
completely on what happens between them.

## Scenes

`scenes.mjs` holds the scripted moments, so that "is it smooth" and "did it
change" ask about the same one, and so a moment worth looking at is written down
once. Adding one is a few lines; a scene may offer a `motion` probe, a `still`
region, or both.
