import { createSurface, isolate, type Surface } from '../core/canvas';
import { boundsOverlap, type Bounds } from '../core/geom';
import { rng } from '../core/rng';
import type { Medium } from '../media/medium';
import { withoutGroundShadows } from '../media/pencil';
import { GRAIN } from '../media/sprites';
import { buildLayout, WORLD_HEIGHT, WORLD_WIDTH, type AnimalSpawn } from './layout';
import { drawGround, drawPath, drawTufts, type Ellipse } from './terrain';
import type { Collider, Scenery } from './types';

/**
 * A tall piece of scenery, plus what is needed to lay it back over the walker.
 *
 * `seed` is the whole trick. It records where the rng stood when this object was
 * baked into the world layers, so re-running its draw call reproduces the exact
 * same pencil strokes. The overlay lands pixel-for-pixel on the baked copy and
 * is invisible except where it covers the walker — no ghosting, no double image.
 */
interface Occluder {
  readonly scenery: Scenery;
  readonly bounds: Bounds;
  readonly seed: number;
  readonly sprites: Map<Medium, OccluderSprite>;
}

interface OccluderSprite {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
}

const SPRITE_PAD = 3;

/**
 * The world layers are held as a grid of tiles rather than one big canvas.
 *
 * Firefox declines to hardware-accelerate a canvas above a size threshold, and
 * a 2800x2000 layer is comfortably over it. Once it falls back, every blit of
 * it is a CPU copy, which showed up as ~10ms a frame spent in `drawImage` with
 * a large fixed cost that barely moved when the destination shrank. Tiles stay
 * small enough to be accelerated, and only the handful under the viewport is
 * touched each frame.
 *
 * Sized 1024 rather than smaller on purpose: every distinct source surface in a
 * frame is something Firefox has to synchronise, so a fine grid trades one
 * problem for another. Four tiles under a viewport is the balance.
 */
const TILE = 1024;

interface Layer {
  tiles: HTMLCanvasElement[];
  columns: number;
  rows: number;
  /** Bitmap pixels per world unit. Below 1 on memory-constrained devices. */
  scale: number;
}

/**
 * How finely to bake the world, in bitmap pixels per world unit.
 *
 * At full resolution the two layers are 44.8MB of canvas, which is fine on a
 * desktop and is not fine on a phone — Chrome on Android would run for a while
 * and then take the tab out with a white screen. Two thirds of the resolution
 * is a little under half the memory, and on a display that is upscaling the
 * canvas anyway the softness barely registers.
 */
function pickBakeScale(): number {
  const shortSide = Math.min(globalThis.innerWidth || 1280, globalThis.innerHeight || 800);
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  const constrained = shortSide <= 520 || (memory !== undefined && memory <= 4);
  return constrained ? 0.62 : 1;
}

/** Cap on cached occluder sprites, which are baked lazily as you explore. */
const MAX_OCCLUDER_SPRITES = 48;

/**
 * The valley, drawn twice and held in memory.
 *
 * Both layers are baked once at startup rather than drawn per frame, because
 * hatching every blade of grass sixty times a second is not a thing anyone can
 * afford. What moves — the walker, the livestock, the pots — is drawn live on
 * top; everything that stands still is a bitmap.
 */
export class World {
  readonly width = WORLD_WIDTH;
  readonly height = WORLD_HEIGHT;

  /** The finished illustration, and the same valley as an unfinished drawing. */
  private readonly layers: Record<Medium, Layer>;

  readonly colliders: readonly Collider[];
  /** Bitmap pixels per world unit the layers were baked at. */
  readonly bakeScale: number;
  readonly pond: Ellipse;
  readonly animalSpawns: readonly AnimalSpawn[];

  private readonly occluders: Occluder[];
  /** Insertion order of cached occluder sprites, oldest first. */
  private readonly spriteOrder: { occluder: Occluder; medium: Medium }[] = [];

  /** Sprites baked since the counter was last reset. Read by the perf overlay. */
  bakeCount = 0;

  private constructor(
    layers: Record<Medium, Layer>,
    colliders: Collider[],
    occluders: Occluder[],
    pond: Ellipse,
    animalSpawns: AnimalSpawn[],
  ) {
    this.layers = layers;
    this.bakeScale = layers.color.scale;
    this.colliders = colliders;
    this.occluders = occluders;
    this.pond = pond;
    this.animalSpawns = animalSpawns;
  }

