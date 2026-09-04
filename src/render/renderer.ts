import { context2d, createSurface, isolate, type Surface } from '../core/canvas';
import type { Bounds } from '../core/geom';
import { drawCamp, type Fishing } from '../entities/fishing';
import { drawBirds, drawEaselPicture, drawHammock, type Rest } from '../entities/rest';
import { drawOwl, type Owl } from '../entities/owl';
import { drawElephant, drawStump, type Vigil } from '../entities/vigil';
import { drawHedgehog, type Hedgehog } from '../entities/hedgehog';
import { drawLion, type Lion } from '../entities/lion';
import { drawPerch, type Perch } from '../entities/perch';
import { drawSky } from '../world/sky';
import { withBoil } from '../media/ink';
import type { Treehouse } from '../entities/treehouse';
import { drawThroughWindow } from '../world/treehouse';
import { drawWalker, type Walker } from '../entities/player';
import type { Herd } from '../entities/herd';
import type { Particles } from '../entities/particles';
import { drawPot, type Pot } from '../entities/pots';
import type { Medium } from '../media/medium';
import type { World } from '../world/world';
import type { Camera } from './camera';
import { GRAIN } from '../media/sprites';
import type { ColorField } from './colorField';

/** Everything the renderer needs to draw a frame. */
export interface Scene {
  readonly world: World;
  readonly camera: Camera;
  readonly field: ColorField;
  readonly walker: Walker;
  readonly herd: Herd;
  readonly fishing: Fishing;
  readonly rest: Rest;
  readonly owl: Owl;
  readonly vigil: Vigil;
  readonly hedgehog: Hedgehog;
  readonly lion: Lion;
  readonly perches: readonly Perch[];
  readonly treehouse: Treehouse;
  /** The last thing drawn at the easel, if there is one. */
  readonly easelPicture: HTMLImageElement | undefined;
  /** Where the easel stands. */
  readonly easel: { readonly x: number; readonly y: number };
  readonly pots: readonly Pot[];
  readonly particles: Particles;
  /** Colour radius in world units, before the ending's flood. */
  readonly litRadius: number;
  /**
   * Is this point far enough inside the colour that the pencil beneath it can
   * never show through? Anything that answers yes can skip the sketch pass.
   */
  isBuriedInColour(x: number, y: number, margin: number): boolean;
  /** Colour radius including the flood, which is what the mask actually uses. */
  readonly maskRadius: number;
  readonly elapsed: number;
}

/**
 * Composites one frame.
 *
 * The order is the whole idea, so it is worth stating plainly:
 *
 *   1. blit the pencil drawing of the world
 *   2. draw the live things (livestock, pots) in pencil on top of it
 *   3. build a mask of where the colour reaches
 *   4. blit the coloured world, draw the live things in colour, punch both
 *      through the mask, and lay the result over the pencil
 *   5. draw the walker, who is always in colour
 *   6. lay tall scenery back over the walker, so they pass behind it
 *   7. one sheet of paper grain over everything, so it reads as one drawing
 *
 * Once the colour covers the whole viewport, steps 1-4 collapse into a single
 * blit of the coloured world — there is no point masking what is entirely lit.
 */
/**
 * Per-stage timings, in milliseconds, averaged over recent frames.
 *
 * Canvas work is queued and finishes on the GPU later, so these under-report
 * absolute cost — but they are measured the same way as each other, so the
 * *proportions* are what localise a slow frame.
 */
export interface StageTimings {
  worldBlit: number;
  live: number;
  composite: number;
  occluders: number;
  /** The one blit of grain and vignette over the finished frame. */
  paper: number;
  /** Sprites baked this frame — should settle to zero once explored. */
  bakes: number;
  /*
   * The four passes inside `composite`, which is otherwise one number covering
   * most of the frame. Worth having permanently: a night was spent guessing
   * which of them was expensive, and the answer turned out to differ between
   * machines — so the only useful version of this question is the one asked on
   * the machine that is actually slow.
   */
  /** Coloured world tiles blitted onto the colour layer. */
  colourTiles: number;
  /** Live entities drawn onto the colour layer, in colour. */
  colourLive: number;
  /** `destination-in` cutting the colour back to the haze, in place. */
  maskPunch: number;
}

