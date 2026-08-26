import { context2d, createSurface, isolate, type Surface } from '../core/canvas';
import type { Bounds } from '../core/geom';
import { drawWalker, type Walker } from '../entities/player';
import type { Herd } from '../entities/herd';
import type { Particles } from '../entities/particles';
import { drawPot, type Pot } from '../entities/pots';
import type { Medium } from '../media/medium';
import { GRAIN } from '../media/sprites';
import type { World } from '../world/world';
import type { Camera } from './camera';
import type { ColorField } from './colorField';

/** Everything the renderer needs to draw a frame. */
export interface Scene {
  readonly world: World;
  readonly camera: Camera;
  readonly field: ColorField;
  readonly walker: Walker;
  readonly herd: Herd;
  readonly pots: readonly Pot[];
  readonly particles: Particles;
  /** Colour radius in world units, before the ending's flood. */
  readonly litRadius: number;
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
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly temp: Surface;
  private paper: Surface;
  private paperWidth = -1;
  private paperHeight = -1;

  /** Viewport in CSS pixels. */
  width = 0;
  height = 0;

  /** Device pixels per CSS pixel. Adapted at runtime by `systems/perf.ts`. */
  scale = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // Deliberately not `alpha: false`: an opaque canvas clears to black, and a
    // resize clears the canvas, which shows up as a black flash.
    this.ctx = context2d(canvas);
    this.temp = createSurface(1, 1);
    this.paper = createSurface(1, 1);
  }

  resize(width: number, height: number, scale: number, field: ColorField): void {
    this.width = width;
    this.height = height;
    this.scale = scale;
    for (const c of [this.canvas, this.temp.canvas]) {
      c.width = Math.max(1, Math.round(width * scale));
      c.height = Math.max(1, Math.round(height * scale));
    }
    field.resize(width * scale, height * scale);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.paperWidth = -1; // force the overlay to be rebuilt
  }

  render(scene: Scene): void {
    const { camera, world, field, walker } = scene;
    const { ctx, scale } = this;

    camera.frame(this.width, this.height);

    const centreX = camera.toScreenX(walker.x);
    const centreY = camera.toScreenY(walker.y - 14);
    const radius = scene.maskRadius * camera.zoom;
    const flooded = radius > Math.hypot(this.width, this.height) * 0.85;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    if (flooded) {
      this.blitWorld(ctx, world.color, camera);
      isolate(ctx, () => {
        camera.applyTransform(ctx);
        this.drawLive(ctx, scene, 'color');
      });
    } else {
      this.blitWorld(ctx, world.sketch, camera);
      isolate(ctx, () => {
        camera.applyTransform(ctx);
        this.drawLive(ctx, scene, 'sketch');
      });
      this.compositeColor(scene, centreX, centreY, radius);
      field.strokeRim(ctx, scene.elapsed, centreX, centreY, radius);
    }

    isolate(ctx, () => {
      camera.applyTransform(ctx);
      drawWalker(ctx, walker, scene.elapsed);
      scene.particles.draw(ctx, walker.x, walker.y, scene.litRadius, flooded);
      this.drawOccluders(ctx, scene);
    });

    this.overlayPaper(ctx);
  }

  private blitWorld(
    ctx: CanvasRenderingContext2D,
    layer: HTMLCanvasElement,
    camera: Camera,
  ): void {
    ctx.drawImage(
      layer,
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

  /** Livestock and paint pots, in whichever medium is being laid down. */
  private drawLive(ctx: CanvasRenderingContext2D, scene: Scene, medium: Medium): void {
    const { camera } = scene;
    for (const pot of scene.pots) {
      if (pot.found || !camera.canSee(pot.x, pot.y, 60)) continue;
      drawPot(ctx, pot, medium);
    }
    scene.herd.draw(ctx, medium, (x, y) => camera.canSee(x, y, 90));
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

    field.build(scene.elapsed, camera, centreX, centreY, radius, scale);

    const sourceX = camera.viewX + dirty.x / camera.zoom;
    const sourceY = camera.viewY + dirty.y / camera.zoom;
    const sourceW = dirty.width / camera.zoom;
    const sourceH = dirty.height / camera.zoom;

    const t = temp.ctx;
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.clearRect(dirty.x * scale, dirty.y * scale, dirty.width * scale + 2, dirty.height * scale + 2);
    t.setTransform(scale, 0, 0, scale, 0, 0);
    t.save();
    t.beginPath();
    t.rect(dirty.x, dirty.y, dirty.width, dirty.height);
    t.clip();
    t.drawImage(
      world.color,
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
    t.rect(dirty.x * scale, dirty.y * scale, dirty.width * scale, dirty.height * scale);
    t.clip();
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(field.surface.canvas, 0, 0);
    t.restore();
    t.globalCompositeOperation = 'source-over';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(
      temp.canvas,
      dirty.x * scale,
      dirty.y * scale,
      dirty.width * scale,
      dirty.height * scale,
      dirty.x * scale,
      dirty.y * scale,
      dirty.width * scale,
      dirty.height * scale,
    );
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
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

  /** Grain and vignette, baked once per resize into a single overlay. */
  private overlayPaper(ctx: CanvasRenderingContext2D): void {
    if (this.paperWidth !== this.width || this.paperHeight !== this.height) {
      this.buildPaper();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.paper.canvas, 0, 0);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
  }

  private buildPaper(): void {
    this.paper = createSurface(this.width * this.scale, this.height * this.scale);
    const { ctx } = this.paper;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const pattern = ctx.createPattern(GRAIN, 'repeat');
    if (pattern) {
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalAlpha = 1;
    }

    const vignette = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.45,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.78,
    );
    vignette.addColorStop(0, 'rgba(90,80,60,0)');
    vignette.addColorStop(1, 'rgba(90,80,60,.20)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);

    this.paperWidth = this.width;
    this.paperHeight = this.height;
  }

  /** Direct access for the diagnostics overlay, which draws last. */
  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }
}
