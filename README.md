# Pencil & Paint

A small browser game about a person who carries colour with them.

The world is drawn twice: once as a flat colour illustration, once in graphite —
hand-drawn outlines and cross-hatching. Only the area around the walker is
painted in. Everything beyond that is an unfinished pencil sketch, and it holds
perfectly still, because a drawing does not move. Walk toward a grazing sheep
and it wakes up.

Find the fourteen spilled paint pots to widen the colour until the whole page is
awake — then stay and wander it for as long as you like.

## Play

Open `index.html` in a browser. That is the whole game: one self-contained file,
no build step, no dependencies, no network.

| Input | Action |
| --- | --- |
| `W A S D` / arrow keys | walk |
| drag / touch | walk (mobile) |
| `R` | new world (the pots are scattered afresh) |
| `F` | performance readout — fps, frame time, render scale, composited area |

## How it works

- The whole world is pre-rendered once into two offscreen canvases, colour and
  graphite. Each frame blits the graphite one, then composites the colour one
  through a soft, wobbly mask centred on the walker.
- That compositing runs inside a dirty rectangle tracking the mask, so the
  per-frame cost scales with the colour radius rather than the window size.
- Render resolution adapts to the machine, capped at 1.25x — the world is a
  bitmap authored at 1x, so drawing it at 2x costs four times the fill rate and
  adds no detail.
- Livestock and paint pots are drawn live in whichever medium they fall in, so
  a cow can be half-inked and half-graphite as you walk past. Frozen ones are
  cached as sprites, since a still drawing is the same pixels every frame.
- Tall objects standing in front of the walker are re-drawn over them, so you
  pass behind houses and trees instead of across their roofs. Each object stores
  the RNG seed it was baked with, so the overlay reproduces exactly the same
  pencil strokes and lands pixel-for-pixel on the original.

## Deploying

Pushing to `main` publishes via `.github/workflows/deploy.yml`. It needs
**Settings → Pages → Source → GitHub Actions** set once on the repository.

## Development

Playwright drives the game headlessly for testing — collision assertions, frame
timing, and screenshots.

```sh
npm install
npx playwright install chromium
node tmp/final.js       # end-to-end: collect all pots, win, restart
node tmp/occlude2.js    # walking behind buildings
node tmp/freeze.js      # animals hold still outside the colour
node tmp/cost.js        # draw-call counts and frame timing
```

Nothing under `tmp/` ships; it is scratch, and git-ignored.

## License

The source is available for study, modification, and sharing, but not for
commercial use. The software is under the
[PolyForm Noncommercial License 1.0.0](LICENSE); original paintings are under
[CC BY-NC 4.0](LICENSE), and third-party recordings keep the terms listed in
[CREDITS.md](CREDITS.md). See [LICENSE](LICENSE) for the exact scope and terms.
