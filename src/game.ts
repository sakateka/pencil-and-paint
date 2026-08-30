import { clamp, lerp } from './core/math';
import { PURR_SECONDS, type Animal } from './entities/animals';
import { Fishing, type CatchKind } from './entities/fishing';
import { Rest } from './entities/rest';
import { Treehouse } from './entities/treehouse';
import { Herd } from './entities/herd';
import { Owl } from './entities/owl';
import { Hedgehog } from './entities/hedgehog';
import { MIRAGE_REACH, Vigil, VIGIL_SECONDS } from './entities/vigil';
import { Lion } from './entities/lion';
import { Perch } from './entities/perch';
import { Particles } from './entities/particles';
import { makeWalker, resetWalker, type Walker } from './entities/player';
import { scatterPots, type Pot } from './entities/pots';
import { Camera } from './render/camera';
import { ColorField } from './render/colorField';
import type { Scene } from './render/renderer';
import { isSpotClear, resolveCollisions, type WorldEdges } from './systems/collision';
import { northernSurfaceY } from './world/hills';
import type { Input } from './systems/input';
import { POT_HUES } from './world/palette';
import { BENCH, EASEL, HAMMOCK, HAYSTACK, HEDGEHOG, SPAWN, TREEHOUSE } from './world/layout';
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
  readonly kind: 'fish' | 'rest' | 'draw' | 'climb' | 'sit';
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

/** How near a bench or a haystack you have to be to get on it. */
const PERCH_REACH = 52;

/** And to the foot of the treehouse to get a hand on the ladder. */
const TREEHOUSE_REACH = 58;

/**
 * How near the owl you have to be standing for it to hoot back.
 *
 * Measured to the bird itself, which is up a branch: standing at the foot of
 * its tree is already most of the distance, so this is far wider than the
 * cat's arm's reach. Generous on purpose — hoots carry, and so does a visitor
 * who has come all this way. Still short of `NOTICES`, though, so from however
 * far off it will watch you before it will answer you.
 */
const OWL_REACH = 192;

/** Standing still, for when the walker is not the one deciding. */
const ZERO = { x: 0, y: 0 } as const;

export interface GameEvents {
  onPotFound(found: number, total: number, hue: string): void;
  onComplete(seconds: number): void;
  /** The cat has been stroked; `first` on the first time this playthrough. */
  onPet(first: boolean): void;
  /** Camp has been pitched at the water's edge. */
  onFishingStart(): void;
  /**
   * Sat down somewhere, and got up again.
   *
   * The line comes with it rather than being chosen by the caller: the stump is
   * a place where something is coming and says so, and the bench and the
   * haystack are places where nothing is, which is their whole point. One note
   * for all three would sell each of them as the others.
   */
  onSitStart(note: string): void;
  onSitEnd(note: string): void;
  /** Two minutes of sitting still, rewarded. */
  onElephant(): void;
  /** The hedgehog has come right out of its bush. */
  onHedgehog(): void;
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
  readonly hedgehog: Hedgehog;

  /** Lying in the far corner, doing nothing whatsoever. */
  readonly lion: Lion;

  /**
   * Places to stop that want nothing from you: the bench and the haystack.
   *
   * Unlike the stump, nothing is waiting at the end of either. That is the
   * point of them — the valley should have somewhere to sit that is not also a
   * puzzle.
   */
  readonly perches: readonly Perch[];
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
    this.lion = new Lion(world.lion.x, world.lion.y);
    this.perches = [
      new Perch(BENCH.x, BENCH.y, 'bench', 'prompt.sitBench', 1),
      /*
       * Up on the stack itself, on its near-left slope — not on the grass
       * beside it. Facing away from the hay, so that the recline tips them
       * backwards *into* it; the other way round they lay flat on the ground,
       * leaning away from the only thing holding them up.
       */
      new Perch(HAYSTACK.x - 20, HAYSTACK.y - 12, 'hay', 'prompt.lieHay', -1),
    ];
    this.hedgehog = new Hedgehog(HEDGEHOG.x, HEDGEHOG.y);
    this.vigil = new Vigil(
      world.vigil.x,
      world.vigil.y,
      world.vigil.elephantX,
      world.vigil.elephantY,
    );
    this.cat = this.herd.animals.find((a) => a.kind === 'cat') ?? null;
    /*
     * Right up to the top edge, where the other three keep their distance.
     *
     * The top used to hold the walker seventy units back, which was invisible
     * until the sky opened over it — and then it meant you could see the edge
     * of the world and never quite reach it. The far edge of the paper is the
     * one place worth being able to stand.
     */
    this.edges = {
      minX: 26,
      minY: (x) => northernSurfaceY(x) + 12,
      maxX: world.width - 26,
      maxY: world.height - 26,
    };
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
    this.hedgehog.reset();
    for (const perch of this.perches) perch.getUp();
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

