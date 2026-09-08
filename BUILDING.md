# Building

TypeScript, bundled by Vite. No runtime dependencies — the built site is one
HTML file and one script, and makes no network requests once loaded.

```sh
npm install
npm run dev        # dev server with hot reload, http://localhost:5173
npm run build      # typecheck, then bundle to dist/
npm run preview    # serve the built output
npm run typecheck  # tsc --noEmit
```

## Playing

| Input | Action |
| --- | --- |
| `W A S D` / arrow keys | walk |
| drag | walk (touch) |
| `R` | new world — the pots are scattered afresh |
| `F` | performance readout: fps, frame time, draw time, and what the frame uploaded, made and baked — the last three read zero on a warm valley |
| `` ` `` | development panel — **only when served from localhost** |

The development panel has shortcuts for testing: collect every pot at once (to
see the finished world without walking the map), flood the colour without
ending the game, restart, and teleports to the farm, the garden, the pond and
the spawn. It is built only when `location.hostname` is local, so it does not
exist on the published site — [a test](tests/devpanel.test.js) serves the same
build under a real hostname and asserts its absence.

## Testing

Playwright drives the real build in a headless browser. Most suites assert
behaviour rather than pixels — that the walker cannot end up inside a building,
that a sheep outside the colour does not move *or age* — and those run without a
display at all, against `?nodraw`, in about four seconds. The ten that do read
pixels are listed in one place in [`tests/run.js`](tests/run.js) and want a real
GPU; `npm run test:frame` puts a display under them.

```sh
npx playwright install chromium
npm test           # the quick group: no display, no GPU, about four seconds
npm run test:frame # the ones that read pixels; brings up its own Xvfb
npm run test:all   # both
```

Each run builds its own tree under `tmp/` and tests that, so what is under test
is always the current source. `PENCIL_DIST=…` points a run at a build you
already have, which takes one suite from forty seconds to under one.

Suites live in [`tests/`](tests/) and are plain ES modules over a
[30-line assertion helper](tests/assert.js) — no framework. They reach into the
simulation through a small [debug handle](src/debug.ts) that the game itself
never consults.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). That needs
**Settings → Pages → Source → GitHub Actions** set once on the repository;
Pages cannot be enabled from repository files alone.

## How it fits together

```
src/
  core/       maths, seeded rng, colour, polygons, canvas helpers
  media/      the two media: baked pencil, live ink, cached sprites
  world/      scenery, buildings, the farm, terrain, layout, baking
  entities/   the walker, the livestock, the pots, particles
  render/     camera, the colour mask, the stage, the picture library
  systems/    collision, input, the performance readout
  game.ts     rules and state for one playthrough
  main.ts     boot and the frame loop
