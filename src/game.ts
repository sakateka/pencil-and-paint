import { clamp, lerp } from './core/math';
import { PURR_SECONDS, type Animal } from './entities/animals';
import { Fishing, type CatchKind } from './entities/fishing';
import { Rest } from './entities/rest';
import { Treehouse } from './entities/treehouse';
import { Herd } from './entities/herd';
import { Owl } from './entities/owl';
import { Vigil } from './entities/vigil';
import { Particles } from './entities/particles';
import { makeWalker, resetWalker, type Walker } from './entities/player';
import { scatterPots, type Pot } from './entities/pots';
import { Camera } from './render/camera';
import { ColorField } from './render/colorField';
import type { Scene } from './render/renderer';
import { isSpotClear, resolveCollisions, type WorldEdges } from './systems/collision';
import type { Input } from './systems/input';
import { POT_HUES } from './world/palette';
import { EASEL, HAMMOCK, SPAWN, TREEHOUSE } from './world/layout';
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
 * How far a purr carries.
 *
 * A cat's purr is barely audible across a room, let alone a field. Walking off
 * has to take the sound with you — otherwise she is still rumbling in your ear
 * from the other side of the valley, which is the moment the whole thing stops
 * being a cat and starts being a sound effect.
 */
const PURR_EARSHOT = 200;

/**
 * Something the walker can reach out and do from where they are standing.
 *
 * One kind so far. It is a small named thing rather than a boolean because the
 * next one — fishing at the pond, which only opens once every pot is in — is
 * the same question asked at a different place behind a different gate, and the
 * HUD should not have to learn about each of them separately.
 */
export interface Interaction {
  readonly kind: 'pet' | 'fish' | 'rest' | 'draw' | 'climb' | 'sit';
  /**
   * What to say, as a dictionary key rather than a phrase.
   *
   * The rules do not know what language anyone is reading in, and should not
   * have to. Whoever puts this on screen looks it up.
   */
  readonly say: string;
}

/** How near the stump you have to be to sit on it. */
const STUMP_REACH = 44;

/**
 * How far past the water's edge you can stand and still reach it.
 *
 * In units of the pond's own radii, since the pond is an ellipse and a fixed
 * distance would be a wider margin at the ends than along the sides.
 */
const BANK_MARGIN = 1.3;

/** How close you must stand to the hammock to get into it. */
const HAMMOCK_REACH = 78;

/** And to the easel to pick up the brush. */
const EASEL_REACH = 56;

/** And to the foot of the treehouse to get a hand on the ladder. */
const TREEHOUSE_REACH = 58;

/** Standing still, for when the walker is not the one deciding. */
const ZERO = { x: 0, y: 0 } as const;

export interface GameEvents {
  onPotFound(found: number, total: number, hue: string): void;
  onComplete(seconds: number): void;
  /** The cat has been stroked; `first` on the first time this playthrough. */
  onPet(first: boolean): void;
  /** Camp has been pitched at the water's edge. */
  onFishingStart(): void;
  /** Sat down on the stump in the wood, and got up again. */
  onSitStart(): void;
  onSitEnd(): void;
  /** Two minutes of sitting still, rewarded. */
  onElephant(): void;
  /** A fish has been landed; `total` counts them this playthrough. */
  onCatch(total: number): void;
  /** Somebody has got into the hammock. `birds` is false until the pots are in. */
  onRestStart(birds: boolean): void;
  /** And out of it again. */
  onRestEnd(): void;
  /** Somebody has stepped up to the easel. */
  onDraw(): void;
  /** Somebody has gone up the ladder, or come back down. */
  onClimb(inside: boolean): void;
  /** The camp has come down, however it came down. The list may be empty. */
  onFishingEnd(landed: { kind: CatchKind; count: number }[]): void;
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

  /** The one thing in the valley that looks back at you. */
  readonly owl: Owl;

  /** The stump, the waiting, and what turns up at the end of it. */
  readonly vigil: Vigil;
  readonly fishing = new Fishing();
  readonly rest = new Rest(HAMMOCK.x, HAMMOCK.y);
  readonly treehouse = new Treehouse();

  /**
   * The one cat, held onto rather than looked up.
   *
   * The herd re-sorts itself every frame for the painter's algorithm, so an
   * index into it is worthless — but the object never moves house.
   */
  private readonly cat: Animal | null;

  pots: Pot[] = [];
  found = 0;
  won = false;

  /** How many times the cat has been stroked this playthrough. */
  pets = 0;

