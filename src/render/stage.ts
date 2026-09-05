import Phaser from 'phaser';
import { context2d } from '../core/canvas';
import type { Medium } from '../media/medium';

/**
 * The Phaser side of the frame: three cameras, the baked valley, and a pool of
 * small canvases for everything that is drawn by hand.
 *
 * Why this exists at all. On Canvas2D the whole viewport was re-blitted from
 * the baked tiles every frame, twice — once in pencil and once in colour — and
 * the colour was then cut to the haze. Neither of those is a thing a browser
 * does cheaply: the cut was either `destination-in`, which drops an accelerated
 * canvas onto the software rasteriser permanently, or a CSS mask, which the
 * compositor repaints at screen resolution. Measured on real hardware, walking
 * the valley with thirteen paint pots found, that frame cost 40% of a core and
 * climbed to over 100% across a session. The same frame here costs 14% and
 * stays there.
 *
 * The reason is not that Phaser is clever. It is that a tile handed to the GPU
 * once is never touched again — the camera moves instead of the picture — and
 * that cutting a layer to a soft shape is one multiply in a fragment shader,
 * which is where that operation has always belonged.
 *
 * The layers are cameras rather than canvas elements. Each camera is told which
 * objects to ignore, and only the colour camera wears the haze.
 */

/** How the three layers of the frame map onto cameras. */
export type Layer = 'sketch' | 'colour' | 'over';

/**
 * How often a hand-drawn thing's strokes are re-uploaded, in hertz.
 *
 * Not sixty, and this is the measurement that shaped the whole design. Redrawing
 * every live thing every frame costs 48% of a core; at fifteen it is 24% and at
 * seven it is 20%, against a floor of 15% with no live things at all. Position
 * is not stepped — that is a transform on a sprite and costs nothing, so things
 * still move at sixty frames a second. Only the strokes hold for a few frames,
 * which is what pencil already does: the boil in `media/ink.ts` ticks seven
 * times a second, and the drawing has always been stepped to it.
 */
const CEL_HZ = 12;

/**
 * Whether the finished frame can be read back after the fact.
 *
 * Only the tests want this, and it costs the driver a full-screen copy every
 * frame, so it is not on by default. See the note in the game config below.
 */
const READ_BACK =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('readback');

/**
 * A short string that changes whenever a thing's own state does.
 *
 * This is what decides whether a drawing has to be painted again, and it is
 * derived rather than listed on purpose. The first version had the caller name
 * the fields that mattered — `face`, `walkPhase`, `awake` — and that is a list
 * that goes out of date the first time somebody adds a field to an animal and
 * does not think about the renderer. The failure is quiet and horrible: the
 * thing keeps its old drawing until the next tick of the boil, so the fault
 * only shows as a shiver, and only sometimes.
 *
 * So it reads whatever the object actually holds. One level deep, primitives
 * only; anything else contributes its length or nothing. A couple of dozen
 * property reads per thing per frame, against an upload of a hundred kilobytes
 * if we get it wrong.
 */
const IGNORED_POSE_KEYS = new Set([
  'x',
  'y',
  'targetX',
  'targetY',
  'homeX',
  'homeY',
  'homeRadius',
  'speed',
  'clock',
  'beastClock',
  'timer',
  'collectedAt',
  'burstCount',
  'purr',
  /*
   * Continuous animation phases. These change every frame while something
   * moves, which defeated the step counter: a frog surfacing, whose `dive`
   * eases 0..1 over a third of a second, repainted its 220px cel sixty times a
   * second instead of twelve — and a shoal of them at the pond is what made
   * fishing heavy. The strokes are stepped drawings; the step counter is what
   * steps them, and the pose is for discrete state only.
   */
  'walkPhase',
  'headDown',
  'dive',
]);

export function poseOf(value: unknown, depth = 1): string {
  if (value === null || value === undefined) return '';
  const type = typeof value;
  if (type === 'number') return (value as number).toFixed(2);
  if (type === 'string' || type === 'boolean') return String(value);
  if (type !== 'object') return '';
  if (Array.isArray(value)) {
    return depth > 0 ? value.map((item) => poseOf(item, depth - 1)).join(',') : String(value.length);
  }
  // Anything with a backing store of its own — a canvas, an image — is not
  // state; it is the drawing. Its identity is enough.
  if (value instanceof HTMLElement) return value.tagName;
  if (depth <= 0) return '';
  let out = '';
  for (const key of Object.keys(value)) {
    if (IGNORED_POSE_KEYS.has(key)) continue;
    out += `${key}=${poseOf((value as Record<string, unknown>)[key], depth - 1)};`;
  }
  return out;
}