  /**
   * Lay the world out and bake both media.
   *
   * Asynchronous, and deliberately so. Baking hatches every blade of grass in a
   * 2800x2000 world, twice; on a desktop that is a few hundred milliseconds, on
   * a phone it is seconds. Done in one synchronous call it locks the main
   * thread for all of them — the title card is painted but nothing is listening,
   * so the game looks frozen and the Start button does nothing.
   *
   * So it breathes: work is chopped into slices of about twelve milliseconds and
   * the event loop gets a turn between them. `onProgress` runs from 0 to 1.
   */
  static async generate(onProgress: (fraction: number) => void = () => {}): Promise<World> {
    // Hand back to the browser if this slice has run long enough.
    let sliceStarted = performance.now();
    const breathe = async (): Promise<void> => {
      if (performance.now() - sliceStarted < 12) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
      sliceStarted = performance.now();
    };

    const layout = buildLayout();
    await breathe();

    // Depth order: further up the page is further away.
    const scenery = [...layout.scenery].sort((a, b) => a.y - b.y);
    const seeds = scenery.map(() => rng.forkSeed());

    /**
     * Bake one medium and cut it into tiles, releasing the full-size canvas
     * before the next one starts.
     *
     * Both layers used to be baked before either was tiled, which meant two
     * 2800x2000 canvases plus a set of tiles alive at once — around ninety
     * megabytes of canvas at the peak. Phones do not have that to spare, and a
     * browser that refuses the allocation gives you a blank screen rather than
     * an error.
     */
    const bakeScale = pickBakeScale();

    const bakeLayer = async (medium: Medium, done: number): Promise<Layer> => {
      const surface = createSurface(WORLD_WIDTH * bakeScale, WORLD_HEIGHT * bakeScale);
      const { ctx } = surface;
      // Everything below draws in world coordinates; the transform is what puts
      // the whole valley onto a smaller sheet.
      ctx.setTransform(bakeScale, 0, 0, bakeScale, 0, 0);
      ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawGround(ctx, medium, WORLD_WIDTH, WORLD_HEIGHT);
      await breathe();
      for (const path of layout.paths) drawPath(ctx, path, medium);
      drawTufts(ctx, layout.tufts, medium);
      await breathe();

      for (let i = 0; i < scenery.length; i++) {
        rng.replay(seeds[i], () => scenery[i].draw(ctx, medium));
        if ((i & 15) === 0) {
          onProgress(done + (0.45 * (i + 1)) / scenery.length);
          await breathe();
        }
      }

      // A whisper of grain over the colour too, so both media sit on one sheet.
      if (medium === 'color') {
        isolate(ctx, () => {
          const pattern = ctx.createPattern(GRAIN, 'repeat');
          if (!pattern) return;
          ctx.globalAlpha = 0.14;
          ctx.fillStyle = pattern;
          ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        });
      }
      const tiles = toTiles(surface, bakeScale);
      onProgress(done + 0.45);
      await breathe();
      return tiles;
    };

    const layers = {
      color: await bakeLayer('color', 0.05),
      sketch: await bakeLayer('sketch', 0.5),
    };
    onProgress(1);

    const colliders = scenery.flatMap((piece) => piece.colliders ?? []);

    const occluders: Occluder[] = [];
    scenery.forEach((piece, i) => {
      if (!piece.tall || !piece.bounds) return;
      occluders.push({ scenery: piece, bounds: piece.bounds, seed: seeds[i], sprites: new Map() });
    });

    return new World(layers, colliders, occluders, layout.pond, layout.animals);
  }

