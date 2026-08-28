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

/**
 * How near the float has to land for a frog to want no part of it.
 *
 * Whatever is nearest goes regardless of this, so a cast always startles
 * something; the radius is only for how many of its neighbours go with it.
 */
const FROG_SCARE = 150;

/** How far behind its mother a chick will tolerate being before it hurries. */
const CHICK_LEASH = 9;

/** How long a frog stays down after the rod is packed away. */
const FROG_SURFACE_DELAY = [0.8, 3.2] as const;

/** Seconds to get under, and the slower seconds to come back up. */
const DIVE_SECONDS = 0.34;
const SURFACE_SECONDS = 0.7;

/** How close the walker can get before an animal moves off. */
const SHY_DISTANCE: Record<AnimalKind, number> = {
  chicken: 78,
  hen: 74,
  /*
   * Zero, and not because it is brave.
   *
   * A chick that fled the walker on its own account would scatter away from its
   * mother, which is the one thing it must never do. It runs when she runs,
   * because it follows her.
   */
  chick: 0,
  sheep: 66,
  cow: 66,
  cat: 0,
  frog: 0,
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

  /** The chick's mother, and the only thing it steers by. */
  private readonly hen: Animal | undefined;

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
    this.hen = this.animals.find((a) => a.kind === 'hen');
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
      a.purr = 0;
      a.diving = false;
      a.dive = 0;
    }

    /*
     * Except the chick, which is put back beside its mother.
     *
     * Everything else here is scattered to a random spot in its own patch of
     * ground, and for a moment that is what the chick got too — its own corner
     * of the run, a hen's width away from her, which it then had to run across
     * the field to fix. A new world should open on the pair of them together.
     */
    const chick = this.animals.find((a) => a.kind === 'chick');
    if (chick && this.hen) {
      chick.x = this.hen.x + (Math.random() < 0.5 ? -12 : 12);
      chick.y = this.hen.y + 5;
    }
  }

  update(dt: number, ctx: HerdContext): void {
    for (const a of this.animals) {
      a.awake = ctx.isAwakeAt(a.x, a.y, 8);
      // Asleep means asleep: no clock, no wandering, no tail. It is a drawing.
      if (!a.awake) continue;

      a.frozen = false;
      a.clock += dt;
      if (a.kind === 'cat') {
        // Committed to the nap. The only thing that changes is how pleased she
        // is about it, which `Game.pet` tops back up.
        a.purr = Math.max(0, a.purr - dt);
        continue;
      }

      /*
       * A frog stays on its lily pad, and must not be asked to resolve
       * collisions to do it: the pond is a solid collider as far as walking is
       * concerned, so one step of that would shove every frog onto the bank.
       *
       * All it does is get under the water and come back out again.
       */
      if (a.kind === 'frog') {
        if (a.diving) {
          a.dive = Math.min(1, a.dive + dt / DIVE_SECONDS);
        } else if (a.timer > 0) {
          // Waiting it out down there. They do not all reappear together.
          a.timer -= dt;
        } else if (a.dive > 0) {
          a.dive = Math.max(0, a.dive - dt / SURFACE_SECONDS);
        }
        continue;
      }

      if (a.kind === 'chick') {
        this.stepChick(a, dt, ctx);
        continue;
      }

      this.step(a, dt, ctx);
      ctx.resolveCollisions(a, 11 * a.scale);
    }
    // Painter's algorithm among themselves.
    this.animals.sort((p, q) => p.y - q.y);
  }

  /**
   * Something has landed on the water: send the frogs near it under.
   *
   * The nearest one always goes, near or not. A cast that startled nothing
   * because the float happened to come down in an empty corner would read as
   * the feature being broken rather than as the pond being big.
   *
   * Safe to call every frame — a frog already diving is left alone, so this can
   * simply track whether anybody is fishing rather than being fired once on the
   * cast and having to be unfired on all three ways of stopping.
   */
  startle(x: number, y: number): void {
    const frogs = this.animals.filter((a) => a.kind === 'frog');
    if (frogs.length === 0) return;
    let nearest = frogs[0];
    for (const f of frogs) {
      if (Math.hypot(f.x - x, f.y - y) < Math.hypot(nearest.x - x, nearest.y - y)) nearest = f;
    }
    for (const f of frogs) {
      if (f.diving) continue;
      if (f !== nearest && Math.hypot(f.x - x, f.y - y) > FROG_SCARE) continue;
      f.diving = true;
      // It leaps away from whatever gave it the fright.
      f.face = f.x < x ? -1 : 1;
      // Its cached still is of a frog sitting still, which it no longer is.
      f.frozen = false;
    }
  }

  /** Nobody is fishing any more. Let them back up, raggedly. */
  calm(): void {
    for (const a of this.animals) {
      if (a.kind !== 'frog' || !a.diving) continue;
      a.diving = false;
      a.timer = rr(FROG_SURFACE_DELAY[0], FROG_SURFACE_DELAY[1]);
      a.frozen = false;
    }
  }

  /**
   * The chick, which does not keep to a field. It keeps to its mother.
   *
   * Everything else here picks a spot within its patch of ground and ambles to
   * it. This picks the ground beside the hen, which moves, so the chick is
   * always either catching up or pottering — and it hurries if she has got
   * properly ahead, which is the bit that reads as a chick rather than as a
   * very small chicken.
   *
   * If there is no hen it simply stands there, which cannot happen: the layout
   * places the two of them together or neither of them.
   */
  private stepChick(a: Animal, dt: number, ctx: HerdContext): void {
    const mum = this.hen;
    if (!mum) return;
    a.timer -= dt;

    // Beside her, on whichever side it already is, and a little downhill so it
    // does not stand on her feet.
    const side = a.x < mum.x ? -1 : 1;
    const vx = mum.x + side * 12 - a.x;
    const vy = mum.y + 5 - a.y;
    const gap = Math.hypot(vx, vy);

    if (gap > CHICK_LEASH) {
      const speed = a.speed * (gap > 40 ? 1.7 : 0.8);
      a.x += (vx / gap) * speed * dt;
      a.y += (vy / gap) * speed * dt;
      if (Math.abs(vx) > 2) a.face = vx < 0 ? -1 : 1;
      a.state = 'walk';
      a.moving = true;
      a.walkPhase += speed * dt * 0.55;
    } else {
      a.moving = false;
      // Caught up. Peck at the ground until she wanders off again.
      if (a.timer <= 0) {
        a.state = a.state === 'graze' ? 'idle' : 'graze';
        a.timer = rr(0.8, 2.4);
      }
    }

    const wanted = a.state === 'graze' ? 1 : 0;
    a.headDown += (wanted - a.headDown) * Math.min(1, 3.2 * dt);
    ctx.resolveCollisions(a, 4 * a.scale);
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
