import { clamp, lerp } from './core/math';
import { PURR_SECONDS, type Animal } from './entities/animals';
import { Fishing } from './entities/fishing';
import { Herd } from './entities/herd';
import { Particles } from './entities/particles';
import { makeWalker, resetWalker, type Walker } from './entities/player';
import { scatterPots, type Pot } from './entities/pots';
import { Camera } from './render/camera';
import { ColorField } from './render/colorField';
import type { Scene } from './render/renderer';
import { isSpotClear, resolveCollisions, type WorldEdges } from './systems/collision';
import type { Input } from './systems/input';
import { POT_HUES } from './world/palette';
import { SPAWN } from './world/layout';
import type { World } from './world/world';

export const POT_COUNT = 14;

/** How far the colour reaches with nothing found. */
const BASE_RADIUS = 158;

/** How much further each pot pushes it. */
const RADIUS_PER_POT = 20;

/** Where the colour ends up once every pot is found. */
const FLOOD_RADIUS = 3400;
const FLOOD_SECONDS = 3.2;

const ACCELERATION = 12;
const FRICTION = 11;

/** How close you must stand before the cat is within arm's reach. */
const PET_RADIUS = 52;

/**
 * Something the walker can reach out and do from where they are standing.
 *
 * One kind so far. It is a small named thing rather than a boolean because the
 * next one — fishing at the pond, which only opens once every pot is in — is
 * the same question asked at a different place behind a different gate, and the
 * HUD should not have to learn about each of them separately.
 */
export interface Interaction {
  readonly kind: 'pet' | 'fish';
  /** What the prompt on screen says. */
  readonly label: string;
}

/**
 * How far past the water's edge you can stand and still reach it.
 *
 * In units of the pond's own radii, since the pond is an ellipse and a fixed
 * distance would be a wider margin at the ends than along the sides.
 */
const BANK_MARGIN = 1.3;

export interface GameEvents {
  onPotFound(found: number, total: number, hue: string): void;
  onComplete(seconds: number): void;
  /** The cat has been stroked; `first` on the first time this playthrough. */
  onPet(first: boolean): void;
  /** Camp has been pitched at the water's edge. */
  onFishingStart(): void;
  /** A fish has been landed; `total` counts them this playthrough. */
  onCatch(total: number): void;
}

/**
 * The state of one playthrough, and the rules that move it along.
 *
 * Owns no canvas and does no drawing: it exposes a `Scene` for the renderer to
 * read. That split is what lets the whole simulation be driven headlessly.
 */
export class Game {
  readonly walker: Walker = makeWalker();
  readonly camera: Camera;
  readonly field = new ColorField();
  readonly particles = new Particles();
  readonly herd: Herd;
  readonly fishing = new Fishing();

  pots: Pot[] = [];
  found = 0;
  won = false;

  /** How many times the cat has been stroked this playthrough. */
  pets = 0;

  /**
   * Debug: force the colour to cover everything without ending the game.
   * Driven by the local-only panel; untouched in normal play.
   */
  floodColour = false;

  private radiusBoost = 0;
  private wonAt = 0;
  private startedAt = 0;
  private readonly edges: WorldEdges;

  elapsed = 0;
  running = false;

  constructor(
    readonly world: World,
    private readonly events: GameEvents,
  ) {
    this.camera = new Camera(SPAWN.x, SPAWN.y, world.width, world.height);
    this.herd = new Herd(world.animalSpawns);
    this.edges = { minX: 26, minY: 70, maxX: world.width - 26, maxY: world.height - 26 };
    this.restart();
    this.camera.snapTo(this.walker.x, this.walker.y);
  }

  restart(): void {
    resetWalker(this.walker);
    this.found = 0;
    this.pets = 0;
    this.radiusBoost = 0;
    this.won = false;
    this.wonAt = 0;
    this.startedAt = this.elapsed;
    this.particles.clear();
    this.field.clearTrail();
    this.fishing.packUp();
    this.fishing.caught = 0;
    this.herd.scatter();
    this.pots = scatterPots(
      POT_COUNT,
      POT_HUES,
      { width: this.world.width, height: this.world.height },
      SPAWN,
      (x, y, pad) => this.isPlaceable(x, y, pad),
    );
  }