  /**
   * Has the colour reached everything within `reach` of this spot?
   *
   * For drawings too big to ask about as a point. The mirage cloud is most of
   * six hundred units across and the colour is four hundred at its widest, so
   * asking at its origin can say yes while the trunk is still out in the
   * graphite — and then the whole thing breathes, half of it in pencil, which
   * is the one thing the graphite is not allowed to do.
   */
  isWhollyLit = (x: number, y: number, reach: number): boolean => {
    const r = this.maskRadius - reach;
    if (r <= 0) return false;
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
    this.lion.update(dt, this.walker.x, this.walker.y, this.isAwakeAt(this.lion.x, this.lion.y, 14));
    for (const perch of this.perches) perch.update(dt, this.isAwakeAt(perch.x, perch.y, 12));
    /*
     * The hedgehog comes out for the hay and nothing else — not the bench, not
     * standing beside the bush looking at it. `lying` is that, exactly.
     */
    const lying = this.perches.some((perch) => perch.resting && perch.pose === 'hay');
    if (this.hedgehog.update(dt, lying, this.isAwakeAt(this.hedgehog.x, this.hedgehog.y, 16))) {
      this.events.onHedgehog();
    }
    this.vigil.lit = this.isWhollyLit(this.vigil.elephantX, this.vigil.elephantY, MIRAGE_REACH);
    if (this.vigil.update(dt, this.won)) this.events.onElephant();
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
    let cameraX = this.walker.x;
    let cameraY = this.walker.y;
    if (this.vigil.sitting && this.won && this.isMobileViewport) {
      /*
       * On a narrow screen the enlarged mirage sits outside the stump's frame.
       * Pan only after sitting, while the walker is immobile: ordinary walking
       * must keep the camera at exactly the walker's pace. Three seconds is
       * slow enough to feel deliberate and early enough to watch it condense.
       *
       * And only once the map is coloured, which is the same gate the arrival
       * is on and for the same reason: before that there is nothing over there
       * to look at, and swinging the camera onto an empty patch of pencil is a
       * worse answer than leaving it where the walker is.
       */
      const t = clamp(this.vigil.clock / 3, 0, 1);
      const focus = t * t * (3 - 2 * t);
      cameraX = lerp(this.walker.x, this.vigil.elephantX, focus);
      // `elephantY` is its baseline; the visible cloud and body are above it.
      cameraY = lerp(this.walker.y, this.vigil.elephantY - 115, focus);
    }
    this.camera.follow(cameraX, cameraY, dt);
  }

  /**
   * Whether the pointer is a finger. Asked once, not sixty times a second.
   *
   * `matchMedia` builds a new `MediaQueryList` on every call — an object with a
   * parsed query and a live subscription behind it — and the answer cannot
   * change for the life of the page: a mouse does not become a finger. The
   * width can change, and is read fresh below; this cannot.
   */
  private touchPointer?: boolean;

  /** Portrait phones, plus touch devices held in landscape. */
  private get isMobileViewport(): boolean {
    const width = globalThis.innerWidth || 1280;
    if (width <= 700) return true;
    if (width > 1000) return false;
    this.touchPointer ??= globalThis.matchMedia?.('(hover: none)').matches === true;
    return this.touchPointer;
  }

  private get speed(): number {
    return Math.hypot(this.walker.vx, this.walker.vy);
  }