/**
 * The frame is two stacked canvas elements, not one.
 *
 * Below: the pencil drawing of the valley, opaque. Above: the colour, cut to
 * the shape of the haze, with everything that stands over the colour — the
 * walker, the particles, the tall scenery laid back over them — and the paper
 * over the lot. The compositor stacks them, which is the one thing it is good
 * at.
 *
 * This replaced a scratch canvas. The colour used to be drawn into an
 * offscreen surface, punched through a mask surface, and copied back onto the
 * one displayed canvas — three operations, two of them on surfaces whose every
 * pixel was rewritten each frame and then read straight back as a source.
 *
 * That was the fault. Firefox keeps a canvas on the GPU only while the
 * textures it draws from go on hitting a cache; it profiles the ratio over ten
 * frames and, when misses dominate, drops the canvas to the software
 * rasteriser permanently — which is the 30ms frame people reported arriving in
 * the middle of a session and never leaving. A surface rewritten every frame
 * cannot be a hit. There were two of them.
 *
 * Now there are none: everything the frame draws *from* is baked once — world
 * tiles, occluder sprites, the haze, the paper — and everything it draws *to*
 * is a displayed layer that is never read back.
 */
export class Renderer {
  /** The pencil layer, below. Opaque: the world blit covers every pixel. */
  private ctx: CanvasRenderingContext2D;
  /** The colour layer, above. Transparent, and cleared every frame. */
  private colour: CanvasRenderingContext2D;

  /** Viewport in CSS pixels. */
  width = 0;
  height = 0;

  /** Device pixels per CSS pixel. Adapted at runtime by `systems/perf.ts`. */
  scale = 1;

  /**
   * Which of the two paths the last frame took.
   *
   * Recorded rather than recomputed, because the whole point of asking is to
   * find out what actually happened. Confusing the cheap flooded path for the
   * expensive composite one — they differ by better than ten times — cost an
   * evening once.
   */
  lastFlooded = false;

  readonly stages: StageTimings = {
    worldBlit: 0,
    live: 0,
    composite: 0,
    occluders: 0,
    paper: 0,
    bakes: 0,
    colourTiles: 0,
    colourLive: 0,
    maskPunch: 0,
  };

  /**
   * Which stages ran this frame, so the others can be decayed.
   *
   * Without this a stage that stops running keeps its last average for ever:
   * win the game and the composite is skipped from then on, but the readout
   * goes on reporting whatever it cost on the final frame before the flood.
   * That is not a stale number, it is a wrong one, and it sent a real debugging
   * session down the wrong path.
   */
  private readonly ran = new Set<keyof StageTimings>();


  /**
   * This frame's stage costs, unaveraged.
   *
   * `stages` is a running average, which is the right thing for reading a
   * steady state and the wrong thing entirely for catching a spike: a single
   * forty-millisecond frame folded in at one part in ten shows up as a four
   * millisecond bump and is gone again in a dozen frames. Every diagnosis in
   * bugs/ so far was made from the averages, and every one of them was made
   * from a window that happened not to contain the problem. These are the
   * numbers a slow frame is actually made of.
   */
  readonly frameStages: StageTimings = {
    worldBlit: 0,
    live: 0,
    composite: 0,
    occluders: 0,
    paper: 0,
    bakes: 0,
    colourTiles: 0,
    colourLive: 0,
    maskPunch: 0,
  };