```

Four ideas carry most of the weight.

**One shape, two media.** Scenery describes itself once, as polygons and a fill
colour, and renders as either a colour illustration or a pencil drawing
depending on which layer is asking. `paint()` in
[`media/pencil.ts`](src/media/pencil.ts) is that seam; hatch density is derived
from the fill's luminance, which is how a flat colour becomes tone.

**Nothing outside the colour is running.** Distant livestock hold their pose,
their clocks stopped: out in the graphite a thing is a *drawing*, and a drawing
does not move. This is a rule about what the game is rather than an
optimisation, and it happens to be the largest single saving in the frame. When
you add something that animates, the question to ask is what gates it, and
whether that gate covers the whole drawing rather than just its origin —
`Game.isWhollyLit` exists for the ones too big to ask about as a point.

**The frame is three cameras over one WebGL canvas.** The valley is baked into
tiles at load, handed to the GPU once, and thereafter the camera moves instead
of the picture; the colour layer is cut to the light by one multiply in a
fragment shader. Nothing composites the screen on the CPU, and there is no
dirty rectangle any more — both were how this worked on Canvas2D, and both were
measured costing more than the thing they saved. See
[`render/stage.ts`](src/render/stage.ts).

**Everything hand-drawn is a picture baked before play starts.** A `Look`
([`render/looks.ts`](src/render/looks.ts)) must be able to *list* every drawing
it can ever show; the list is baked under the loading screen, and being on
screen afterwards costs a transform and nothing else. Two and a bit megabytes
for the whole game, against the eighty megabytes a second the old
repaint-as-you-go path spent. The requirement that the list be finite is the
whole safety property: a field that changes continuously cannot be listed, so it
cannot get into a picture by accident, which is exactly how the old design lost
eighty megabytes a second to a private counter nobody remembered.

### The invariant: after the loading screen, the GPU gets nothing

This is a requirement, not a target.

> Once the loading screen is gone, the game bakes no canvas, creates no
> rendering object, and uploads not one byte to the video card for the rest of
> the session. A frame is transforms.

Not "not in a settled frame" — **not at all**: not the first time a thing is
seen, not when the camera enters a corner of the map it has not visited, not
when somebody first lies down in the hammock. Everything that can ever be shown
is listed, drawn and handed over under the progress bar, and nothing is ever
thrown away afterwards, because a thing that gets evicted is a thing that gets
built again. That is where the microfreezes were: an ordinary frame costs 0.4 ms
and a frame that bakes one tree costs 17 to 22.

**There is exactly one exception, and it is the whole reason the mechanism it
uses still exists.** The picture the player drew at the easel did not exist when
the valley was baked, so it is painted once, when it changes, into the one
remaining cel ([`Stage.cel`](src/render/stage.ts)). Once per drawing, at the
moment the drawing board closes. Nothing else may use that path.

**How to check.** Press `F`. The line `upload … new … bakes …` must read zero,
and go on reading zero while you walk, lie down, fish, climb the tree and cross
the map. `renderer.uploadReport()` and `renderer.createReport()` name the
culprit when one of them is not zero; `tmp/` has short probes that drive the
page and print those two per frame.

**The five ways it has actually been broken**, most of them found by walking
away from something and coming back:

- **Eviction.** Sprites were dropped after three seconds unused, and the cel
  after 180 frames. Walking north out of sight of the hammock and back down
  destroyed the easel's cel and rebuilt it — a new texture and all 67,600 pixels
  of it, on the frame it reappeared, every crossing. Nothing is evicted now.
  Hide it; never destroy it.
- **A pool that grows.** `showLook` and `showRope` take their objects from
  pools, and a pool that fills on demand is a pool that fills during a walk —
  the picture pool climbed from 25 to 50 crossing the valley. Pools are filled
  at warm-up to a *measured* peak (`LOOK_POOL`, `STAMP_POOL`), and going over
  now shows up in `new`.
- **A creator that does not report.** Those same two were the only ones in the
  stage that never called `noteCreated`, so they grew while the readout said
  `new 0`. Anything that can bring an object into being calls it, so that the
  next mistake of this kind is visible rather than silent.
- **A shader compiled by a frame.** The one the readout could not see: Phaser
  picks a batch shader by *how many distinct textures ended up in one flush*, a
  number that is a fact about a frame rather than about any drawing, and
  compiles a program the first time each count comes up. Measured walking with
  thirteen pots lit: five programs built after play started, on frames 24, 27,
  39, 172 and 246, costing 104ms, 1.9ms, 2ms, 9.6ms and 2ms — while `upload`,
  `new` and `bakes` all read zero, because none of those count a program. Every
  count is built at warm-up now (`Stage.warmShaders`).
- **A shared slot with per-instance state.** Ropes used to be handed out by
  draw order, so the mirage's 26-point cloud and the hammock's 23-point cloth
  took turns in one slot, and each swap made Phaser rebuild the vertex, uv,
  colour and alpha buffers. Ropes are kept per picture now. Images may be
  pooled because an image carries nothing between frames; anything that does
  carry something must be keyed by what it draws.

**Lazily is never the answer.** If something cannot be listed in advance, that
is a fact about the design of the thing, and the thing changes — the campfire
was "three tongues on six sinusoids, nothing here lines up twice" until its
frequencies were pulled to whole multiples of one period, and it became what
drawn fire has always been: a 30-picture cycle.

### Adding something that moves

The rule, learned the hard way on a hammock:

> **A picture is a drawing that is genuinely different. A deformation is not.**

A walk cycle is pictures. A head coming up out of the grass is a picture — no,
it is a *translate*, because the head does not change shape as it rises. Cloth
sagging under somebody is one picture being bent by geometry. Baking the
in-between states of a smooth movement is not cheaper smoothness; it is a
stutter you built on purpose, and it costs more memory than the thing it
replaced.

So, in order:

1. **Sort each dimension into picture or transform.** Position, scale, mirror,
   alpha, tint, rotation about a hinge and a vertical breath are transforms.
   What genuinely looks like another drawing — a step, a blink, a wingbeat, the
   pencil's boil — is a picture.
2. **Write the `Look`**, in `render/looks/`, drawing at its own origin, and
   register it in `Renderer`'s constructor. `reach` sizes the scratch it is
   measured in: count it from the actual ink *after* every rotation and scale
   the bake applies, and leave a dozen units spare. A clipped ear is forever.
3. **Run [`tests/tools/motion.mjs`](tests/tools/README.md) on it.** A
   screenshot cannot tell a smooth movement from a stepped one; this can. Every
   drawing that moves has to hold under a pixel a frame.
4. **Watch the readout** (`F`): `upload`, `new` and `bakes` are all meant to
   read zero for ever once the valley is warm. If one of them is not zero,
   `renderer.uploadReport()` and `createReport()` name the culprit.

How many pictures a cycle gets is the look's own business — there is no engine
frequency any more, and there used to be, which is why a frog's dive got four
frames. A step is eight pictures, an eyelid twelve, the campfire thirty.
[`bakedsteps.mjs`](tests/tools/README.md) is how you find out whether that is
enough: no two consecutive drawings more than about a unit apart.

Four things the bake will catch you with, all of them found by being caught:

- **Everything baked needs a transparent margin.** A sprite's edge is a quad
  edge and is not antialiased; only the *texture* is filtered. Cut tight to the
  ink, a picture can only stand on whole pixels, which is why a cow's back
  juddered while a sheep's did not — the sheep's top row of ink happened to be
  semi-transparent and the cow's did not. `BLEED` in
  [`looks.ts`](src/render/looks.ts) adds the ring, and
  [`tests/looks.test.js`](tests/looks.test.js) fails if any picture has ink on
  it.
- **Bake on whole pixels.** An odd scratch size puts the drawing's middle on a
  half pixel, the sprite lands half a texel off the grid its strokes were drawn
  on, and every edge of it blurs.
- **Bake at the size it is drawn at.** The owl is drawn at the scale of
  whichever tree it got, so a one-to-one picture was stretched 6% on the way to
  the screen — a resample of the whole bird. That is what `grain` is for, and it
  is why the owl registers its look at warm-up rather than in the constructor.
- **The graphite copy has its own key.** Every drawing is drawn twice, and the
  pencil pass ignores things the colour pass cares about (and boils where the
  colour does not). Say so in `key`, or you bake three identical pictures — or,
  worse, leave a pencil outline jittering a pixel underneath its own paint,
  which is what "the cows shimmer" turned out to be.

The awkward one is depth. The world is baked flat, so the walker is painted over
it, which is how you end up walking across a roof. Making roofs solid fixed it
and made the houses feel like bunkers. Instead, tall scenery standing in front
of you is drawn on top of you from its own transparent copy — and because every
object stores the rng seed it was baked with, that copy reproduces the same
strokes exactly and lands pixel-for-pixel on the original. Those copies are made
under the loading screen too: made during a walk, each one cost a frame of
twenty milliseconds.
