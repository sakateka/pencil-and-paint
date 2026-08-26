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
| `F` | performance readout: fps, frame time, render scale, per-stage costs |
| `` ` `` | development panel — **only when served from localhost** |

The development panel has shortcuts for testing: collect every pot at once (to
see the finished world without walking the map), flood the colour without
ending the game, restart, and teleports to the farm, the garden, the pond and
the spawn. It is built only when `location.hostname` is local, so it does not
exist on the published site — [a test](tests/devpanel.test.js) serves the same
build under a real hostname and asserts its absence.

## Testing

Playwright drives the real build in a headless browser. The suites assert
behaviour, not pixels — that the walker cannot end up inside a building, that a
sheep outside the colour does not move *or age*, that the renderer composites a
fraction of the screen rather than all of it.

```sh
npm run build      # tests run against dist/, so build first
npx playwright install chromium
npm test
```

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
  render/     camera, the colour mask, the frame compositor
  systems/    collision, input, adaptive resolution
  game.ts     rules and state for one playthrough
  main.ts     boot and the frame loop
```

Three ideas carry most of the weight.

**One shape, two media.** Scenery describes itself once, as polygons and a fill
colour, and renders as either a colour illustration or a pencil drawing
depending on which layer is asking. `paint()` in
[`media/pencil.ts`](src/media/pencil.ts) is that seam; hatch density is derived
from the fill's luminance, which is how a flat colour becomes tone.

**The colour is a mask, and it is small.** The lit area only ever covers a blob
around the walker, so compositing the whole screen would be mostly wasted. The
renderer works inside a dirty rectangle tracking that blob — roughly a tenth of
the pixels on a large display, and the cost scales with the colour radius
instead of the size of the window.

**Nothing outside the colour is running.** Distant livestock hold their pose,
their clocks stopped, and are cached as sprites — a still drawing is the same
pixels every frame. This is a rule about what the game *is*, and it happens to
be the largest single saving in the frame.

The awkward one is depth. The world is baked flat, so the walker is painted over
it, which is how you end up walking across a roof. Making roofs solid fixed it
and made the houses feel like bunkers. Instead, tall scenery standing in front
of you is re-drawn on top of you — and because every object stores the rng seed
it was baked with, that re-draw reproduces the same strokes exactly and lands
pixel-for-pixel on the original.
