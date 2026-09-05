import { context2d, createSurface, isolate, type Surface } from '../core/canvas';
import { drawCamp, type Fishing } from '../entities/fishing';
import { drawBirds, drawEaselPicture, drawHammock, type Rest } from '../entities/rest';
import { drawOwl, type Owl } from '../entities/owl';
import { drawElephant, drawStump, type Vigil } from '../entities/vigil';
import { drawHedgehog, type Hedgehog } from '../entities/hedgehog';
import { drawLion, type Lion } from '../entities/lion';
import { drawPerch, type Perch } from '../entities/perch';
import { drawSky, SKY_DEPTH } from '../world/sky';
import { withBoil } from '../media/ink';
import type { Treehouse } from '../entities/treehouse';
import { drawThroughWindow } from '../world/treehouse';
import { drawWalker, type Walker } from '../entities/player';
import type { Herd } from '../entities/herd';
import type { Particles } from '../entities/particles';
import { drawPot, type Pot } from '../entities/pots';
import type { World } from '../world/world';
import type { Camera } from './camera';
import { disc, GRAIN } from '../media/sprites';
import { HAZE_RADIUS, hazeMask } from './colorField';
import type { ColorField } from './colorField';
import { poseOf, Stage } from './stage';

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
 * Per-stage timings, in milliseconds, averaged over recent frames.
 *
 * Much shorter than it was. Most of what the old readout measured no longer
 * happens on this thread — the valley is not blitted, the colour is not
 * composited, the mask is not punched — so the only numbers left are the ones
 * that are still ours: repainting hand-drawn things, and handing the frame to
 * the GPU.
 */
export interface StageTimings {
  /** Repainting the cels of hand-drawn things whose pose changed. */
  live: number;
  /** Placing the world's tiles and occluder sprites. */
  scenery: number;
  /** Phaser's own frame: culling, batching, the draw calls. */
  submit: number;
  /** Sprites baked this frame — should settle to zero once explored. */
  bakes: number;
}

/**
 * How the frame is put together, and why it is put together that way.
 *
 * Three cameras over one WebGL canvas, plus two thin canvases of our own:
 *
 *   sketch    the pencil drawing of the valley
 *   colour    the coloured valley, cut to the haze by a fragment shader
 *   over      everything that stands over the colour
 *   #paper    grain and vignette, drawn once per resize and never again
 *   #hud      the diagnostics overlay, drawn only when it is switched on
 *
 * What this replaced. The valley used to be blitted out of its baked tiles into
 * the window every frame, twice, and the colour cut to the haze with either
 * `destination-in` — which drops an accelerated canvas onto the software
 * rasteriser permanently, and was measured at fourteen milliseconds a frame —
 * or a CSS mask, which moved the same work into the compositor where no timer
 * in this codebase could see it. Measured on real hardware, walking with
 * thirteen paint pots found, that frame cost 40% of a core and climbed past
 * 100% over a session. This one costs about 20% and does not climb.
 *
 * The saving is not Phaser being clever. It is that a tile handed to the GPU
 * once is never touched again — the camera moves instead of the picture — and
 * that multiplying a layer by a soft alpha is one line of a fragment shader.
 *
 * What is still drawn by hand is drawn by hand: every `draw*` function in
 * `entities/` and `world/` takes a 2D context and is unchanged. They paint into
 * small canvases now instead of into the window, and those canvases are only
 * re-uploaded when the drawing on them actually changes. See `Stage.cel`.
 */
export class Renderer {
  private readonly stage: Stage;

  /** Grain and vignette, over the whole frame. Rebuilt only on resize. */
  private paperCtx: CanvasRenderingContext2D;
  private paper: Surface;

  /** The diagnostics overlay, which must sit over everything. */
  private hudCtx: CanvasRenderingContext2D;

  /** Viewport in CSS pixels. */
  width = 0;
  height = 0;

  /** Device pixels per CSS pixel. */
  scale = 1;

  /** Whether the colour covered the window on the last frame. */
  lastFlooded = false;

  readonly stages: StageTimings = { live: 0, scenery: 0, submit: 0, bakes: 0 };
  readonly frameStages: StageTimings = { live: 0, scenery: 0, submit: 0, bakes: 0 };