  /**
   * Wait for each stage's canvas work before timing the next one.
   *
   * Off by default and costly when on, so it is a diagnostic rather than a
   * setting: forcing a readback is exactly the stall being investigated.
   *
   * Canvas calls are queued and finish later, so a timer around them measures
   * how long it took to *ask*. That is not a small error, it is a
   * misattribution: nothing reads the main canvas back during a frame, so the
   * world blit's real cost escapes its timer entirely and reads 0.11ms for a
   * full screen, while the scratch is copied back within the same frame and
   * every deferred operation on it lands on whichever stage happened to
   * trigger the flush. Two reports from the same machine minutes apart split
   * the identical work as colourTiles 4.59 / maskPunch 4.36 and then as
   * colourTiles 7.5 / maskPunch 0.95. Only their sum ever meant anything.
   *
   * With this on, each stage's number is its own.
   */
  settleStages = false;

  /*
   * Three things the colour layer does that the pencil layer does not, each
   * switchable so the machine with the fault can say which one costs.
   *
   * Not settings. The frame is wrong with any of them on — no clear leaves
   * last frame's colour smeared behind this one, no punch shows the colour as
   * a hard-edged rectangle, no paper drops the grain — and that is fine for
   * the second or two `pencil.layerCost()` holds them.
   *
   * They exist because this layer is seventy times the cost of the one below
   * it for a fifteenth of the pixels, and three plausible reasons is two too
   * many to act on.
   */
  skipClear = false;
  skipPunch = false;
  skipPaper = false;

  /** Force this context's queued work to finish, if stage timing is honest. */
  private settle(ctx: CanvasRenderingContext2D): void {
    if (!this.settleStages) return;
    // One pixel is enough: a read of any kind waits for everything before it.
    ctx.getImageData(0, 0, 1, 1);
  }

  /** Blend a sample into the running average for one stage. */
  private time<T>(
    stage: keyof StageTimings,
    fn: () => T,
    settleOn: CanvasRenderingContext2D = this.ctx,
  ): T {
    const started = performance.now();
    const result = fn();
    this.settle(settleOn);
    this.blend(stage, performance.now() - started);
    return result;
  }

  /** Fold one sample into a stage's running average, and mark it as having run. */
  private blend(stage: keyof StageTimings, ms: number): void {
    this.stages[stage] = this.stages[stage] * 0.9 + ms * 0.1;
    this.frameStages[stage] = ms;
    this.ran.add(stage);
  }

  /**
   * Let anything that did not run this frame fall away.
   *
   * Towards zero at the same rate it would have risen, so a stage that stops
   * reads as fading out rather than as switching off — which is the truth, and
   * also tells you *when* it stopped if you are watching.
   */
  private decayIdle(): void {
    for (const key of Object.keys(this.stages) as (keyof StageTimings)[]) {
      if (key === 'bakes' || this.ran.has(key)) continue;
      this.stages[key] *= 0.9;
    }
    this.ran.clear();
  }

  /**
   * The paper: grain and vignette, in screen space, on one sheet.
   *
   * These used to be two `position:fixed` divs over the canvas, on the reasoning
   * that a static layer is something the compositor can cache. It can — but
   * caching saves *rasterising* them, not blending them, and the canvas beneath
   * changes every frame, so both were re-blended over every frame anyway. At
   * device resolution, while the canvas draws at CSS resolution: at a device
   * pixel ratio of two the browser was blending four times as many pixels on
   * our behalf as we drew ourselves, none of it visible to any timer here.
   * Hiding them took a real session from 42fps to 52.
   *
   * Composed once per resize and laid down with a single one-to-one blit, which
   * is the cheapest full-screen operation there is — a pattern fill and a
   * gradient every frame would have given most of the saving back.
   */
  private paper: Surface;

  constructor(
    private canvas: HTMLCanvasElement,
    private colourCanvas: HTMLCanvasElement,
  ) {
    // Opaque. The compositor can then copy rather than blend a full-screen
    // layer every frame. This was transparent for a while because a resize
    // clears the canvas and an opaque one clears to black, which flashed — but
    // the render scale is fixed now, so resizes only happen when the window
    // does, and those redraw immediately.
    this.ctx = context2d(canvas, { alpha: false });
    // The layer above has to be transparent — the pencil showing through
    // outside the haze is the entire point of the game.
    this.colour = context2d(colourCanvas, { alpha: true });
    this.paper = createSurface(1, 1);
  }

