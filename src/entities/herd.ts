import { createSurface, type Surface } from '../core/canvas';
import { clamp, TAU } from '../core/math';
import { rnd, rr } from '../core/rng';
import { withBoil } from '../media/ink';
import type { Medium } from '../media/medium';
import { drawAnimalLive, makeAnimal, type Animal } from './animals';
import type { AnimalKind } from './animalKinds';

/**
 * What the herd needs from the rest of the game, passed in rather than imported.
 *
 * Keeps this module free of the player, the mask and the world — it can be
 * driven by a test with three small functions.
 */
export interface HerdContext {
  readonly walkerX: number;
  readonly walkerY: number;
  /** Has the colour reached this spot? */
  isAwakeAt(x: number, y: number, pad: number): boolean;
  /** Push a body out of solid scenery. */
  resolveCollisions(body: { x: number; y: number }, radius: number): void;
}

/** Generous enough for the largest animal at its largest scale. */
const SPRITE_WIDTH = 120;
const SPRITE_HEIGHT = 110;
const SPRITE_ORIGIN_X = 60;
const SPRITE_ORIGIN_Y = 88;

/** Slots per row in the atlas. */
const ATLAS_COLUMNS = 5;

/** How close the walker can get before an animal moves off. */
const SHY_DISTANCE: Record<AnimalKind, number> = {
  chicken: 78,
  sheep: 66,
  cow: 66,
  cat: 0,
};

export class Herd {
  readonly animals: Animal[];

  /**
   * Every frozen animal's cached still, packed into one canvas.
   *
   * They used to be a canvas each. Firefox treats every distinct source surface
   * in a frame as something to synchronise, and a field of livestock meant
   * twenty-odd of them per frame — which showed up in a profile as a busy
   * thread doing little but memcpy and buffer mapping. One atlas is one source.
   */
  private readonly atlas: Surface;

  constructor(
    spawns: readonly {
      kind: AnimalKind;
      x: number;
      y: number;
      homeRadius: number;
      scale: number;
    }[],
  ) {
    this.animals = spawns.map((s) => makeAnimal(s.kind, s.x, s.y, s.homeRadius, s.scale));
    this.animals.forEach((a, i) => (a.slot = i));
    const rows = Math.ceil(this.animals.length / ATLAS_COLUMNS);
    this.atlas = createSurface(ATLAS_COLUMNS * SPRITE_WIDTH, rows * SPRITE_HEIGHT);
  }

  /** Release the sprite atlas. See `World.dispose`. */
  dispose(): void {
    this.atlas.canvas.width = 1;
    this.atlas.canvas.height = 1;
  }

  /** Send every animal back out to pasture. */
  scatter(): void {
    for (const a of this.animals) {
      const angle = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * a.homeRadius;
      a.x = a.homeX + Math.cos(angle) * d;
      a.y = a.homeY + Math.sin(angle) * d;
      a.state = 'graze';
      a.timer = rr(0.5, 4);
      a.headDown = 1;
      a.moving = false;
      a.frozen = false;
    }
  }

  update(dt: number, ctx: HerdContext): void {
    for (const a of this.animals) {
      a.awake = ctx.isAwakeAt(a.x, a.y, 8);
      // Asleep means asleep: no clock, no wandering, no tail. It is a drawing.
      if (!a.awake) continue;

      a.frozen = false;
      a.clock += dt;
      if (a.kind === 'cat') continue; // committed to the nap

      this.step(a, dt, ctx);
      ctx.resolveCollisions(a, 11 * a.scale);
    }
    // Painter's algorithm among themselves.
    this.animals.sort((p, q) => p.y - q.y);
  }