  /**
   * The last thing drawn at the easel, decoded and ready to blit.
   *
   * Held here rather than looked up per frame: turning a data URL into an image
   * is asynchronous, and doing it sixty times a second to draw a postage stamp
   * would be absurd. `main` hands over a new one whenever the drawing board
   * changes what is kept.
   */
  easelPicture: HTMLImageElement | undefined;

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
    this.owl = new Owl(world.owlPerch.x, world.owlPerch.y, world.owlPerch.scale);
    this.vigil = new Vigil(
      world.vigil.x,
      world.vigil.y,
      world.vigil.elephantX,
      world.vigil.elephantY,
    );
    this.cat = this.herd.animals.find((a) => a.kind === 'cat') ?? null;
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
    this.fishing.forget();
    this.rest.getUp();
    this.treehouse.climbOut();
    this.vigil.reset();
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
    // Out of earshot she settles, so there is nothing left to fade back in if
    // you come running: the purr belongs to the moment you were there for.
    if (this.cat && this.cat.purr > 0 && this.distanceToCat > PURR_EARSHOT) this.cat.purr = 0;

    // The camp can also come down on its own — see `Fishing.update`. However it
    // ends, the ledger is read out once and only once.
    const wasFishing = this.fishing.active;
    this.fishing.update(dt, this.walker.x, this.walker.y);
    this.rest.update(dt, this.won);
    this.owl.update(dt, this.walker.x, this.walker.y, this.isAwakeAt(this.owl.x, this.owl.y, 10));
    if (this.vigil.update(dt)) this.events.onElephant();
    this.treehouse.update(dt);
    if (wasFishing && !this.fishing.active) this.events.onFishingEnd(this.fishing.landed);