  resize(width: number, height: number, scale: number): void {
    this.width = width;
    this.height = height;
    this.scale = scale;
    for (const surface of [this.canvas, this.colourCanvas]) {
      surface.width = Math.max(1, Math.round(width * scale));
      surface.height = Math.max(1, Math.round(height * scale));
      surface.style.width = `${width}px`;
      surface.style.height = `${height}px`;
    }
    this.buildPaper();
  }

  /** Draw the grain and the vignette onto their own sheet, at screen size. */
  private buildPaper(): void {
    const w = Math.max(1, Math.round(this.width * this.scale));
    const h = Math.max(1, Math.round(this.height * this.scale));
    this.paper.canvas.width = w;
    this.paper.canvas.height = h;
    const p = this.paper.ctx;
    p.setTransform(1, 0, 0, 1, 0, 0);
    p.clearRect(0, 0, w, h);

    const grain = p.createPattern(GRAIN, 'repeat');
    if (grain) {
      p.globalAlpha = 0.13;
      p.fillStyle = grain;
      p.fillRect(0, 0, w, h);
      p.globalAlpha = 1;
    }

    /*
     * The vignette, as it was in the stylesheet: an ellipse filling the window,
     * clear to nearly half way out and reaching a fifth opacity at the corners.
     * Canvas gradients are circular, so the context is squashed to the window's
     * proportions and a circle drawn in that.
     */
    isolate(p, () => {
      p.translate(w / 2, h / 2);
      p.scale(1, h / w || 1);
      const r = w / 2;
      const g = p.createRadialGradient(0, 0, r * 0.45, 0, 0, r);
      g.addColorStop(0, 'rgba(90,80,60,0)');
      g.addColorStop(1, 'rgba(90,80,60,.20)');
      p.fillStyle = g;
      p.fillRect(-r, -r, r * 2, r * 2);
    });
  }

