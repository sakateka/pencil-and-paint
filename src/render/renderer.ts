import { context2d, createSurface, isolate, type Surface } from '../core/canvas';
import type { Bounds } from '../core/geom';
import { drawCamp, type Fishing } from '../entities/fishing';
import { drawBirds, drawHammock, type Rest } from '../entities/rest';
import { drawWalker, type Walker } from '../entities/player';
import type { Herd } from '../entities/herd';
import type { Particles } from '../entities/particles';
import { drawPot, type Pot } from '../entities/pots';
import type { Medium } from '../media/medium';
import type { World } from '../world/world';
import type { Camera } from './camera';
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
  /** Sprites baked this frame — should settle to zero once explored. */
  bakes: number;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly temp: Surface;

  /** Viewport in CSS pixels. */
  width = 0;
  height = 0;

  /** Device pixels per CSS pixel. Adapted at runtime by `systems/perf.ts`. */
  scale = 1;

  readonly stages: StageTimings = {
    worldBlit: 0,
    live: 0,
    mask: 0,
    composite: 0,
    occluders: 0,
    bakes: 0,
  };


  /** Blend a sample into the running average for one stage. */
  private time<T>(stage: keyof StageTimings, fn: () => T): T {
    const started = performance.now();
    const result = fn();
    this.stages[stage] = this.stages[stage] * 0.9 + (performance.now() - started) * 0.1;
    return result;
  }

  constructor(private readonly canvas: HTMLCanvasElement) {
    // Opaque. The compositor can then copy rather than blend a full-screen
    // layer every frame. This was transparent for a while because a resize
    // clears the canvas and an opaque one clears to black, which flashed — but
    // the render scale is fixed now, so resizes only happen when the window
    // does, and those redraw immediately.
    this.ctx = context2d(canvas, { alpha: false });
    this.temp = createSurface(1, 1);
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
  }

  render(scene: Scene): void {
    const { camera, world, walker } = scene;
    const { ctx, scale } = this;

    camera.frame(this.width, this.height, scale);

    const centreX = camera.toScreenX(walker.x);
    const centreY = camera.toScreenY(walker.y - 14);
    const radius = scene.maskRadius * camera.zoom;
    const flooded = radius > Math.hypot(this.width, this.height) * 0.85;

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
      if (!scene.rest.resting) drawWalker(ctx, walker, scene.elapsed);
      drawBirds(ctx, scene.rest);
      scene.particles.draw(ctx, walker.x, walker.y, scene.litRadius, flooded);
      this.time('occluders', () => this.drawOccluders(ctx, scene));
    });

    this.stages.bakes = world.bakeCount;
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

    // The cloth sags under whoever is in it, so it cannot be baked — see the
    // note in `world/hammock.ts`.
    const { rest } = scene;
    if (camera.canSee(rest.x, rest.y, 130) && !hidden(rest.x, rest.y, 90)) {
      drawHammock(ctx, rest, medium);
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
    camera.applyTransform(t);
    this.drawLive(t, scene, 'color');
    t.restore();

    // The clip matters: `destination-in` would otherwise clear the entire
    // scratch canvas, which is exactly the full-screen work being avoided.
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.save();
    t.beginPath();
    t.rect(0, 0, dirty.width * scale, dirty.height * scale);
    t.clip();
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(field.surface.canvas, 0, 0);
    t.restore();
    t.globalCompositeOperation = 'source-over';

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
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.stages.composite =
      this.stages.composite * 0.9 + (performance.now() - compositeStarted) * 0.1;
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