/**
 * A hand-drawn thing, on its own small canvas, shown as a sprite.
 *
 * The draw functions in `entities/` and `world/` are not changed by any of
 * this: they still take a 2D context and draw at world coordinates. The trick
 * is the translate — the cel puts the entity's own position at the centre of a
 * small canvas, so `drawLion(ctx, lion, medium)` paints into a 220px square
 * instead of into the window, and the square is then placed in the world.
 */
class Cel {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: Phaser.Textures.CanvasTexture;
  readonly image: Phaser.GameObjects.Image;
  /** What the strokes currently on the canvas were painted for. */
  key = '';
  /** The frame this cel was last asked for, so unused ones can be hidden. */
  touched = -1;

  constructor(
    scene: Phaser.Scene,
    textureKey: string,
    readonly width: number,
    readonly height: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = context2d(this.canvas);
    const texture = scene.textures.addCanvas(textureKey, this.canvas);
    if (!texture) throw new Error(`cel texture ${textureKey} refused`);
    this.texture = texture;
    this.image = scene.add.image(0, 0, textureKey).setOrigin(0, 0);
  }

  /**
   * Repaint the strokes, with `left`/`top` the world point at the cel's corner.
   *
   * The context is translated and nothing else, so the draw functions in
   * `entities/` and `world/` go on drawing at world coordinates exactly as they
   * did when they were drawing into the window.
   */
  paint(left: number, top: number, draw: (ctx: CanvasRenderingContext2D) => void): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.translate(-left, -top);
    draw(ctx);
    this.texture.refresh();
  }

  destroy(): void {
    this.image.destroy();
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}

/**
 * The valley, its three cameras, and every sprite in the frame.
 *
 * Phaser boots asynchronously, so nothing here is usable until `ready` is true;
 * the renderer draws nothing until then, which is a frame or two at startup and
 * is invisible behind the loading screen.
 */
export class Stage {
  private game: Phaser.Game;
  private scene: Phaser.Scene | undefined;

  ready = false;

  /** Frames Phaser has drawn, and frames we asked it to. They must agree. */
  private drawn = 0;
  private asked = 0;

  /** The pencil valley, the coloured valley, and everything standing over it. */
  private cameras: Record<Layer, Phaser.Cameras.Scene2D.Camera> | undefined;

  /** The haze sprite the colour camera is masked by. */
  private haze: Phaser.GameObjects.Image | undefined;

  private readonly cels = new Map<string, Cel>();
  /** Bumped once per frame, so cels nobody asked for can be hidden. */
  private frameNumber = 0;
  /** Bumped at `CEL_HZ`, and part of every cel's key. */
  private celStep = 0;

  private nextTextureId = 0;

  /**
   * Pixels re-uploaded this frame, and by whom.
   *
   * The one number that matters for the cost of this design. Everything else in
   * the frame is a transform; a repaint is a texture upload, and a cel that is
   * bigger than the thing it holds is pure waste that nothing else will show —
   * the frame rate stays at sixty and the cost lands in another process. Kept
   * permanently for that reason.
   */
  uploadedPx = 0;
  readonly uploadedBy = new Map<string, number>();