  render(scene: Scene): void {
    const { camera, world, walker } = scene;
    const { ctx, colour, scale } = this;

    camera.frame(this.width, this.height, scale);
    this.scrollSubPixel(camera);

    const centreX = camera.toScreenX(walker.x);
    const centreY = camera.toScreenY(walker.y - 14);
    const radius = scene.maskRadius * camera.zoom;
    const flooded = radius > Math.hypot(this.width, this.height) * 0.85;
    this.lastFlooded = flooded;

    // A stage that does not run this frame must read zero, not last frame's
    // cost — the same trap `decayIdle` exists to avoid for the averages.
    for (const key of Object.keys(this.frameStages) as (keyof StageTimings)[]) {
      this.frameStages[key] = 0;
    }

    // No clear on the pencil layer: the world blit below covers every pixel of
    // the viewport, and on an opaque canvas a full-screen clear is a
    // full-screen write for nothing.
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    /*
     * The colour layer does need one, and cannot get away with clearing only
     * the dirty rectangle. Everything above the colour is drawn up here too,
     * and the owl in its tree or the bird over the hammock can be anywhere on
     * screen — a rectangle around the walker would leave last frame's copy of
     * them behind.
     */
    if (!this.skipClear) {
      colour.setTransform(1, 0, 0, 1, 0, 0);
      colour.clearRect(0, 0, this.colourCanvas.width, this.colourCanvas.height);
    }
    colour.setTransform(scale, 0, 0, scale, 0, 0);

    world.bakeCount = 0;

    if (flooded) {
      /*
       * The pencil layer is not drawn at all: the colour covers the window and
       * is opaque, tiles under every pixel inside the map and the sky's own
       * gradient above it, so whatever the layer below still holds is not
       * visible. That is the saving the flooded path always had, kept.
       */
      this.time('worldBlit', () => this.blitWorld(colour, world, 'color', camera), colour);
      this.time(
        'live',
        () =>
          isolate(colour, () => {
            camera.applyTransform(colour);
            this.drawLive(colour, scene, 'color');
          }),
        colour,
      );
    } else {
      this.time('worldBlit', () => this.blitWorld(ctx, world, 'sketch', camera));
      this.time('live', () =>
        isolate(ctx, () => {
          camera.applyTransform(ctx);
          this.drawLive(ctx, scene, 'sketch');
        }),
      );
      this.compositeColor(scene, centreX, centreY, radius);
    }

    /*
     * Everything from here up stands over the colour, so it belongs on the
     * upper layer — and it is drawn after the punch, which would otherwise cut
     * the walker back to the shape of the haze along with the world.
     */
    isolate(colour, () => {
      camera.applyTransform(colour);
      /*
       * The camp belongs to the walker rather than to the world: it is pitched
       * where they stand and packs up when they leave, so it is drawn here with
       * them, in colour only, and never baked into a layer.
       */
      drawCamp(colour, scene.fishing, walker.x, walker.y, walker.face);
      /*
       * In the hammock, the walker *is* the drawing in the hammock — the
       * standing figure would otherwise be planted beside it looking on. Keyed
       * on `resting` rather than on the cloth still settling, or they stay
       * invisible for the second the hammock takes to lift.
       */
      if (
        !scene.rest.resting &&
        !scene.treehouse.inside &&
        !scene.vigil.sitting &&
        !scene.perches.some((p) => p.resting)
      ) {
        drawWalker(colour, walker, scene.elapsed);
      }
      scene.particles.draw(colour, walker.x, walker.y, scene.litRadius, flooded);
      this.time('occluders', () => this.drawOccluders(colour, scene), colour);
      /*
       * After the occluders, both of them. The bird sits on top of a tree and
       * whoever is in the treehouse is inside one, and the trees are occluders
       * — drawn any earlier, both would be painted over by the thing they are
       * supposed to be in.
       */
      drawBirds(colour, scene.rest);
      /*
       * And the owl, for the same reason: it is up a tree, and the trees are
       * occluders. Its medium is its own — this is past the colour mask, so
       * nothing here is masked, and an owl out in the graphite has to be drawn
       * as a drawing rather than simply appearing in colour on a grey hillside.
       *
       * And under `withBoil`, which everything drawn in pencil needs and which
       * this went without at first: outside it the hand keeps moving at seven
       * ticks a second, so a frozen owl sat there with its eyes darting about.
       * Asleep is asleep — pencil on paper, and paper does not move.
       */
      withBoil(scene.owl.awake, () =>
        drawOwl(colour, scene.owl, scene.owl.awake ? 'color' : 'sketch'),
      );
      /*
       * And whoever is sitting on the bench or lying in the hay, for a third
       * time the same reason: the haystack is tall scenery, laid back over
       * anything standing north of it, and lying *on* the hay means being north
       * of its base. Drawn with the rest of the live things, somebody who
       * walked up from behind and lay down was painted over with straw and
       * disappeared outright.
       *
       * In colour, always. This is the walker — the standing figure is dropped
       * while they are down — and the walker is never in graphite.
       */
      for (const perch of scene.perches) {
        if (perch.resting) drawPerch(colour, perch, 'color');
      }
      const house = scene.treehouse;
      if (house.inside) {
        drawThroughWindow(colour, house.x, house.y, house.offset, house.facing, house.walk, house.moving);
      }
    });

    /*
     * The paper over everything, so the whole frame reads as one drawing rather
     * than as things arranged on a background. One blit, one to one.
     */
    /*
     * On the upper layer, so it covers the colour as well as the pencil. It is
     * the last thing drawn on the last layer, which is what "over everything"
     * has to mean once there are two of them.
     */
    this.time(
      'paper',
      () => {
        if (this.skipPaper) return;
        colour.setTransform(1, 0, 0, 1, 0, 0);
        colour.drawImage(this.paper.canvas, 0, 0);
        colour.setTransform(scale, 0, 0, scale, 0, 0);
      },
      colour,
    );

    this.stages.bakes = world.bakeCount;
    this.frameStages.bakes = world.bakeCount;
    this.decayIdle();
  }