  constructor(
    host: HTMLElement,
    private readonly paperCanvas: HTMLCanvasElement,
    hudCanvas: HTMLCanvasElement,
  ) {
    this.paperCtx = context2d(paperCanvas, { alpha: true });
    this.hudCtx = context2d(hudCanvas, { alpha: true });
    this.paper = createSurface(1, 1);
    this.stage = new Stage(host, () => {
      this.stage.setHaze(hazeMask(), HAZE_RADIUS);
      this.stage.resize(this.width, this.height);
    });
  }

  resize(width: number, height: number, scale: number): void {
    this.width = width;
    this.height = height;
    this.scale = scale;
    for (const canvas of [this.paperCanvas, this.hudCtx.canvas]) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    this.stage.resize(width, height);
    this.buildPaper();
  }

  /**
   * Draw the grain and the vignette, once, and lay them down.
   *
   * These used to be re-blitted over every frame because the canvas beneath
   * them changed and a canvas cannot be partially transparent to what is under
   * it. This layer is a separate element that never changes at all, so the
   * compositor holds one texture for it and blends it on the GPU — which is
   * what it was doing anyway, minus our full-screen blit.
   */
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

    this.paperCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.paperCtx.clearRect(0, 0, w, h);
    this.paperCtx.drawImage(this.paper.canvas, 0, 0);
  }

  /**
   * Depths within a layer. The valley at the bottom, the sky just above it —
   * it is drawn over the paper where the map runs out — then everything
   * hand-drawn, in the order the old frame drew it.
   */
  private static readonly DEPTH = {
    tiles: 0,
    sky: 1,
    pots: 10,
    herd: 20,
    hedgehog: 30,
    hammock: 40,
    stump: 50,
    elephant: 60,
    lion: 70,
    easel: 80,
    camp: 100,
    walker: 110,
    particles: 120,
    occluders: 130,
    birds: 140,
    owl: 150,
    perch: 160,
    window: 170,
  };

  render(scene: Scene, now = performance.now(), delta = 16.6667): void {
    const { camera, world, walker } = scene;

    camera.frame(this.width, this.height, this.scale);
    if (!this.stage.ready) return;

    for (const key of Object.keys(this.frameStages) as (keyof StageTimings)[]) {
      this.frameStages[key] = 0;
    }
    world.bakeCount = 0;

    this.stage.setElapsed(scene.elapsed);

    /*
     * The camera's own position, not the snapped one.
     *
     * `Camera.frame` rounds the view origin to whole device pixels and keeps
     * the remainder in `subX`/`subY`, because a fractional source rectangle
     * made Canvas2D's `drawImage` resample at 5.2x the cost. Nothing here
     * resamples: the tiles are textures and a fractional scroll is what the
     * vertex shader does anyway. So the fraction goes straight back on and the
     * camera is exactly where the simulation put it.
     */
    const viewX = camera.viewX + camera.subX / camera.zoom;
    const viewY = camera.viewY + camera.subY / camera.zoom;
    this.stage.look(viewX + camera.viewWidth / 2, viewY + camera.viewHeight / 2, camera.zoom);

    const radius = scene.maskRadius;
    const flooded = radius * camera.zoom > Math.hypot(this.width, this.height) * 0.85;
    this.lastFlooded = flooded;

    // Kept for the diagnostics and the tests, which ask how much of the screen
    // the colour covers.
    scene.field.computeDirty(
      camera.toScreenX(walker.x),
      camera.toScreenY(walker.y - 14),
      radius * camera.zoom,
      this.width,
      this.height,
    );

    /*
     * The haze, as a sprite the mask shader reads. Position, size and turn are
     * all transforms now, so all three are free — which is why the breathing
     * and the slow turn could come back after a year as a static blob. See
     * `ColorField.hazeAt`.
     */
    const haze = scene.field.hazeAt(walker.x, walker.y - 14, radius, scene.elapsed);
    this.stage.placeHaze(haze.x, haze.y, haze.radius, haze.angle);

    /*
     * Under a full flood there is nothing for the pencil layer to show: the
     * colour is opaque and covers the window. Switching the camera off is the
     * whole of that saving now, where it used to be a separate code path.
     */
    this.stage.showLayer('sketch', !flooded);

    const sceneryStarted = performance.now();
    this.placeWorld(world, flooded);
    this.frameStages.scenery = performance.now() - sceneryStarted;

    const liveStarted = performance.now();
    if (!flooded) this.drawLive(scene, 'sketch');
    this.drawLive(scene, 'color');
    this.drawOver(scene, flooded);
    this.frameStages.live = performance.now() - liveStarted;

    this.stage.endStamps();
    this.stage.endFrame();

    const submitStarted = performance.now();
    this.stage.step(now, delta);
    this.frameStages.submit = performance.now() - submitStarted;

    this.frameStages.bakes = world.bakeCount;
    for (const key of Object.keys(this.stages) as (keyof StageTimings)[]) {
      this.stages[key] = this.stages[key] * 0.9 + this.frameStages[key] * 0.1;
    }
  }

  /** Hand the valley's tiles to the GPU, once, and place them every frame. */
  private placeWorld(world: World, flooded: boolean): void {
    const { DEPTH } = Renderer;
    for (const medium of flooded ? (['color'] as const) : (['sketch', 'color'] as const)) {
      const layer = medium === 'color' ? 'colour' : 'sketch';
      let index = 0;
      for (const tile of world.tilesOf(medium)) {
        this.stage.sprite({
          id: `tile:${medium}:${index++}`,
          layer,
          canvas: tile.canvas,
          left: tile.x,
          top: tile.y,
          width: tile.width,
          height: tile.height,
          depth: DEPTH.tiles,
        });
      }
    }
  }

  /**
   * Everything that is drawn by hand, in whichever medium is being laid down.
   *
   * The body of this is the old `drawLive`, unchanged in what it decides — the
   * same visibility checks, the same rules about which things hold still and
   * which boil. What changed is where the strokes land: each thing now paints
   * into a canvas of its own, and only when its pose has moved on.
   */
  private drawLive(scene: Scene, medium: 'sketch' | 'color'): void {
    const { camera, world } = scene;
    const { DEPTH } = Renderer;
    const layer = medium === 'color' ? 'colour' : 'sketch';
    const hidden = (x: number, y: number, margin: number) =>
      medium === 'sketch' && scene.isBuriedInColour(x, y, margin);

    /** A thing that carries its drawing with it: painted at the cel's centre. */
    const at = (
      id: string,
      x: number,
      y: number,
      size: number,
      depth: number,
      pose: string | number,
      draw: (ctx: CanvasRenderingContext2D) => void,
    ) => {
      this.stage.cel({
        id,
        layer,
        medium,
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        depth,
        pose,
        draw,
      });
    };

    /*
     * The sky, which belongs to the world rather than to anything in it, so it
     * is anchored: it covers a patch of world and must not slide with the
     * camera. Its left edge is quantised to a wide step so that crossing one is
     * rare, and the cel is cut wide enough to cover the view either side.
     */
    const skyStep = 512;
    const skyLeft = Math.floor((camera.viewX - skyStep) / skyStep) * skyStep;
    const skyWidth = camera.viewWidth + skyStep * 3;
    if (camera.viewY < 40) {
      this.stage.cel({
        id: 'sky',
        layer,
        medium,
        left: skyLeft,
        top: -SKY_DEPTH,
        width: skyWidth,
        height: SKY_DEPTH + 40,
        depth: DEPTH.sky,
        anchored: true,
        draw: (ctx) =>
          withBoil(false, () =>
            drawSky(ctx, skyLeft, -SKY_DEPTH, skyWidth, medium, scene.elapsed, scene.vigil.elephantX),
          ),
      });
    }

    for (const pot of scene.pots) {
      if (pot.found || !camera.canSee(pot.x, pot.y, 60)) continue;
      if (hidden(pot.x, pot.y, 40)) continue;
      at(`pot:${pot.x},${pot.y}`, pot.x, pot.y, 128, DEPTH.pots, poseOf(pot), (ctx) =>
        drawPot(ctx, pot, medium),
      );
    }

    for (const animal of scene.herd.animals) {
      if (!camera.canSee(animal.x, animal.y, 90)) continue;
      if (hidden(animal.x, animal.y, 60)) continue;
      /*
       * A sleeping animal is a cached still and never changes, so it is not
       * animated and stops costing anything at all — which is most of a field
       * most of the time. An awake one repaints on the step as well as on its
       * own state, because its strokes boil even when it is standing still.
       */
      this.stage.cel({
        id: `animal:${animal.slot}`,
        layer,
        medium,
        left: animal.x - 110,
        top: animal.y - 110,
        width: 220,
        height: 220,
        depth: DEPTH.herd + animal.y / 10000,
        pose: poseOf(animal),
        animated: animal.awake,
        draw: (ctx) => scene.herd.drawOne(ctx, animal, medium),
      });
    }

    /*
     * Everything below is drawn at a fixed spot, and everything below holds
     * still when it is drawn in pencil. Pencil strokes jitter against a boil
     * counter that ticks seven times a second; in the colour pass nothing
     * jitters, so this only matters for the sketch pass — and the sketch pass
     * is only ever visible outside the colour, where the thing is meant to be a
     * drawing on paper. Left to the live boil, the hammock and the stump and
     * the elephant all sat out in the graphite twitching.
     */
    const still = <T,>(fn: () => T): T => withBoil(medium === 'color', fn);

    const { hedgehog } = scene;
    if (
      hedgehog.out > 0 &&
      camera.canSee(hedgehog.atX, hedgehog.atY, 60) &&
      !hidden(hedgehog.atX, hedgehog.atY, 20)
    ) {
      at('hedgehog', hedgehog.atX, hedgehog.atY, 160, DEPTH.hedgehog, poseOf(hedgehog), (ctx) =>
        still(() => drawHedgehog(ctx, hedgehog, medium)),
      );
    }

    const { rest } = scene;
    if (camera.canSee(rest.x, rest.y, 130) && !hidden(rest.x, rest.y, 90)) {
      at('hammock', rest.x, rest.y, 420, DEPTH.hammock, poseOf(rest), (ctx) =>
        still(() => drawHammock(ctx, rest, medium)),
      );
    }

    const { vigil } = scene;
    if (camera.canSee(vigil.x, vigil.y, 90) && !hidden(vigil.x, vigil.y, 60)) {
      at('stump', vigil.x, vigil.y, 300, DEPTH.stump, poseOf(vigil), (ctx) =>
        still(() => drawStump(ctx, vigil, medium)),
      );
    }
    /*
     * Always, not only once something is there. The cloud it comes out of hangs
     * in that patch of sky permanently, so this has to be asked every frame
     * rather than gated on the animal existing.
     */
    if (
      camera.canSee(vigil.elephantX, vigil.elephantY, 320) &&
      !hidden(vigil.elephantX, vigil.elephantY, 90)
    ) {
      at('elephant', vigil.elephantX, vigil.elephantY, 760, DEPTH.elephant, poseOf(vigil), (ctx) =>
        still(() => drawElephant(ctx, vigil, medium)),
      );
    }

    const { lion } = scene;
    if (camera.canSee(lion.x, lion.y, 90) && !hidden(lion.x, lion.y, 60)) {
      at('lion', lion.x, lion.y, 300, DEPTH.lion, poseOf(lion), (ctx) =>
        still(() => drawLion(ctx, lion, medium)),
      );
    }

    // Yours, over the abandoned one baked into the board. Colour only: in
    // pencil the easel keeps the drawing it came with.
    const { easel } = scene;
    if (medium === 'color' && scene.easelPicture && camera.canSee(easel.x, easel.y, 80)) {
      at('easelPicture', easel.x, easel.y, 260, DEPTH.easel, scene.easelPicture.src.length, (ctx) =>
        drawEaselPicture(ctx, scene.easelPicture, easel.x, easel.y),
      );
    }

    void world;
  }

  /**
   * Everything that stands over the colour.
   *
   * None of it may be cut to the shape of the light — the walker carries the
   * colour, they are not lit by it — so all of it is on the third camera, which
   * the mask filter never touches.
   */
  private drawOver(scene: Scene, flooded: boolean): void {
    const { camera, walker, world } = scene;
    const { DEPTH } = Renderer;

    const at = (
      id: string,
      x: number,
      y: number,
      size: number,
      depth: number,
      pose: string | number,
      draw: (ctx: CanvasRenderingContext2D) => void,
    ) => {
      this.stage.cel({
        id,
        layer: 'over',
        medium: 'color',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        depth,
        pose,
        draw,
      });
    };

    /*
     * The camp belongs to the walker rather than to the world: it is pitched
     * where they stand and packs up when they leave, so it is drawn with them,
     * in colour only, and never baked into a layer.
     *
     * Asked for only while it is pitched. `drawCamp` returns at once when it is
     * not, but the cel around it does not know that and was clearing and
     * re-uploading a blank 360px square twelve times a second for the whole of
     * a session in which nobody went fishing.
     */
    if (scene.fishing.active) {
      at('camp', walker.x, walker.y, 360, DEPTH.camp, poseOf(scene.fishing) + walker.face, (ctx) =>
        drawCamp(ctx, scene.fishing, walker.x, walker.y, walker.face),
      );
    }

    /*
     * In the hammock, the walker *is* the drawing in the hammock — the standing
     * figure would otherwise be planted beside it looking on. Keyed on
     * `resting` rather than on the cloth still settling, or they stay invisible
     * for the second the hammock takes to lift.
     */
    if (
      !scene.rest.resting &&
      !scene.treehouse.inside &&
      !scene.vigil.sitting &&
      !scene.perches.some((p) => p.resting)
    ) {
      /*
       * The one thing repainted every frame rather than on the step. The walker
       * is what the eye is on, and a stepped walk cycle on the figure you are
       * steering reads as lag rather than as pencil. One 160px cel is a
       * hundred kilobytes — the herd is what the step rate is for.
       */
      this.stage.cel({
        id: 'walker',
        layer: 'over',
        medium: 'color',
        left: walker.x - 80,
        top: walker.y - 80,
        width: 160,
        height: 160,
        depth: DEPTH.walker,
        pose: `${scene.elapsed.toFixed(3)}|${poseOf(walker)}`,
        draw: (ctx) => drawWalker(ctx, walker, scene.elapsed),
      });
    }

    /*
     * The motes of colour, as sprites rather than as a drawing.
     *
     * They were a drawing at first, on one canvas covering everywhere they can
     * drift — which is the whole lit area, so the canvas grew with the colour
     * and was re-uploaded twelve times a second. Measured at 66MB a second by
     * the thirteenth paint pot, more than every other hand-drawn thing in the
     * frame put together. A mote is a disc of one of four colours at a position
     * and a size, which is exactly what a sprite is.
     */
    for (const d of scene.particles.discs(walker.x, walker.y, scene.litRadius, flooded)) {
      if (d.alpha <= 0.004) continue;
      this.stage.stamp('over', disc(d.colour), d.x, d.y, d.radius, d.alpha, DEPTH.particles);
    }
    /*
     * The hearts are still a drawing: a pair of bezier curves that change shape
     * as they swell, three at a time, only when somebody pets the cat. Cut to
     * the box they actually occupy rather than to the light.
     */
    if (scene.particles.hasHearts) {
      const box = scene.particles.heartBounds();
      at('hearts', box.x, box.y, box.size, DEPTH.particles, poseOf(scene.particles), (ctx) =>
        scene.particles.drawHearts(ctx),
      );
    }

    /*
     * Tall scenery standing in front of the walker, laid back over them. These
     * are baked canvases already, so they go to the GPU as they are and are
     * never redrawn. An occluder by definition overlaps the walker, who is the
     * centre of the colour, so it is always deep inside the lit area and the
     * colour sprite is the right one to use.
     */
    const body = {
      x0: walker.x - 16,
      x1: walker.x + 16,
      y0: walker.y - 52,
      y1: walker.y + 6,
    };
    for (const occluder of world.occludersInFrontOf(walker.y, body)) {
      const centre = (occluder.bounds.x0 + occluder.bounds.x1) / 2;
      const lit =
        Math.hypot(centre - walker.x, occluder.scenery.y - walker.y - 14) < scene.maskRadius;
      const medium = lit ? 'color' : 'sketch';
      const sprite = world.spriteFor(occluder, medium);
      this.stage.sprite({
        id: `occluder:${occluder.id}:${medium}`,
        layer: 'over',
        canvas: sprite.canvas,
        left: sprite.x,
        top: sprite.y,
        width: sprite.canvas.width,
        height: sprite.canvas.height,
        depth: DEPTH.occluders + occluder.scenery.y / 10000,
      });
    }

    /*
     * After the occluders, all of these. The bird sits on top of a tree, the
     * owl is up one, and whoever is in the treehouse is inside one — and the
     * trees are occluders. Drawn any earlier, every one of them would be
     * painted over by the thing it is supposed to be in.
     */
    const { rest } = scene;
    if (camera.canSee(rest.x, rest.y, 260)) {
      at('birds', rest.x, rest.y, 420, DEPTH.birds, poseOf(rest), (ctx) => drawBirds(ctx, rest));
    }

    /*
     * The owl's medium is its own: this is past the colour mask, so nothing
     * here is cut, and an owl out in the graphite has to be drawn as a drawing
     * rather than simply appearing in colour on a grey hillside.
     *
     * And under `withBoil`, which everything drawn in pencil needs and which
     * this went without at first: outside it the hand keeps moving at seven
     * ticks a second, so a frozen owl sat there with its eyes darting about.
     * Asleep is asleep — pencil on paper, and paper does not move.
     */
    const { owl } = scene;
    if (camera.canSee(owl.x, owl.y, 120)) {
      this.stage.cel({
        id: 'owl',
        layer: 'over',
        medium: 'color',
        left: owl.x - 110,
        top: owl.y - 110,
        width: 220,
        height: 220,
        depth: DEPTH.owl,
        pose: poseOf(owl),
        // Asleep is asleep: pencil on paper, and paper does not move.
        animated: owl.awake,
        draw: (ctx) =>
          withBoil(owl.awake, () => drawOwl(ctx, owl, owl.awake ? 'color' : 'sketch')),
      });
    }

    /*
     * And whoever is sitting on the bench or lying in the hay, for a third time
     * the same reason: the haystack is tall scenery, laid back over anything
     * standing north of it, and lying *on* the hay means being north of its
     * base. Drawn with the rest of the live things, somebody who walked up from
     * behind and lay down was painted over with straw and disappeared outright.
     *
     * In colour, always. This is the walker — the standing figure is dropped
     * while they are down — and the walker is never in graphite.
     */
    for (const perch of scene.perches) {
      if (!perch.resting) continue;
      at(`perch:${perch.x},${perch.y}`, perch.x, perch.y, 260, DEPTH.perch, poseOf(perch), (ctx) =>
        drawPerch(ctx, perch, 'color'),
      );
    }

    const house = scene.treehouse;
    if (house.inside) {
      at('window', house.x, house.y, 360, DEPTH.window, poseOf(house), (ctx) =>
        drawThroughWindow(ctx, house.x, house.y, house.offset, house.facing, house.walk, house.moving),
      );
    }
  }

  /** Release everything. See `World.dispose`. */
  dispose(): void {
    this.stage.dispose();
    for (const canvas of [this.paperCanvas, this.hudCtx.canvas, this.paper.canvas]) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  /**
   * Where the diagnostics overlay draws.
   *
   * Its own element, above the frame. It used to be the topmost canvas of the
   * three the frame was made of, which meant the frame had to be cleared and
   * redrawn to get rid of it.
   */
  get context(): CanvasRenderingContext2D {
    return this.hudCtx;
  }

  /** Clear the overlay. It is drawn over, so it does not clear itself. */
  clearOverlay(): void {
    this.hudCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.hudCtx.clearRect(0, 0, this.hudCtx.canvas.width, this.hudCtx.canvas.height);
  }

  /**
   * What the frame has re-uploaded to the GPU since this was last asked, in
   * megabytes, and which cels did it. The honest measure of this design.
   */
  uploadReport(): { totalMb: number; worst: string } {
    return this.stage.uploadReport();
  }

  /**
   * Frames drawn against frames asked for, and where the picture actually was.
   *
   * Kept because it caught the one fault this whole rewrite introduced: Phaser
   * went on running its own loop after being told to stop, so every frame was
   * drawn twice and half of them from where things were the frame before. That
   * reads as the picture shivering as you walk and looks exactly like a
   * performance problem, which is the worst kind of bug to have. Three hundred
   * against six hundred said what nothing else would have.
   */
  get pacing(): { asked: number; drawn: number; scrollX: number; scrollY: number } {
    return this.stage.pacing;
  }

  /** The canvas the valley is drawn on, for tests that read the frame back. */
  get frameCanvas(): HTMLCanvasElement | undefined {
    return this.stage.canvas;
  }

  /** Show or hide a layer outright, for finding out what compositing costs. */
  showLayer(which: 'sketch' | 'colour' | 'over', on: boolean): void {
    this.stage.showLayer(which, on);
  }
}