  private moveWalker(dt: number, input: Input): void {
    const w = this.walker;
    const screenX = this.camera.toScreenX(w.x);
    const screenY = this.camera.toScreenY(w.y);
    const perch = this.perched;
    if (perch) {
      // A bench or haystack owns the resting pose. Pin the invisible walking
      // body to the same point so collision resolution cannot shove the colour
      // source away from the drawing while somebody is lying still.
      w.x = perch.x;
      w.y = perch.y;
      w.vx = 0;
      w.vy = 0;
      return;
    }
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
    const stopped = this.fishing.active || this.rest.resting || this.vigil.sitting;
    const dir = stopped ? ZERO : pushed;
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

  /**
   * The cat, if the walker is standing close enough to reach her.
   *
   * The same question the owl is asked, and it lives here for the same reason:
   * reach is a rule of the valley, so the touch handler asks rather than
   * measures.
   */
  catInReach(): Animal | null {
    return this.distanceToCat < PET_RADIUS ? this.cat : null;
  }

  /**
   * Close enough to the owl for it to answer a touch.
   *
   * The same question the cat is asked, and it lives here for the same reason:
   * reach is a rule of the valley, so the click handler asks rather than
   * measures.
   */
  owlInReach(): boolean {
    return Math.hypot(this.walker.x - this.owl.x, this.walker.y - this.owl.y) < OWL_REACH;
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
    if (this.vigil.sitting || this.perched) return 'prompt.standUp';
    if (this.rest.resting) return 'prompt.getUp';
    if (this.fishing.active) return 'prompt.packUp';
    return null;
  }

  /** What is within reach from here, for the prompt on screen. */
  get interaction(): Interaction | null {
    if (!this.running) return null;
    /*
     * Nothing is offered while you are lying down. There is genuinely nothing
     * to do, and a prompt saying so is an invitation to press a key that does
     * nothing — the way out is the button beside it, which is enough.
     */
    if (this.rest.resting || this.treehouse.inside || this.vigil.sitting) return null;
    if (this.perched) return null;
    if (this.fishing.active) return { kind: 'fish', say: this.fishing.labelKey };
    if (this.atTheWater()) return { kind: 'fish', say: this.fishing.labelKey };
    // The easel first: it stands close enough to the hammock that both are in
    // reach from one spot, and the brush is the more particular of the two.
    if (this.atTheEasel()) return { kind: 'draw', say: 'prompt.draw' };
    if (this.atTheTreehouse()) return { kind: 'climb', say: 'prompt.climb' };
    if (this.atTheHammock()) return { kind: 'rest', say: 'prompt.rest' };
    if (this.atTheStump()) return { kind: 'sit', say: 'prompt.sit' };
    const perch = this.perchInReach();
    if (perch) return { kind: 'sit', say: perch.say };
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
    const perch = this.perched;
    if (perch) {
      perch.getUp();
      this.events.onSitEnd(perch.parting);
      return true;
    }
    if (this.vigil.sitting) {
      this.vigil.getUp();
      this.events.onSitEnd('note.stoodUp');
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

  /** Whichever of the places to stop is within reach, if any. */
  private perchInReach(): Perch | null {
    for (const perch of this.perches) {
      if (Math.hypot(this.walker.x - perch.x, this.walker.y - perch.y) < PERCH_REACH) {
        return perch;
      }
    }
    return null;
  }

  /** The one being used, if any. */
  private get perched(): Perch | null {
    return this.perches.find((p) => p.resting) ?? null;
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
   * Stroke her, from a touch on the canvas.
   *
   * Petting an already-purring cat is not a mistake — it tops her back up, and
   * she gets another heart out of it.
   */
  pet(): boolean {
    if (!this.running) return false;
    const cat = this.catInReach();
    if (!cat) return false;
    const first = this.pets === 0;
    this.pets++;
    cat.purr = PURR_SECONDS;
    this.particles.heartburst(cat.x, cat.y);
    this.events.onPet(first);
    return true;
  }

  /**
   * Do whatever is within reach. True if anything happened.
   *
   * The cat is not one of them: she answers a touch on herself rather than a
   * key — see `pet` — so standing beside her offers nothing here, the same way
   * standing under the owl offers nothing.
   */
  interact(): boolean {
    if (!this.running) return false;

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
      this.events.onSitStart('note.satDown');
      return true;
    }

    const perch = this.perchInReach();
    if (perch) {
      // Already sitting on one of them, so there is nothing to do here — you
      // cannot reach a second without standing up first, but the rules should
      // say so rather than relying on that.
      if (this.perched) return false;
      perch.sitDown();
      // The resting drawing is anchored to the seat, so the walker — and thus
      // the colour they carry — belongs there too. Otherwise approaching the
      // hay from its north side moves the invisible colour source fifty units
      // closer to the hedgehog and bypasses its four-pot distance gate.
      this.walker.x = perch.x;
      this.walker.y = perch.y;
      this.walker.vx = 0;
      this.walker.vy = 0;
      this.events.onSitStart(perch.note);
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

  /**
   * Debug: skip the wait on the stump.
   *
   * Waiting it out is the whole point of the stump, and also the whole problem
   * with testing anything downstream of it by hand.
   */
  summonElephant(): void {
    if (!this.vigil.sitting) this.vigil.sitDown();
    this.vigil.clock = VIGIL_SECONDS;
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
      hedgehog: this.hedgehog,
      lion: this.lion,
      perches: this.perches,
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