  /** The offset last written to the element, so an unchanged one is not rewritten. */
  private scrolledBy = '';

  /**
   * Put back the fraction of a pixel the camera's snap threw away.
   *
   * The frame was drawn from a whole-pixel origin, so the image sits a fraction
   * of a pixel away from where the camera actually is; sliding the canvas
   * element back by that much lands it where it belongs. The compositor already
   * has this layer and offsets it in hardware, so the smooth scroll is free —
   * whereas asking the canvas to draw at a fractional origin costs 5.2x on
   * Firefox. See `subX` in render/camera.ts for what this is fixing.
   *
   * The shift is never more than half a pixel, so at most half a pixel of the
   * page shows past one edge. The page behind is the same paper colour and the
   * vignette darkens the edges anyway, so there is nothing to see there.
   */
  private scrollSubPixel(camera: Camera): void {
    const x = -camera.subX;
    const y = -camera.subY;
    const next = x || y ? `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0)` : '';
    if (next === this.scrolledBy) return;
    this.scrolledBy = next;
    // Both layers, by the same fraction. They are drawn from one camera and
    // have to move as one thing — a pencil layer half a pixel from its colour
    // is worse than either of them being half a pixel out.
    this.canvas.style.transform = next;
    this.colourCanvas.style.transform = next;
  }

  private blitWorld(
    ctx: CanvasRenderingContext2D,
    world: World,
    medium: Medium,
    camera: Camera,
  ): void {
    world.drawRegion(
      ctx,
      medium,
      camera.viewX,
      camera.viewY,
      camera.viewWidth,
      camera.viewHeight,
      0,
      0,
      this.width,
      this.height,
    );
  }

