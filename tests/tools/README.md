# Instruments

Small tools for looking at a build. Not tests — nothing here passes or fails.
They exist because the questions they answer had been guessed at instead, and
every guess cost days.

## The rig

The frame is WebGL, and headless Chromium cannot make a WebGL context in every
environment — where it cannot, the game never appears and everything times out.
A display fixes it, and it does not have to be a screen. `npm run display` puts
a throwaway one behind whatever you ask it to run, and takes it away again:

```sh
npm run display -- node tests/tools/look.mjs herd
```

It fetches Xvfb and the graphics driver from a nix shell if they are not on the
PATH already, picks a free display number, and sets `PENCIL_HEADED=1` so the
harness launches against it. `PENCIL_KEEP_DISPLAY=1` uses the display you
already have instead, which on a real desktop means you can watch.

Most of the test suite needs none of this — `npm test` runs headless in a couple
of seconds, because the suites that do not read pixels open the game with
`?nodraw` and it never makes a context at all. The instruments here are the
other kind by definition: they are all about the picture.

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

`since load` names who did it — the cel that repainted, the sprite or stamp that
was made. Both numbers name a fault without naming a culprit otherwise, and the
things that raise them want quite different fixes. It covers the session rather
than the frame, so the warm-up's own sprites are in it; the way to tell those
apart from a fault is that warm-up appears once and a fault appears again the
next time you look.

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

### `bakedsteps.mjs <look id>` — is this cycle drawn finely enough?

`motion.mjs` for the things the screen cannot show. A cycle that became a row of
drawings steps by whatever the gap between two consecutive drawings is, and the
rule is that no step is bigger than a pixel — but the owl's wing is a few pixels
of dark against a tree that is also dark, and a probe counting pixels over a
threshold there reported "held still 44 frames, biggest step 1.00px" for a wing
that was moving the whole time.

So ask the pictures instead. Each is read out of the library and its ink
centroid taken, weighted by alpha, and the distance to the one before it
printed, in world units:

```sh
npm run display -- node tests/tools/bakedsteps.mjs owl:wings
```

## Scenes

`scenes.mjs` holds the scripted moments, so that "is it smooth" and "did it
change" ask about the same one, and so a moment worth looking at is written down
once. Adding one is a few lines; a scene may offer a `motion` probe, a `still`
region, or both.
