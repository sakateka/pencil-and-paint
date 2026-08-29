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
import { MASK_SCALE } from './colorField';
import type { ColorField, DirtyRect } from './colorField';

/**
 * How big the scratch surfaces start, in CSS pixels.
 *
 * Enough for the blob and its trail during ordinary play. It is a starting
 * point, not a limit — `ensureScratch` grows them if the colour ever needs
 * more, which it does while the ending floods outwards.
 */
const INITIAL_SCRATCH_SPAN = 1100;

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
  mask: number;
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
  /** Coloured world tiles blitted into the scratch. */
  colourTiles: number;
  /** Live entities drawn into the scratch, in colour. */
  colourLive: number;
  /** `destination-in` punching the mask through the scratch. */
  maskPunch: number;
  /** The finished scratch laid over the pencil. */
  blitOut: number;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly temp: Surface;

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
    mask: 0,
    composite: 0,
    occluders: 0,
    paper: 0,
    bakes: 0,
    colourTiles: 0,
    colourLive: 0,
    maskPunch: 0,
    blitOut: 0,
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


  /** Blend a sample into the running average for one stage. */
  private time<T>(stage: keyof StageTimings, fn: () => T): T {
    const started = performance.now();
    const result = fn();
    this.blend(stage, performance.now() - started);
    return result;
  }

  /** Fold one sample into a stage's running average, and mark it as having run. */
  private blend(stage: keyof StageTimings, ms: number): void {
    this.stages[stage] = this.stages[stage] * 0.9 + ms * 0.1;
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
  private readonly paper: Surface;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // Opaque. The compositor can then copy rather than blend a full-screen
    // layer every frame. This was transparent for a while because a resize
    // clears the canvas and an opaque one clears to black, which flashed — but
    // the render scale is fixed now, so resizes only happen when the window
    // does, and those redraw immediately.
    this.ctx = context2d(canvas, { alpha: false });
    this.temp = createSurface(1, 1);
    this.paper = createSurface(1, 1);
  }

  resize(width: number, height: number, scale: number, field: ColorField): void {
    this.width = width;
    this.height = height;
    this.scale = scale;
    this.canvas.width = Math.max(1, Math.round(width * scale));
    this.canvas.height = Math.max(1, Math.round(height * scale));

    // The scratch surfaces only ever hold the dirty rectangle, so they are
    // allocated to that rather than to the window.
    const scratchW = Math.min(width, INITIAL_SCRATCH_SPAN) * scale;
    const scratchH = Math.min(height, INITIAL_SCRATCH_SPAN) * scale;
    this.temp.canvas.width = Math.max(1, Math.round(scratchW));
    this.temp.canvas.height = Math.max(1, Math.round(scratchH));
    field.resize(scratchW, scratchH);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
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
    const { ctx, scale } = this;

    camera.frame(this.width, this.height, scale);

    const centreX = camera.toScreenX(walker.x);
    const centreY = camera.toScreenY(walker.y - 14);
    const radius = scene.maskRadius * camera.zoom;
    const flooded = radius > Math.hypot(this.width, this.height) * 0.85;
    this.lastFlooded = flooded;

    // No clear: the world blit below covers every pixel of the viewport, and on
    // an opaque canvas a full-screen clear is a full-screen write for nothing.
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    world.bakeCount = 0;

    if (flooded) {
      this.time('worldBlit', () => this.blitWorld(ctx, world, 'color', camera));
      this.time('live', () =>
        isolate(ctx, () => {
          camera.applyTransform(ctx);
          this.drawLive(ctx, scene, 'color');
        }),
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

    isolate(ctx, () => {
      camera.applyTransform(ctx);
      /*
       * The camp belongs to the walker rather than to the world: it is pitched
       * where they stand and packs up when they leave, so it is drawn here with
       * them, in colour only, and never baked into a layer.
       */
      drawCamp(ctx, scene.fishing, walker.x, walker.y, walker.face);
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
        drawWalker(ctx, walker, scene.elapsed);
      }
      scene.particles.draw(ctx, walker.x, walker.y, scene.litRadius, flooded);
      this.time('occluders', () => this.drawOccluders(ctx, scene));
      /*
       * After the occluders, both of them. The bird sits on top of a tree and
       * whoever is in the treehouse is inside one, and the trees are occluders
       * — drawn any earlier, both would be painted over by the thing they are
       * supposed to be in.
       */
      drawBirds(ctx, scene.rest);
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
        drawOwl(ctx, scene.owl, scene.owl.awake ? 'color' : 'sketch'),
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
        if (perch.resting) drawPerch(ctx, perch, 'color');
      }
      const house = scene.treehouse;
      if (house.inside) {
        drawThroughWindow(ctx, house.x, house.y, house.offset, house.facing, house.walk, house.moving);
      }
    });

    /*
     * The paper over everything, so the whole frame reads as one drawing rather
     * than as things arranged on a background. One blit, one to one.
     */
    this.time('paper', () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.paper.canvas, 0, 0);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    });

    this.stages.bakes = world.bakeCount;
    this.decayIdle();
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
   * Draw the coloured world into a scratch canvas, punch it through the mask,
   * and lay it over the pencil — all inside the dirty rectangle.
   */
  private compositeColor(scene: Scene, centreX: number, centreY: number, radius: number): void {
    const { camera, field, world } = scene;
    const { ctx, scale, temp } = this;

    const dirty = field.computeDirty(camera, centreX, centreY, radius, this.width, this.height);
    if (dirty.empty) return;

    // The blob outgrows the scratch while the ending floods outwards. Without
    // this the composite is silently clipped to whatever the surfaces can hold,
    // and a wide stripe of the screen simply never gets its colour.
    this.ensureScratch(dirty, field);

    this.time('mask', () =>
      field.build(scene.elapsed, camera, centreX, centreY, radius, scale),
    );
    const compositeStarted = performance.now();

    const sourceX = camera.viewX + dirty.x / camera.zoom;
    const sourceY = camera.viewY + dirty.y / camera.zoom;
    const sourceW = dirty.width / camera.zoom;
    const sourceH = dirty.height / camera.zoom;

    let part = performance.now();
    const t = temp.ctx;
    t.setTransform(1, 0, 0, 1, 0, 0);
    // No clear. The colour blit below paints the whole dirty rectangle opaquely
    // — the camera is clamped inside the world, so the region always has tiles
    // under it — and nothing outside the rectangle is ever read back. Clearing
    // first was a fourth full pass over the busiest area of the frame.
    // Local origin: the scratch surface holds only the dirty rectangle.
    t.setTransform(scale, 0, 0, scale, -dirty.x * scale, -dirty.y * scale);
    t.save();
    t.beginPath();
    t.rect(dirty.x, dirty.y, dirty.width, dirty.height);
    t.clip();
    world.drawRegion(
      t,
      'color',
      sourceX,
      sourceY,
      sourceW,
      sourceH,
      dirty.x,
      dirty.y,
      dirty.width,
      dirty.height,
    );
    this.blend('colourTiles', performance.now() - part);
    part = performance.now();
    camera.applyTransform(t);
    this.drawLive(t, scene, 'color');
    t.restore();
    this.blend('colourLive', performance.now() - part);
    part = performance.now();

    // The clip matters: `destination-in` would otherwise clear the entire
    // scratch canvas, which is exactly the full-screen work being avoided.
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.save();
    t.beginPath();
    t.rect(0, 0, dirty.width * scale, dirty.height * scale);
    t.clip();
    t.globalCompositeOperation = 'destination-in';
    /*
     * Nearest-neighbour on the way up. The mask is a smooth alpha ramp with no
     * edge in it, so interpolating the upscale buys nothing visible and costs
     * more than the half-resolution build saves — in software rasterisation a
     * filtered 2x upscale of a full-screen region is its own full pass.
     */
    t.imageSmoothingEnabled = false;
    t.drawImage(
      field.surface.canvas,
      0,
      0,
      Math.ceil(dirty.width * scale * MASK_SCALE),
      Math.ceil(dirty.height * scale * MASK_SCALE),
      0,
      0,
      Math.ceil(dirty.width * scale),
      Math.ceil(dirty.height * scale),
    );
    t.restore();
    t.globalCompositeOperation = 'source-over';
    this.blend('maskPunch', performance.now() - part);
    part = performance.now();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(
      temp.canvas,
      0,
      0,
      dirty.width * scale,
      dirty.height * scale,
      dirty.x * scale,
      dirty.y * scale,
      dirty.width * scale,
      dirty.height * scale,
    );
    this.blend('blitOut', performance.now() - part);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.blend('composite', performance.now() - compositeStarted);
  }

  /**
   * Make sure the scratch surfaces can hold the dirty rectangle.
   *
   * Grows straight to the full viewport rather than creeping up frame by frame:
   * the only thing that needs more than the initial span is the ending, and it
   * is heading for the whole screen anyway.
   */
  private ensureScratch(dirty: DirtyRect, field: ColorField): void {
    const needW = Math.ceil(dirty.width * this.scale) + 2;
    const needH = Math.ceil(dirty.height * this.scale) + 2;
    if (this.temp.canvas.width >= needW && this.temp.canvas.height >= needH) return;

    const fullW = Math.max(needW, Math.round(this.width * this.scale));
    const fullH = Math.max(needH, Math.round(this.height * this.scale));
    this.temp.canvas.width = fullW;
    this.temp.canvas.height = fullH;
    field.resize(fullW, fullH);
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

  /** Release the scratch surfaces. See `World.dispose`. */
  dispose(field: ColorField): void {
    for (const canvas of [this.canvas, this.temp.canvas, field.surface.canvas]) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  /** Direct access for the diagnostics overlay, which draws last. */
  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }
}