  /**
   * Draw a region of a layer.
   *
   * Walks only the tiles the region touches. With a 1:1 scale this is a plain
   * copy per tile, which is the fast path in every engine.
   */
  drawRegion(
    ctx: CanvasRenderingContext2D,
    medium: Medium,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    const layer = this.layers[medium];
    const scaleX = dw / sw;
    const scaleY = dh / sh;
    // World units covered by one full tile.
    const span = TILE / layer.scale;

    const firstCol = Math.max(0, Math.floor(sx / span));
    const lastCol = Math.min(layer.columns - 1, Math.floor((sx + sw - 0.001) / span));
    const firstRow = Math.max(0, Math.floor(sy / span));
    const lastRow = Math.min(layer.rows - 1, Math.floor((sy + sh - 0.001) / span));

    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const tile = layer.tiles[row * layer.columns + col];
        const tileX = col * span;
        const tileY = row * span;
        // Overlap of the requested region with this tile, in world coordinates.
        const left = Math.max(sx, tileX);
        const top = Math.max(sy, tileY);
        const right = Math.min(sx + sw, tileX + tile.width / layer.scale);
        const bottom = Math.min(sy + sh, tileY + tile.height / layer.scale);
        if (right <= left || bottom <= top) continue;

        ctx.drawImage(
          tile,
          (left - tileX) * layer.scale,
          (top - tileY) * layer.scale,
          (right - left) * layer.scale,
          (bottom - top) * layer.scale,
          dx + (left - sx) * scaleX,
          dy + (top - sy) * scaleY,
          (right - left) * scaleX,
          (bottom - top) * scaleY,
        );
      }
    }
  }

  /**
   * Tall scenery standing in front of `body` — closer to the viewer and
   * overlapping it. These get drawn over the walker so they hide them.
   */
  *occludersInFrontOf(bodyY: number, body: Bounds): Generator<Occluder> {
    for (const occluder of this.occluders) {
      if (occluder.scenery.y <= bodyY) continue; // behind the walker
      if (!boundsOverlap(occluder.bounds, body)) continue;
      yield occluder;
    }
  }

  /** The occluder rendered on its own transparent canvas, cached per medium. */
  spriteFor(occluder: Occluder, medium: Medium): OccluderSprite {
    const cached = occluder.sprites.get(medium);
    if (cached) return cached;
    this.bakeCount++;

    const { bounds } = occluder;
    const width = Math.ceil(bounds.x1 - bounds.x0) + SPRITE_PAD * 2;
    const height = Math.ceil(bounds.y1 - bounds.y0) + SPRITE_PAD * 2;
    const { canvas, ctx } = createSurface(width, height);
    ctx.translate(-bounds.x0 + SPRITE_PAD, -bounds.y0 + SPRITE_PAD);

    // Same seed as the bake, and no ground shadow: the shadow is already on the
    // ground underneath, and drawing it twice would darken it.
    rng.replay(occluder.seed, () => {
      withoutGroundShadows(() => occluder.scenery.draw(ctx, medium));
    });

    const sprite: OccluderSprite = {
      canvas,
      x: bounds.x0 - SPRITE_PAD,
      y: bounds.y0 - SPRITE_PAD,
    };
    occluder.sprites.set(medium, sprite);

    // Bounded. These are baked lazily as you walk past things, so left
    // unchecked the cache grows with everything you have ever seen — which on a
    // phone is memory the tab does not have to spare.
    this.spriteOrder.push({ occluder, medium });
    while (this.spriteOrder.length > MAX_OCCLUDER_SPRITES) {
      const oldest = this.spriteOrder.shift();
      if (!oldest) break;
      const stale = oldest.occluder.sprites.get(oldest.medium);
      if (stale) {
        stale.canvas.width = 1;
        stale.canvas.height = 1;
        oldest.occluder.sprites.delete(oldest.medium);
      }
    }
    return sprite;
  }
}

/** Slice a baked layer into tiles and release the big canvas. */
function toTiles(source: Surface, scale: number): Layer {
  const pixelWidth = source.canvas.width;
  const pixelHeight = source.canvas.height;
  const columns = Math.ceil(pixelWidth / TILE);
  const rows = Math.ceil(pixelHeight / TILE);
  const tiles: HTMLCanvasElement[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const width = Math.min(TILE, pixelWidth - col * TILE);
      const height = Math.min(TILE, pixelHeight - row * TILE);
      const tile = createSurface(width, height);
      tile.ctx.drawImage(source.canvas, -col * TILE, -row * TILE);
      tiles.push(tile.canvas);
    }
  }

  // Let the oversized scratch canvas go; the tiles are the world now.
  source.canvas.width = 1;
  source.canvas.height = 1;
  return { tiles, columns, rows, scale };
}

export type { Occluder, OccluderSprite };