  /**
   * Livestock and paint pots, in whichever medium is being laid down.
   *
   * In the pencil pass, anything buried deep inside the colour is skipped: the
   * colour pass will paint straight over it at full opacity, so drawing it in
   * graphite first is work nobody ever sees. That matters because a live animal
   * is the most expensive thing in the frame — a cow is some forty separate
   * strokes — and standing in a herd means every one of them is awake.
   */
  private drawLive(ctx: CanvasRenderingContext2D, scene: Scene, medium: Medium): void {
    const { camera } = scene;
    const hidden = (x: number, y: number, margin: number) =>
      medium === 'sketch' && scene.isBuriedInColour(x, y, margin);

    /*
     * The sky first, before anything standing in front of it.
     *
     * Drawn here rather than beside the world blit so that both passes get it:
     * the composite builds the coloured version by blitting the world into a
     * scratch surface and running this again, and it assumes — reasonably,
     * until now — that the camera is inside the map and so every pixel has a
     * tile under it. Above the top edge there are no tiles at all.
     *
     * Under a still hand. The sky and the hills below it are scenery — paper,
     * ruled strokes, two green caps and the drawings standing on them — and
     * scenery in this world does not move: everything else up here is baked
     * once, and only the live actors boil. The ruled strokes were the one
     * exception, jittering away behind a house that holds perfectly still,
     * which read as the whole northern view crawling.
     */
    withBoil(false, () =>
      drawSky(
        ctx,
        camera.viewX,
        camera.viewY,
        camera.viewWidth,
        medium,
        scene.elapsed,
        scene.vigil.elephantX,
      ),
    );

    for (const pot of scene.pots) {
      if (pot.found || !camera.canSee(pot.x, pot.y, 60)) continue;
      if (hidden(pot.x, pot.y, 40)) continue;
      drawPot(ctx, pot, medium);
    }
    scene.herd.draw(
      ctx,
      medium,
      (x, y) => camera.canSee(x, y, 90) && !hidden(x, y, 60),
    );

    /*
     * Everything below is drawn live at a fixed spot, and everything below is
     * drawn with a still hand when it is drawn in pencil.
     *
     * Pencil strokes jitter against a boil counter that ticks seven times a
     * second. In the colour pass nothing jitters at all, so this only matters
     * for the sketch pass — and the sketch pass is only ever *visible* outside
     * the colour, where the thing is meant to be a drawing on paper. Left to
     * the live boil, the hammock and the stump and the elephant all sat out in
     * the graphite twitching.
     */
    const still = <T,>(fn: () => T): T => withBoil(medium === 'color', fn);

    // The cloth sags under whoever is in it, so it cannot be baked — see the
    // note in `world/hammock.ts`.
    /*
     * The hedgehog, which is only ever there while somebody is lying on the
     * hay. Under a still hand like everything else drawn live in pencil.
     */
    const { hedgehog } = scene;
    if (
      hedgehog.out > 0 &&
      camera.canSee(hedgehog.atX, hedgehog.atY, 60) &&
      !hidden(hedgehog.atX, hedgehog.atY, 20)
    ) {
      still(() => drawHedgehog(ctx, hedgehog, medium));
    }

    const { rest } = scene;
    if (camera.canSee(rest.x, rest.y, 130) && !hidden(rest.x, rest.y, 90)) {
      still(() => drawHammock(ctx, rest, medium));
    }

    /*
     * The stump, and whoever is sitting on it, and whatever has come to look at
     * them. Drawn live rather than baked: a `draw` in the scenery would put its
     * strokes into the middle of the bake's sequence of random numbers and move
     * every tree placed after it.
     */
    const { vigil } = scene;
    if (camera.canSee(vigil.x, vigil.y, 90) && !hidden(vigil.x, vigil.y, 60)) {
      still(() => drawStump(ctx, vigil, medium));
    }
    /*
     * Always, not only once something is there.
     *
     * The cloud it comes out of hangs in that patch of sky permanently, so this
     * has to be asked every frame rather than gated on the animal existing.
     */
    if (
      camera.canSee(vigil.elephantX, vigil.elephantY, 320) &&
      !hidden(vigil.elephantX, vigil.elephantY, 90)
    ) {
      still(() => drawElephant(ctx, vigil, medium));
    }

    const { lion } = scene;
    if (camera.canSee(lion.x, lion.y, 90) && !hidden(lion.x, lion.y, 60)) {
      still(() => drawLion(ctx, lion, medium));
    }

    // Yours, over the abandoned one baked into the board. Colour only: in
    // pencil the easel keeps the drawing it came with.
    const { easel } = scene;
    if (medium === 'color' && camera.canSee(easel.x, easel.y, 80)) {
      drawEaselPicture(ctx, scene.easelPicture, easel.x, easel.y);
    }
  }