  private isPlaceable(x: number, y: number, pad: number): boolean {
    if (x < 90 || y < 130 || x > this.world.width - 90 || y > this.world.height - 90) return false;
    const pond = this.world.pond;
    const dx = (x - pond.x) / (pond.rx + pad);
    const dy = (y - pond.y) / (pond.ry + pad);
    if (dx * dx + dy * dy < 1) return false;
    return isSpotClear(x, y, pad, this.world.colliders);
  }

  /** The colour radius, breathing gently and reaching further when walking. */
  get litRadius(): number {
    const moving = Math.hypot(this.walker.vx, this.walker.vy) > 6;
    const pulse = Math.sin(this.elapsed * 1.6) * 5 + (moving ? 10 : 0);
    return BASE_RADIUS + this.radiusBoost + pulse;
  }

  /** The radius the mask actually uses, including the ending's flood. */
  get maskRadius(): number {
    if (this.floodColour) return FLOOD_RADIUS;
    if (!this.won) return this.litRadius;
    const t = clamp((this.elapsed - this.wonAt) / FLOOD_SECONDS, 0, 1);
    return lerp(this.litRadius, FLOOD_RADIUS, t);
  }

  /**
   * Is this point deep enough inside the colour to be fully opaque?
   *
   * The mask holds full alpha out to about half its radius before it starts to
   * fall away, so anything comfortably inside that is painted over completely.
   */
  isBuriedInColour = (x: number, y: number, margin: number): boolean => {
    const solid = this.maskRadius * 0.5 - margin;
    if (solid <= 0) return false;
    const dx = x - this.walker.x;
    const dy = y - this.walker.y - 14;
    return dx * dx + dy * dy < solid * solid;
  };

  /** Has the colour reached this spot? */
  isAwakeAt = (x: number, y: number, pad = 0): boolean => {
    const r = this.maskRadius + pad;
    const dx = x - this.walker.x;
    const dy = y - this.walker.y - 14;
    return dx * dx + dy * dy < r * r;
  };

  advance(dt: number, input: Input): void {
    this.elapsed += dt;
    if (!this.running) return;

    this.moveWalker(dt, input);
    this.field.recordTrail(dt, this.walker.x, this.walker.y, this.speed);

    for (const pot of this.pots) {
      if (pot.found) continue;
      pot.awake = this.isAwakeAt(pot.x, pot.y, 8);
      if (pot.awake) pot.clock += dt;
    }
    if (!this.won) this.collectPots();

    this.herd.update(dt, {
      walkerX: this.walker.x,
      walkerY: this.walker.y,
      isAwakeAt: this.isAwakeAt,
      resolveCollisions: (body, radius) =>
        resolveCollisions(body, radius, this.world.colliders, this.edges),
    });

    this.particles.update(
      dt,
      this.elapsed,
      this.walker.x,
      this.walker.y,
      this.litRadius,
      this.speed,
    );
    this.fishing.update(dt, this.walker.x, this.walker.y);
    this.camera.follow(this.walker.x, this.walker.y, dt);
  }

  private get speed(): number {
    return Math.hypot(this.walker.vx, this.walker.vy);
  }

  private moveWalker(dt: number, input: Input): void {
    const w = this.walker;
    const screenX = this.camera.toScreenX(w.x);
    const screenY = this.camera.toScreenY(w.y);
    const dir = input.direction(screenX, screenY);
    const pushing = dir.x !== 0 || dir.y !== 0;

    const responsiveness = Math.min(1, (pushing ? ACCELERATION : FRICTION) * dt);
    w.vx += (dir.x * w.speed - w.vx) * responsiveness;
    w.vy += (dir.y * w.speed - w.vy) * responsiveness;
    if (Math.abs(w.vx) < 2) w.vx = 0;
    if (Math.abs(w.vy) < 2) w.vy = 0;

    w.x += w.vx * dt;
    w.y += w.vy * dt;
    resolveCollisions(w, w.radius, this.world.colliders, this.edges);

    const speed = this.speed;
    w.step += speed * dt * 0.09;
    if (speed > 6) {
      if (Math.abs(w.vx) > Math.abs(w.vy) * 0.7) {
        w.facing = 'side';
        w.face = w.vx < 0 ? -1 : 1;
      } else {
        w.facing = w.vy < 0 ? 'up' : 'down';
      }
    }
  }

