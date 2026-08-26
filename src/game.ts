import { clamp, lerp } from './core/math';
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

export interface GameEvents {
  onPotFound(found: number, total: number, hue: string): void;
  onComplete(seconds: number): void;
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

  pots: Pot[] = [];
  found = 0;
  won = false;

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
    this.radiusBoost = 0;
    this.won = false;
    this.wonAt = 0;
    this.startedAt = this.elapsed;
    this.particles.clear();
    this.field.clearTrail();
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
    if (!this.won) return this.litRadius;
    const t = clamp((this.elapsed - this.wonAt) / FLOOD_SECONDS, 0, 1);
    return lerp(this.litRadius, FLOOD_RADIUS, t);
  }

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
      pots: this.pots,
      particles: this.particles,
      litRadius: this.litRadius,
      maskRadius: this.maskRadius,
      elapsed: this.elapsed,
    };
  }
}