  /**
   * Draw the coloured world onto the upper layer and cut it to the haze.
   *
   * All of it inside the dirty rectangle, and all of it on the layer that is
   * shown. There is no scratch surface any more and no mask surface either:
   * the colour is drawn straight where it belongs, and `destination-in`
   * against the baked haze sprite cuts it back in place.
   *
   * What that removed, per frame: a full write of the dirty rectangle into an
   * offscreen canvas, a full write of the mask into another, and the copy back
   * over the top. Two of those three surfaces were rewritten every frame and
   * then read as a texture in the same frame, which is the one thing an
   * accelerated canvas cannot cache — see the note on the class.
   */
  private compositeColor(scene: Scene, centreX: number, centreY: number, radius: number): void {
    const { camera, field, world } = scene;
    const { colour, scale } = this;

    const dirty = field.computeDirty(centreX, centreY, radius, this.width, this.height);
    if (dirty.empty) return;

    const compositeStarted = performance.now();
    let part = performance.now();

    /*
     * The clip, in device pixels, set once and left in place for the whole
     * composite. It bounds the colour blit, and it bounds the punch — without
     * it `destination-in` would clear the entire layer, walker and all.
     */
    colour.save();
    colour.setTransform(1, 0, 0, 1, 0, 0);
    colour.beginPath();
    colour.rect(dirty.x * scale, dirty.y * scale, dirty.width * scale, dirty.height * scale);
    colour.clip();

    colour.setTransform(scale, 0, 0, scale, 0, 0);
    world.drawRegion(
      colour,
      'color',
      camera.viewX + dirty.x / camera.zoom,
      camera.viewY + dirty.y / camera.zoom,
      dirty.width / camera.zoom,
      dirty.height / camera.zoom,
      dirty.x,
      dirty.y,
      dirty.width,
      dirty.height,
    );
    this.settle(colour);
    this.blend('colourTiles', performance.now() - part);
    part = performance.now();

    camera.applyTransform(colour);
    this.drawLive(colour, scene, 'color');
    this.settle(colour);
    this.blend('colourLive', performance.now() - part);
    part = performance.now();

    if (!this.skipPunch) field.punch(colour, scene.elapsed, centreX, centreY, radius, scale);
    colour.restore();
    this.settle(colour);
    this.blend('maskPunch', performance.now() - part);

    colour.setTransform(scale, 0, 0, scale, 0, 0);
    this.blend('composite', performance.now() - compositeStarted);
  }

  /**
   * Tall scenery standing in front of the walker, laid back over them.
   *
   * An occluder by definition overlaps the walker, who is the centre of the
   * colour — so it is always deep inside the lit area and the colour sprite is
   * the right one to use.
   */
  private drawOccluders(ctx: CanvasRenderingContext2D, scene: Scene): void {
    const { walker, world } = scene;
    const body: Bounds = {
      x0: walker.x - 16,
      x1: walker.x + 16,
      y0: walker.y - 52,
      y1: walker.y + 6,
    };
    for (const occluder of world.occludersInFrontOf(walker.y, body)) {
      const centre = (occluder.bounds.x0 + occluder.bounds.x1) / 2;
      const lit =
        Math.hypot(centre - walker.x, occluder.scenery.y - walker.y - 14) < scene.maskRadius;
      const sprite = world.spriteFor(occluder, lit ? 'color' : 'sketch');
      ctx.drawImage(sprite.canvas, sprite.x, sprite.y);
    }
  }

  /**
   * Draw into a different canvas from now on, and start the scratch afresh.
   *
   * For the rescue in `systems/rescue.ts`. Every surface is replaced, not just
   * the displayed one: Firefox's decision to stop accelerating is made per
   * canvas, and the scratch and the paper are canvases the frame leans on just
   * as hard. The old ones are shrunk to a pixel on the way out so the memory
   * goes back now rather than whenever the collector gets round to it.
   *
   * The caller must `resize` afterwards — nothing here knows the viewport.
   */
  attach(canvas: HTMLCanvasElement, colourCanvas: HTMLCanvasElement): void {
    for (const old of [this.canvas, this.colourCanvas, this.paper.canvas]) {
      old.width = 1;
      old.height = 1;
    }
    this.canvas = canvas;
    this.colourCanvas = colourCanvas;
    this.ctx = context2d(canvas, { alpha: false });
    this.colour = context2d(colourCanvas, { alpha: true });
    this.paper = createSurface(1, 1);
  }

  /** Release both layers and the paper. See `World.dispose`. */
  dispose(): void {
    for (const canvas of [this.canvas, this.colourCanvas, this.paper.canvas]) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  /**
   * Direct access for the diagnostics overlay, which draws last.
   *
   * The upper layer, because "last" now means the topmost of two — a readout
   * drawn on the pencil would sit underneath the colour and the paper.
   */
  get context(): CanvasRenderingContext2D {
    return this.colour;
  }

  /** The layer below, for anything that wants the pencil drawing itself. */
  get pencilContext(): CanvasRenderingContext2D {
    return this.ctx;
  }
}
