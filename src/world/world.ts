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
}

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
  readonly pond: Ellipse;
  readonly animalSpawns: readonly AnimalSpawn[];

  private readonly occluders: Occluder[];

  private constructor(
    layers: Record<Medium, Layer>,
    colliders: Collider[],
    occluders: Occluder[],
    pond: Ellipse,
    animalSpawns: AnimalSpawn[],
  ) {
    this.layers = layers;
    this.colliders = colliders;
    this.occluders = occluders;
    this.pond = pond;
    this.animalSpawns = animalSpawns;
  }

  /** Lay the world out and bake both media. Runs once, costs a few hundred ms. */
  static generate(): World {
    const layout = buildLayout();

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
    const bakeLayer = (medium: Medium): Layer => {
      const surface = createSurface(WORLD_WIDTH, WORLD_HEIGHT);
      const { ctx } = surface;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawGround(ctx, medium, WORLD_WIDTH, WORLD_HEIGHT);
      for (const path of layout.paths) drawPath(ctx, path, medium);
      drawTufts(ctx, layout.tufts, medium);
      scenery.forEach((piece, i) => {
        rng.replay(seeds[i], () => piece.draw(ctx, medium));
      });

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
      return toTiles(surface);
    };

    const layers = { color: bakeLayer('color'), sketch: bakeLayer('sketch') };

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

    const firstCol = Math.max(0, Math.floor(sx / TILE));
    const lastCol = Math.min(layer.columns - 1, Math.floor((sx + sw - 0.001) / TILE));
    const firstRow = Math.max(0, Math.floor(sy / TILE));
    const lastRow = Math.min(layer.rows - 1, Math.floor((sy + sh - 0.001) / TILE));

    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const tile = layer.tiles[row * layer.columns + col];
        // Overlap of the requested region with this tile, in world coordinates.
        const left = Math.max(sx, col * TILE);
        const top = Math.max(sy, row * TILE);
        const right = Math.min(sx + sw, col * TILE + tile.width);
        const bottom = Math.min(sy + sh, row * TILE + tile.height);
        if (right <= left || bottom <= top) continue;

        ctx.drawImage(
          tile,
          left - col * TILE,
          top - row * TILE,
          right - left,
          bottom - top,
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
    return sprite;
  }
}

/** Slice a baked layer into tiles and release the big canvas. */
function toTiles(source: Surface): Layer {
  const columns = Math.ceil(WORLD_WIDTH / TILE);
  const rows = Math.ceil(WORLD_HEIGHT / TILE);
  const tiles: HTMLCanvasElement[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const width = Math.min(TILE, WORLD_WIDTH - col * TILE);
      const height = Math.min(TILE, WORLD_HEIGHT - row * TILE);
      const tile = createSurface(width, height);
      tile.ctx.drawImage(source.canvas, -col * TILE, -row * TILE);
      tiles.push(tile.canvas);
    }
  }

  // Let the oversized scratch canvas go; the tiles are the world now.
  source.canvas.width = 1;
  source.canvas.height = 1;
  return { tiles, columns, rows };
}

export type { Occluder, OccluderSprite };