  constructor(parent: HTMLElement, private readonly onReady: () => void) {
    const stage = this;
    class Valley extends Phaser.Scene {
      create(): void {
        stage.build(this);
      }
      override update(): void {
        stage.countDrawn();
      }
    }
    this.game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent,
      width: Math.max(1, parent.clientWidth || globalThis.innerWidth),
      height: Math.max(1, parent.clientHeight || globalThis.innerHeight),
      banner: false,
      /*
       * Keeping the drawing buffer is asked for, not assumed.
       *
       * Every test that asks what colour a pixel is reads the canvas back from
       * a later task, and without this the buffer has been discarded by then
       * and comes back empty. But it is not free: the driver has to hold and
       * copy a full-screen buffer it would otherwise hand straight over, and
       * measured here that is worth about ten points of a core at 1864x913.
       *
       * So it is off in play and on when something wants to look. `?readback`
       * in the address, which `tests/harness.js` appends.
       */
      render: { preserveDrawingBuffer: READ_BACK },
      /* The paper shows through everywhere the valley does not reach. */
      transparent: true,
      scale: { mode: Phaser.Scale.NONE, autoRound: true },
      scene: Valley,
    });
  }

  /** Called by the scene once Phaser has a renderer and a context. */
  private build(scene: Phaser.Scene): void {
    this.scene = scene;
    const width = scene.scale.width;
    const height = scene.scale.height;

    const main = scene.cameras.main;
    const colour = scene.cameras.add(0, 0, width, height);
    const over = scene.cameras.add(0, 0, width, height);
    colour.transparent = true;
    over.transparent = true;
    this.cameras = { sketch: main, colour, over };

    /*
     * Phaser's own loop is stopped, and the frame is stepped by hand.
     *
     * The game already has a loop and it drives the simulation. Two loops means
     * two ideas of what time it is, and half the frames on screen drawn from
     * where everything was *last* time — which reads as the whole picture
     * shivering as you walk, and is what it did: `sleep()` was tried first and
     * does not stop the request-animation-frame at all. Counted, that was three
     * hundred frames of ours against six hundred of Phaser's.
     *
     * `stop()` does stop it. One clock.
     */
    this.game.loop.stop();

    this.ready = true;
    this.onReady();
  }

  /** Put a game object on one layer, and out of the other two. */
  private assign(object: Phaser.GameObjects.GameObject, layer: Layer): void {
    const cameras = this.cameras;
    if (!cameras) return;
    for (const other of ['sketch', 'colour', 'over'] as Layer[]) {
      if (other !== layer) cameras[other].ignore(object);
    }
  }

  /**
   * A canvas that was baked elsewhere, shown as a sprite and uploaded once.
   *
   * The world's tiles and its occluder sprites both arrive this way. Neither is
   * ever redrawn, so after the first frame that shows one there is no cost at
   * all beyond the camera moving.
   *
   * The canvas is watched for identity rather than assumed constant, because
   * occluder sprites are baked lazily and evicted past a cap of forty-eight —
   * `World` shrinks the old canvas to a pixel on the way out, and a texture
   * still pointing at it would show as a one-pixel smear.
   */
  sprite(request: {
    id: string;
    layer: Layer;
    canvas: HTMLCanvasElement;
    left: number;
    top: number;
    width: number;
    height: number;
    depth: number;
    /**
     * Stays for the life of the world — the valley's tiles and the baked sky.
     * Never hidden for being off-screen and never evicted; the camera simply
     * scrolls them in and out of view.
     */
    persistent?: boolean;
  }): void {
    const scene = this.scene;
    if (!scene) return;
    let held = this.sprites.get(request.id);
    if (held && held.canvas !== request.canvas) {
      held.image.destroy();
      scene.textures.remove(held.key);
      this.sprites.delete(request.id);
      held = undefined;
    }
    if (!held) {
      const key = `sprite${this.nextTextureId++}`;
      if (!scene.textures.addCanvas(key, request.canvas)) return;
      const image = scene.add.image(0, 0, key).setOrigin(0, 0);
      this.assign(image, request.layer);
      held = { key, canvas: request.canvas, image, touched: -1, persistent: request.persistent };
      this.sprites.set(request.id, held);
    }
    held.touched = this.frameNumber;
    held.image.setVisible(true).setDepth(request.depth);
    held.image.setPosition(request.left, request.top);
    held.image.setDisplaySize(request.width, request.height);
  }

  private readonly sprites = new Map<
    string,
    {
      key: string;
      canvas: HTMLCanvasElement;
      image: Phaser.GameObjects.Image;
      touched: number;
      persistent?: boolean;
    }
  >();

  /**
   * Ask for a hand-drawn thing to be on screen this frame.
   *
   * `pose` is whatever the strokes depend on: a facing, whether an animal is
   * awake, which frame of a walk it is on. An `animated` thing also repaints on
   * the step counter, so its boil keeps ticking even when nothing else about it
   * changed; a still one is painted once and then only when its pose does.
   *
   * When neither has changed the canvas is left exactly as it is and only the
   * sprite's position is written. That is the whole saving — position is a
   * transform and free, strokes are an upload and are not.
   */
  cel(request: {
    id: string;
    layer: Layer;
    medium: Medium;
    /** The world rectangle the strokes are allowed to occupy. */
    left: number;
    top: number;
    width: number;
    height: number;
    depth: number;
    pose?: string | number;
    animated?: boolean;
    /**
     * Does this cel belong to the world rather than to a moving thing?
     *
     * An ordinary cel is *attached*: it was painted with its subject at the
     * centre of its own canvas, so moving the canvas moves the subject and the
     * position may change every frame without a repaint. An anchored one — the
     * sky, the motes of colour — covers a patch of the world instead, so
     * moving it would drag that patch along with the camera. Its position is
     * part of what it was painted for, and changing it forces a repaint; the
     * caller is expected to quantise the position so that is rare.
     */
    anchored?: boolean;
    draw: (ctx: CanvasRenderingContext2D) => void;
  }): void {
    const scene = this.scene;
    if (!scene) return;
    const width = Math.max(1, Math.ceil(request.width));
    const height = Math.max(1, Math.ceil(request.height));
    const slot = `${request.id}:${request.medium}`;
    let cel = this.cels.get(slot);
    if (!cel || cel.width !== width || cel.height !== height) {
      if (cel) {
        cel.destroy();
        this.cels.delete(slot);
      }
      cel = new Cel(scene, `cel${this.nextTextureId++}`, width, height);
      this.cels.set(slot, cel);
      this.assign(cel.image, request.layer);
    }
    cel.touched = this.frameNumber;
    cel.image.setVisible(true).setDepth(request.depth);

    /*
     * The cel is placed where it was painted, every frame, and that is what
     * lets the strokes be stepped while the movement is not: the thing was
     * drawn at the centre of its own canvas, so carrying the canvas along
     * carries the drawing with it. Position is a transform and free; strokes
     * are an upload and are not.
     *
     * Nothing is rounded. Snapping was load-bearing on Canvas2D — a fractional
     * source rectangle made `drawImage` resample at 5.2x the cost — and is
     * pointless here, where a fractional position is what the vertex shader
     * does for a living.
     */
    cel.image.setPosition(request.left, request.top);

    const step = request.animated === false ? '' : this.celStep;
    const where = request.anchored ? `${request.left},${request.top}` : '';
    const key = `${step}|${request.pose ?? ''}|${where}`;
    if (cel.key !== key) {
      cel.key = key;
      cel.paint(request.left, request.top, request.draw);
      const px = width * height;
      this.uploadedPx += px;
      this.uploadedBy.set(request.id, (this.uploadedBy.get(request.id) ?? 0) + px);
    }
  }

  /**
   * A stamp: one baked canvas shown many times over, at a position and a size.
   *
   * For the motes of colour, which are discs of one of four colours and nothing
   * else. Drawn into a canvas they were the most expensive thing in the frame,
   * because they drift out to the edge of the light and so the canvas holding
   * them was as wide as the colour is. As sprites they are transforms, and
   * fifty transforms is not a cost.
   *
   * The pool is kept between frames and only grows; `endStamps` hides whatever
   * was not used, so a splash of twenty-six does not churn objects.
   */
  stamp(
    layer: Layer,
    canvas: HTMLCanvasElement,
    x: number,
    y: number,
    radius: number,
    alpha: number,
    depth: number,
  ): void {
    const scene = this.scene;
    if (!scene) return;
    let key = this.stampKeys.get(canvas);
    if (!key) {
      key = `stamp${this.nextTextureId++}`;
      if (!scene.textures.addCanvas(key, canvas)) return;
      this.stampKeys.set(canvas, key);
    }
    let image = this.stamps[this.stampsUsed];
    if (!image) {
      image = scene.add.image(0, 0, key);
      this.assign(image, layer);
      this.stamps.push(image);
    }
    this.stampsUsed++;
    image.setTexture(key);
    image.setVisible(true);
    image.setPosition(x, y);
    image.setDisplaySize(radius * 2, radius * 2);
    image.setAlpha(alpha);
    image.setDepth(depth);
  }

  private readonly stamps: Phaser.GameObjects.Image[] = [];
  private readonly stampKeys = new Map<HTMLCanvasElement, string>();
  private stampsUsed = 0;

  /** Hide the stamps nobody asked for, and start counting again. */
  endStamps(): void {
    for (let i = this.stampsUsed; i < this.stamps.length; i++) this.stamps[i].setVisible(false);
    this.stampsUsed = 0;
  }

  /** What has been re-uploaded since this was last called, biggest first. */
  uploadReport(): { totalMb: number; worst: string } {
    const worst = [...this.uploadedBy.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, px]) => `${id} ${(px / 262144).toFixed(1)}`)
      .join('  ');
    const totalMb = [...this.uploadedBy.values()].reduce((a, b) => a + b, 0) / 262144;
    this.uploadedBy.clear();
    return { totalMb: Math.round(totalMb * 10) / 10, worst };
  }

  /** Hide everything nobody asked for this frame, and start the next one. */
  endFrame(): void {
    const scene = this.scene;
    // Cels: if not touched this frame, hide it. If untouched for 180 frames (~3 sec), clean it up.
    for (const [slot, cel] of this.cels.entries()) {
      if (cel.touched !== this.frameNumber) {
        cel.image.setVisible(false);
        if (this.frameNumber - cel.touched > 180) {
          cel.destroy();
          if (scene) scene.textures.remove(cel.texture.key);
          this.cels.delete(slot);
        }
      }
    }
    // Sprites: persistent ones (tiles, the sky strip) stay whatever happens;
    // dynamic ones (occluders) are hidden when unused and evicted after a spell.
    for (const [id, held] of this.sprites.entries()) {
      if (held.persistent || held.touched === this.frameNumber) continue;
      held.image.setVisible(false);
      if (this.frameNumber - held.touched > 180) {
        held.image.destroy();
        if (scene) scene.textures.remove(held.key);
        this.sprites.delete(id);
      }
    }
    this.frameNumber++;
  }

  /** Advance the step that stepped drawings are keyed on. */
  setElapsed(elapsed: number): void {
    this.celStep = Math.floor(elapsed * CEL_HZ);
  }

  /** The haze that cuts the colour, as a sprite the mask filter reads. */
  setHaze(canvas: HTMLCanvasElement, spriteRadius: number): void {
    const scene = this.scene;
    const cameras = this.cameras;
    if (!scene || !cameras || this.haze) return;
    const key = 'haze';
    if (!scene.textures.exists(key) && !scene.textures.addCanvas(key, canvas)) return;
    this.haze = scene.add.image(0, 0, key);
    /*
     * The haze is not on any camera. It is only ever read by the mask filter,
     * which renders it to a texture of its own; left visible it would also be
     * painted into the frame as a white blob.
     */
    for (const layer of ['sketch', 'colour', 'over'] as Layer[]) {
      cameras[layer].ignore(this.haze);
    }
    this.hazeSpriteRadius = spriteRadius;
    cameras.colour.filters.internal.addMask(this.haze);
  }

  private hazeSpriteRadius = 1;

  /**
   * Where the haze is and how big, in world units.
   *
   * All three are transforms on a sprite, so unlike the CSS mask this replaced
   * they may change every frame for nothing — which is what lets the haze
   * breathe and turn again.
   */
  placeHaze(x: number, y: number, radius: number, angle: number): void {
    const haze = this.haze;
    if (!haze) return;
    haze.setPosition(x, y);
    haze.setScale(radius / this.hazeSpriteRadius);
    haze.setRotation(angle);
  }

  /** Point all three cameras at the same place. */
  look(centreX: number, centreY: number, zoom: number): void {
    const cameras = this.cameras;
    if (!cameras) return;
    for (const layer of ['sketch', 'colour', 'over'] as Layer[]) {
      const camera = cameras[layer];
      camera.setZoom(zoom);
      camera.centerOn(centreX, centreY);
    }
  }

  resize(width: number, height: number): void {
    this.game.scale.resize(width, height);
    const cameras = this.cameras;
    if (!cameras) return;
    for (const layer of ['sketch', 'colour', 'over'] as Layer[]) {
      cameras[layer].setSize(width, height);
    }
  }

  /** Draw one frame. The game's own loop decides when. */
  step(time: number, delta: number): void {
    if (!this.ready) return;
    /*
     * Take the loop away from Phaser here rather than at boot, and keep taking
     * it. Stopping it inside `create()` does not stick — the scene is created
     * from within the loop's own first step and it is running again by the
     * time that returns — and it comes back by itself when the tab is focused.
     * Checked every frame because the cost of missing it is that half the
     * frames on screen are drawn from where things were last time, which reads
     * as the picture shivering as you walk.
     */
    if (this.loopRunning) this.game.loop.stop();
    this.asked++;
    this.game.step(time, delta);
  }

  /** Counted from inside the scene, which is the only honest place to count. */
  countDrawn(): void {
    this.drawn++;
  }

  private get loopRunning(): boolean {
    return (this.game.loop as unknown as { running: boolean }).running;
  }

  /** What the frame actually did, for the diagnostics. See `Renderer.pacing`. */
  get pacing(): { asked: number; drawn: number; scrollX: number; scrollY: number } {
    const camera = this.cameras?.sketch;
    return {
      asked: this.asked,
      drawn: this.drawn,
      scrollX: camera?.scrollX ?? 0,
      scrollY: camera?.scrollY ?? 0,
    };
  }

  /** Show or hide a whole layer, for finding out what it costs. */
  showLayer(layer: Layer, on: boolean): void {
    const cameras = this.cameras;
    if (!cameras) return;
    cameras[layer].setVisible(on);
  }

  /** The canvas Phaser draws into, for anything that must sit over the frame. */
  get canvas(): HTMLCanvasElement | undefined {
    return this.game.canvas ?? undefined;
  }

  dispose(): void {
    for (const cel of this.cels.values()) cel.destroy();
    this.cels.clear();
    for (const held of this.sprites.values()) held.image.destroy();
    this.sprites.clear();
    this.game.destroy(true, false);
  }
}