  /** The cat, if the walker is standing close enough to reach her. */
  private catInReach(): Animal | null {
    for (const a of this.herd.animals) {
      if (a.kind !== 'cat') continue;
      // The same shoulder-height offset the pots use, so "close enough" means
      // the same thing whether you are picking something up or leaning down.
      if (Math.hypot(a.x - this.walker.x, a.y - this.walker.y - 6) < PET_RADIUS) return a;
    }
    return null;
  }

  /**
   * Is the walker at the water's edge, with the valley finished?
   *
   * The gate is the whole point of it: fishing is not a thing to do instead of
   * finding the pots, it is what there is to do once you have.
   */
  private atTheWater(): boolean {
    if (!this.won) return false;
    const pond = this.world.pond;
    const dx = (this.walker.x - pond.x) / pond.rx;
    const dy = (this.walker.y - pond.y) / pond.ry;
    return Math.hypot(dx, dy) < BANK_MARGIN;
  }

  /** What is within reach from here, for the prompt on screen. */
  get interaction(): Interaction | null {
    if (!this.running) return null;
    const cat = this.catInReach();
    if (cat) return { kind: 'pet', label: cat.purr > 0 ? 'she is purring' : 'pet the cat' };
    if (this.fishing.active) return { kind: 'fish', label: this.fishing.label };
    if (this.atTheWater()) return { kind: 'fish', label: this.fishing.label };
    return null;
  }

  /**
   * Do whatever is within reach. True if anything happened.
   *
   * Petting an already-purring cat is not a mistake — it tops her back up, and
   * she gets another heart out of it.
   */
  interact(): boolean {
    if (!this.running) return false;

    const cat = this.catInReach();
    if (cat) {
      const first = this.pets === 0;
      this.pets++;
      cat.purr = PURR_SECONDS;
      this.particles.heartburst(cat.x, cat.y);
      this.events.onPet(first);
      return true;
    }

    if (this.fishing.active) {
      if (!this.fishing.strike()) return false;
      this.particles.burst(this.fishing.floatX, this.fishing.floatY, '#cfeeff', 12);
      this.events.onCatch(this.fishing.caught);
      return true;
    }

    if (this.atTheWater()) {
      this.fishing.start(this.walker.x, this.walker.y, this.world.pond);
      this.events.onFishingStart();
      return true;
    }

    return false;
  }

  /** Debug: find every remaining pot at once, as if you had walked to them. */
  collectAll(): void {
    for (const pot of this.pots) {
      if (pot.found) continue;
      pot.found = true;
      this.found++;
      this.radiusBoost += RADIUS_PER_POT;
      this.walker.brush = pot.hue;
      this.particles.burst(pot.x, pot.y, pot.hue, 8);
    }
    // One notification rather than fourteen, so the HUD lands in the right
    // state without fourteen chimes on top of each other.
    this.events.onPotFound(this.found, this.pots.length, this.walker.brush);
    if (!this.won) {
      this.won = true;
      this.wonAt = this.elapsed;
      this.events.onComplete(Math.round(this.elapsed - this.startedAt));
    }
  }

  /** Debug: put the walker somewhere without walking there. */
  teleport(x: number, y: number): void {
    this.walker.x = x;
    this.walker.y = y;
    this.walker.vx = 0;
    this.walker.vy = 0;
    this.camera.snapTo(x, y);
    this.field.clearTrail();
  }

  private collectPots(): void {
    for (const pot of this.pots) {
      if (pot.found) continue;
      if (Math.hypot(pot.x - this.walker.x, pot.y - this.walker.y - 6) >= 30) continue;

      pot.found = true;
      this.found++;
      this.radiusBoost += RADIUS_PER_POT;
      this.walker.brush = pot.hue;
      this.particles.burst(pot.x, pot.y, pot.hue);
      this.events.onPotFound(this.found, this.pots.length, pot.hue);

      if (this.found === this.pots.length) {
        this.won = true;
        this.wonAt = this.elapsed;
        this.events.onComplete(Math.round(this.elapsed - this.startedAt));
      }
    }
  }

  /** What the renderer needs, without handing it the whole game. */
  get scene(): Scene {
    return {
      world: this.world,
      camera: this.camera,
      field: this.field,
      walker: this.walker,
      herd: this.herd,
      fishing: this.fishing,
      pots: this.pots,
      particles: this.particles,
      litRadius: this.litRadius,
      isBuriedInColour: this.isBuriedInColour,
      maskRadius: this.maskRadius,
      elapsed: this.elapsed,
    };
  }
}