  private step(a: Animal, dt: number, ctx: HerdContext): void {
    a.timer -= dt;

    const dx = a.x - ctx.walkerX;
    const dy = a.y - ctx.walkerY;
    const distance = Math.hypot(dx, dy);
    const shy = SHY_DISTANCE[a.kind];

    if (distance < shy && distance > 0.001) {
      // Startled: pick a spot further off, but stay within the home field.
      a.state = 'walk';
      a.targetX = a.homeX + clamp(a.x - a.homeX + (dx / distance) * 110, -a.homeRadius, a.homeRadius);
      a.targetY = a.homeY + clamp(a.y - a.homeY + (dy / distance) * 110, -a.homeRadius, a.homeRadius);
      if (a.timer < 0.6) a.timer = 0.6;
    } else if (a.timer <= 0) {
      if (a.state === 'walk') {
        a.state = rnd() < 0.72 ? 'graze' : 'idle';
        a.timer = rr(2.5, 8);
      } else {
        a.state = 'walk';
        a.timer = rr(1.2, 3.6);
        const angle = rnd() * TAU;
        const d = Math.sqrt(rnd()) * a.homeRadius;
        a.targetX = a.homeX + Math.cos(angle) * d;
        a.targetY = a.homeY + Math.sin(angle) * d;
      }
    }

    let speed = 0;
    if (a.state === 'walk') {
      const vx = a.targetX - a.x;
      const vy = a.targetY - a.y;
      const d = Math.hypot(vx, vy);
      if (d < 5) {
        a.state = 'graze';
        a.timer = rr(2.5, 8);
      } else {
        speed = a.speed * (distance < shy ? 1.9 : 1); // trot when startled
        a.x += (vx / d) * speed * dt;
        a.y += (vy / d) * speed * dt;
        if (Math.abs(vx) > 2) a.face = vx < 0 ? -1 : 1;
      }
    }

    a.moving = speed > 1;
    a.walkPhase += speed * dt * 0.42;

    const wanted = a.state === 'graze' ? 1 : 0;
    a.headDown += (wanted - a.headDown) * Math.min(1, 3.2 * dt);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    medium: Medium,
    isVisible: (x: number, y: number) => boolean,
  ): void {
    for (const a of this.animals) {
      if (!isVisible(a.x, a.y)) continue;
      if (a.awake) {
        withBoil(true, () => drawAnimalLive(ctx, a, medium));
        continue;
      }
      // Asleep: invisible in the colour pass, a cached still in the pencil one.
      if (medium === 'color') continue;
      if (!a.frozen) this.freeze(a);
      const col = a.slot % ATLAS_COLUMNS;
      const row = Math.floor(a.slot / ATLAS_COLUMNS);
      ctx.drawImage(
        this.atlas.canvas,
        col * SPRITE_WIDTH,
        row * SPRITE_HEIGHT,
        SPRITE_WIDTH,
        SPRITE_HEIGHT,
        a.x - SPRITE_ORIGIN_X,
        a.y - SPRITE_ORIGIN_Y,
        SPRITE_WIDTH,
        SPRITE_HEIGHT,
      );
    }
  }

  /**
   * Stroking a sheep costs ~18 separate paths. A field of frozen livestock was
   * ~400 stroke calls a frame for a picture that never changes; this makes it
   * one blit each, all from the same atlas.
   */
  private freeze(a: Animal): void {
    const col = a.slot % ATLAS_COLUMNS;
    const row = Math.floor(a.slot / ATLAS_COLUMNS);
    const { ctx } = this.atlas;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(col * SPRITE_WIDTH, row * SPRITE_HEIGHT, SPRITE_WIDTH, SPRITE_HEIGHT);
    ctx.translate(col * SPRITE_WIDTH + SPRITE_ORIGIN_X, row * SPRITE_HEIGHT + SPRITE_ORIGIN_Y);

    const worldX = a.x;
    const worldY = a.y;
    a.x = 0;
    a.y = 0;
    // Boil off: a still drawing must not shimmer.
    withBoil(false, () => drawAnimalLive(ctx, a, 'sketch'));
    a.x = worldX;
    a.y = worldY;
    ctx.restore();

    a.frozen = true;
  }
}