    /*
     * The frogs want no part of a float landing on their pond.
     *
     * Asked every frame rather than fired on the cast, because both of these
     * are cheap and idempotent, and because there are three ways a session can
     * end — Q, the restart, and the camp coming down on its own — and this way
     * none of them has to remember to put the frogs back.
     */
    if (this.fishing.active) this.herd.startle(this.fishing.floatX, this.fishing.floatY);
    else this.herd.calm();
    this.camera.follow(this.walker.x, this.walker.y, dt);
  }

  private get speed(): number {
    return Math.hypot(this.walker.vx, this.walker.vy);
  }

  private moveWalker(dt: number, input: Input): void {
    const w = this.walker;
    const screenX = this.camera.toScreenX(w.x);
    const screenY = this.camera.toScreenY(w.y);
    /*
     * You are sitting down. Someone fishing does not wander off mid-cast, and
     * on a phone the drag that steers is also the drag you make reaching for
     * the button — so the input is dropped rather than the walker pinned, and
     * friction brings them to a stop as they settle.
     */
    // Fishing, lying down or sat on the stump: you are not going anywhere
    // until you get up.
    const pushed = input.direction(screenX, screenY);
    /*
     * Up in the treehouse the same keys walk you about the room instead. The
     * walker on the ground stays exactly where they left the ladder, because
     * that is where they will be standing when they come back down.
     */
    if (this.treehouse.inside) {
      this.treehouse.move(dt, pushed.x);
      w.vx = 0;
      w.vy = 0;
      return;
    }
    const dir = this.fishing.active || this.rest.resting || this.vigil.sitting ? ZERO : pushed;
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

  /**
   * How far the walker is from the cat.
   *
   * The same shoulder-height offset the pots use, so "close enough" means the
   * same thing whether you are picking something up or leaning down.
   */
  private get distanceToCat(): number {
    if (!this.cat) return Infinity;
    return Math.hypot(this.cat.x - this.walker.x, this.cat.y - this.walker.y - 6);
  }

  /** The cat, if the walker is standing close enough to reach her. */
  private catInReach(): Animal | null {
    return this.distanceToCat < PET_RADIUS ? this.cat : null;
  }

  /**
   * How loud her purr should be from here, 0 to 1.
   *
   * Full within arm's reach and gone by the edge of earshot, so walking away
   * fades her out and walking back brings her in again — she is still purring
   * either way, you just cannot hear her from over there.
   */
  get purrLoudness(): number {
    if (!this.cat || this.cat.purr <= 0) return 0;
    const fade = (PURR_EARSHOT - this.distanceToCat) / (PURR_EARSHOT - PET_RADIUS);
    return clamp(fade, 0, 1);
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

  /**
   * The colours you have actually found, in the order the palette lists them.
   *
   * This is what you can paint with at the easel. Starting with none of them is
   * the point: the valley is in pencil until you go and find the paint, and so
   * is anything you draw.
   */
  get collectedHues(): string[] {
    const found = new Set(this.pots.filter((p) => p.found).map((p) => p.hue));
    return POT_HUES.filter((hue) => found.has(hue));
  }

  /**
   * The way out of whatever you are in the middle of, as a dictionary key.
   *
   * Null when there is nothing to get out of. Three different things can hold
   * you still and "pack up" is only right for one of them.
   */
  get leaving(): string | null {
    if (this.treehouse.inside) return 'prompt.climbDown';
    if (this.vigil.sitting) return 'prompt.standUp';
    if (this.rest.resting) return 'prompt.getUp';
    if (this.fishing.active) return 'prompt.packUp';
    return null;
  }

  /** What is within reach from here, for the prompt on screen. */
  get interaction(): Interaction | null {
    if (!this.running) return null;
    const cat = this.catInReach();
    if (cat) return { kind: 'pet', say: cat.purr > 0 ? 'prompt.purring' : 'prompt.pet' };
    /*
     * Nothing is offered while you are lying down. There is genuinely nothing
     * to do, and a prompt saying so is an invitation to press a key that does
     * nothing — the way out is the button beside it, which is enough.
     */
    if (this.rest.resting || this.treehouse.inside || this.vigil.sitting) return null;
    if (this.fishing.active) return { kind: 'fish', say: this.fishing.labelKey };
    if (this.atTheWater()) return { kind: 'fish', say: this.fishing.labelKey };
    // The easel first: it stands close enough to the hammock that both are in
    // reach from one spot, and the brush is the more particular of the two.
    if (this.atTheEasel()) return { kind: 'draw', say: 'prompt.draw' };
    if (this.atTheTreehouse()) return { kind: 'climb', say: 'prompt.climb' };
    if (this.atTheHammock()) return { kind: 'rest', say: 'prompt.rest' };
    if (this.atTheStump()) return { kind: 'sit', say: 'prompt.sit' };
    return null;
  }

  /**
   * Put down whatever you are doing. True if anything was put down.
   *
   * Fishing is the only thing you can be in the middle of, and while you are,
   * you cannot walk — so this is the way off the riverbank rather than a
   * convenience.
   */
  cancel(): boolean {
    if (this.vigil.sitting) {
      this.vigil.getUp();
      this.events.onSitEnd();
      return true;
    }
    if (this.treehouse.inside) {
      this.treehouse.climbOut();
      this.events.onClimb(false);
      return true;
    }
    if (this.rest.resting) {
      this.rest.getUp();
      this.events.onRestEnd();
      return true;
    }
    if (!this.fishing.active) return false;
    this.fishing.packUp();
    this.events.onFishingEnd(this.fishing.landed);
    return true;
  }

  /** Is the walker close enough to the hammock to lie down in it? */
  private atTheHammock(): boolean {
    return Math.hypot(this.walker.x - HAMMOCK.x, this.walker.y - HAMMOCK.y) < HAMMOCK_REACH;
  }

  /**
   * Close enough to the stump to sit on it?
   *
   * Not gated on the pots. Sitting down and waiting is open from the first
   * minute — it costs nothing but patience, and gating it would turn the one
   * thing in the valley that asks you to be still into another reward.
   */
  private atTheStump(): boolean {
    return Math.hypot(this.walker.x - this.vigil.x, this.walker.y - this.vigil.y) < STUMP_REACH;
  }

  /** Is the walker at the easel? */
  private atTheEasel(): boolean {
    return Math.hypot(this.walker.x - EASEL.x, this.walker.y - EASEL.y) < EASEL_REACH;
  }

  /**
   * At the foot of the ladder, with the valley finished?
   *
   * The same gate the pond has. The treehouse and the fishing are both things
   * to do once there is nothing left to find — the hammock is the exception,
   * and deliberately so, because stopping should never have to be earned.
   */
  private atTheTreehouse(): boolean {
    if (!this.won) return false;
    return (
      Math.hypot(this.walker.x - TREEHOUSE.x, this.walker.y - TREEHOUSE.y) < TREEHOUSE_REACH
    );
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

    if (this.atTheEasel()) {
      this.events.onDraw();
      return true;
    }

    if (this.atTheTreehouse()) {
      if (this.treehouse.inside) return false;
      this.treehouse.climbIn();
      this.events.onClimb(true);
      return true;
    }

    if (this.atTheStump()) {
      if (this.vigil.sitting) return false;
      this.vigil.sitDown();
      this.events.onSitStart();
      return true;
    }

    if (this.atTheHammock()) {
      if (this.rest.resting) return false;
      /*
       * The pots gate the birds, not the hammock. Lying down is allowed from
       * the first minute; an unfinished valley is simply a quiet one.
       */
      this.rest.lieDown();
      this.events.onRestStart(this.won);
      return true;
    }

    if (this.atTheWater()) {
      this.fishing.start(this.walker.x, this.walker.y, this.world.pond);
      this.faceTheWater();
      this.events.onFishingStart();
      return true;
    }

    return false;
  }

  /** Turn to look at the float, since the walker will not be turning again. */
  private faceTheWater(): void {
    const w = this.walker;
    const dx = this.fishing.floatX - w.x;
    const dy = this.fishing.floatY - w.y;
    if (Math.abs(dx) > Math.abs(dy) * 0.7) {
      w.facing = 'side';
      w.face = dx < 0 ? -1 : 1;
    } else {
      w.facing = dy < 0 ? 'up' : 'down';
    }
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
      rest: this.rest,
      owl: this.owl,
      vigil: this.vigil,
      easel: EASEL,
      treehouse: this.treehouse,
      easelPicture: this.easelPicture,
      pots: this.pots,
      particles: this.particles,
      litRadius: this.litRadius,
      isBuriedInColour: this.isBuriedInColour,
      maskRadius: this.maskRadius,
      elapsed: this.elapsed,
    };
  }
}
