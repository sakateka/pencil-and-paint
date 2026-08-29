import { makeEasel } from './easel';
import { makeTreehouse } from './treehouse';
import { HAMMOCK_SPAN, makeHammock } from './hammock';
import { lerp, TAU } from '../core/math';
import { rng, rnd, rr } from '../core/rng';
import type { AnimalKind } from '../entities/animalKinds';
import { makeBarn, makeHouse } from './buildings';
import {
  makeBench,
  makeGardenBed,
  makeHayBale,
  makeHaystack,
  makeScarecrow,
  makeTrough,
  makeWell,
} from './farm';
import {
  makeBush,
  makeFenceRun,
  makeFlower,
  makeLamp,
  makeRock,
  makeTree,
} from './scenery';
import { makePond, makeTuft, type Ellipse, type Path, type Tuft } from './terrain';
import { NORTHERN_LANDMARKS } from './hills';
import type { Point } from '../core/geom';
import { circleCollider, type Scenery } from './types';

export const WORLD_WIDTH = 2800;
export const WORLD_HEIGHT = 2000;

/** Where the walker starts, and where they return on restart. */
export const SPAWN = { x: 1300, y: 1330 } as const;

/** Where the hammock is slung. Somewhere to lie down, away from everything. */
export const HAMMOCK = { x: 1780, y: 1700 } as const;

/** The easel, standing beside it, clear of both of the hammock's trees. */
export const EASEL = { x: 1902, y: 1782 } as const;

/**
 * The treehouse, further out to the right.
 *
 * Past the hammock and past the easel, so that the far corner of the field has
 * something at the end of it rather than more grass.
 */
export const TREEHOUSE = { x: 2180, y: 1712 } as const;

/** The bench in the middle of the valley, and the haystack up at the farm. */
export const BENCH = { x: 1425, y: 1255 } as const;
export const HAYSTACK = { x: 2585, y: 590 } as const;

export interface AnimalSpawn {
  kind: AnimalKind;
  x: number;
  y: number;
  homeRadius: number;
  scale: number;
}

export interface Layout {
  scenery: Scenery[];
  /** Objects above y=0: drawn with the sky, but solid like ordinary scenery. */
  northernLandmarks: readonly Scenery[];
  tufts: Tuft[];
  paths: Path[];
  pond: Ellipse;
  animals: AnimalSpawn[];
  /** Where the owl sits, in the crown of one of the northern trees. */
  owl: { x: number; y: number; scale: number };
  /** The stump to sit on, and the clearing the elephant stands in. */
  vigil: { x: number; y: number; elephantX: number; elephantY: number };
  /** Where the lion lies, up in the top-left corner. */
  lion: { x: number; y: number };
}

/**
 * Keeps scattered scenery out of places that need to stay clear — paths,
 * doorways, pastures, the pond. Rejection sampling: propose a spot, take it if
 * nothing has claimed the space.
 */
type Claim =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'rect'; left: number; top: number; right: number; bottom: number };

class Sites {
  private claimed: Claim[] = [];
  private pond: Ellipse | null = null;

  setPond(pond: Ellipse): void {
    this.pond = pond;
  }

  reserve(x: number, y: number, r: number): void {
    this.claimed.push({ kind: 'circle', x, y, r });
  }

  /** Whole fields, so nothing scatters inside a fence or grows through a rail. */
  reserveArea(left: number, top: number, right: number, bottom: number): void {
    this.claimed.push({ kind: 'rect', left, top, right, bottom });
  }

  inPond(x: number, y: number, pad: number): boolean {
    if (!this.pond) return false;
    const dx = (x - this.pond.x) / (this.pond.rx + pad);
    const dy = (y - this.pond.y) / (this.pond.ry + pad);
    return dx * dx + dy * dy < 1;
  }

  isFree(x: number, y: number, pad: number): boolean {
    if (x < 60 || y < 90 || x > WORLD_WIDTH - 60 || y > WORLD_HEIGHT - 60) return false;
    if (this.inPond(x, y, pad)) return false;
    return !this.claimed.some((c) => {
      if (c.kind === 'circle') return Math.hypot(c.x - x, c.y - y) < c.r + pad;
      return (
        x > c.left - pad && x < c.right + pad && y > c.top - pad && y < c.bottom + pad
      );
    });
  }

  /** Try `attempts` times to find a clear spot. */
  findFree(pad: number, margin: number, attempts = 30): { x: number; y: number } | null {
    for (let i = 0; i < attempts; i++) {
      const x = rr(margin, WORLD_WIDTH - margin);
      const y = rr(margin + 50, WORLD_HEIGHT - margin);
      if (this.isFree(x, y, pad)) return { x, y };
    }
    return null;
  }
}


/** A rectangular plot, given as world coordinates of its edges. */
interface Plot {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const PADDOCK: Plot = { left: 1900, right: 2570, top: 700, bottom: 1030 };
const SW_PASTURE: Plot = { left: 460, right: 960, top: 1570, bottom: 1830 };
const CHICKEN_RUN: Plot = { left: 2200, right: 2430, top: 1290, bottom: 1420 };
/**
 * Sits in the lane between the paddock rail and the path. Both edges matter:
 * pushed any lower the fence crosses the path, which looks like a mistake.
 */
const GARDEN: Plot = { left: 1750, right: 2050, top: 1060, bottom: 1180 };

type Side = 'top' | 'right' | 'bottom' | 'left';

/** Which way is out of the plot, per edge. */
const OUTWARD: Record<Side, Point> = {
  top: [0, -1],
  right: [1, 0],
  bottom: [0, 1],
  left: [-1, 0],
};

/**
 * Fence a plot in, leaving one gap to walk through.
 *
 * The boundary is not the rectangle it is described by. Posts are walked round
 * the perimeter and pushed in and out by a slow wave, so the enclosed ground
 * bulges and pinches the way a field does when someone paced it out and drove
 * the posts by eye. A surveyed rectangle looks like a spreadsheet.
 *
 * The wave is a function of distance travelled round the perimeter, so it stays
 * continuous across corners rather than resetting at each one.
 */
function enclose(
  into: Scenery[],
  sites: Sites,
  plot: Plot,
  options: {
    gate: { side: Side; from: number; to: number };
    height?: number;
    /** How far the boundary may wander from the nominal rectangle. */
    bow?: number;
  },
): void {
  const { left, right, top, bottom } = plot;
  const { gate, height } = options;
  const bow = options.bow ?? 10;
  // A different starting phase per plot, so no two fields bend alike.
  const phase = left * 0.0031 + top * 0.0017;

  const edges: { from: Point; to: Point; side: Side }[] = [
    { from: [left, top], to: [right, top], side: 'top' },
    { from: [right, top], to: [right, bottom], side: 'right' },
    { from: [right, bottom], to: [left, bottom], side: 'bottom' },
    { from: [left, bottom], to: [left, top], side: 'left' },
  ];

  const boundary: { point: Point; side: Side; along: number }[] = [];
  let travelled = 0;
  for (const edge of edges) {
    const length = Math.hypot(edge.to[0] - edge.from[0], edge.to[1] - edge.from[1]);
    const steps = Math.max(2, Math.round(length / 55));
    const [nx, ny] = OUTWARD[edge.side];
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const x = lerp(edge.from[0], edge.to[0], t);
      const y = lerp(edge.from[1], edge.to[1], t);
      const wander =
        Math.sin(travelled * 0.013 + phase) * bow +
        Math.sin(travelled * 0.034 + phase * 1.7) * bow * 0.45;
      boundary.push({
        point: [x + nx * wander, y + ny * wander],
        side: edge.side,
        along: edge.side === 'top' || edge.side === 'bottom' ? x : y,
      });
      travelled += length / steps;
    }
  }

  const gateLow = Math.min(gate.from, gate.to);
  const gateHigh = Math.max(gate.from, gate.to);
  const inGate = (p: (typeof boundary)[number]) =>
    p.side === gate.side && p.along >= gateLow && p.along <= gateHigh;

  // Rotate so the run begins just past the gate, then take everything up to it.
  const n = boundary.length;
  let startAt = boundary.findIndex((p, i) => !inGate(p) && inGate(boundary[(i - 1 + n) % n]));
  if (startAt < 0) startAt = 0;

  const run: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p = boundary[(startAt + i) % n];
    if (inGate(p)) break;
    run.push(p.point);
  }
  if (run.length >= 2) into.push(makeFenceRun(run, height));

  // Claim the field itself. Otherwise a tree scatters onto the boundary and
  // grows straight through the rails.
  sites.reserveArea(left - bow, top - bow, right + bow, bottom + bow);
}

const HOUSES: readonly [number, number, number, number][] = [
  [1780, 470, 200, 145],
  [520, 1470, 215, 155],
  [2320, 1230, 180, 135],
];

const LAMPS: readonly [number, number][] = [
  [1150, 1310],
  [1560, 1320],
  [1290, 900],
];

/** kind, centre x, centre y, how far they roam, how many, size range. */
const HERDS: readonly [AnimalKind, number, number, number, number, [number, number]][] = [
  ['sheep', 2040, 880, 115, 7, [0.95, 1.2]],
  ['cow', 2390, 900, 105, 4, [1.0, 1.15]],
  ['sheep', 790, 1660, 100, 3, [0.9, 1.15]],
  ['cow', 560, 1740, 85, 2, [1.0, 1.1]],
  ['chicken', 2300, 1345, 58, 5, [0.85, 1.05]],
];

/**
 * Hand-placed landmarks first, scattered nature second.
 *
 * Deterministic: the same seed produces the same valley every time, so the
 * pond, the farm and the herds are always where you left them. Only the paint
 * pots move between games.
 */
export function buildLayout(): Layout {
  rng.seed = 20260826;

  const scenery: Scenery[] = [];
  const sites = new Sites();

  const paths: Path[] = [
    [
      [80, 1520],
      [480, 1400],
      [900, 1440],
      [1300, 1270],
      [1720, 1320],
      [2140, 1170],
      [2740, 1230],
    ],
    [
      [1300, 1270],
      [1240, 940],
      [1330, 620],
      [1620, 420],
      [1900, 330],
      [2300, 300],
    ],
    [
      [900, 1440],
      [820, 1160],
      [620, 1000],
      [560, 780],
    ],
  ];

  const pond = makePond(790, 760, 255, 178);
  scenery.push(pond);
  sites.setPond(pond.area);

  for (const path of paths) {
    for (const [x, y] of path) sites.reserve(x, y, 42);
  }

  for (const [x, y, w, h] of HOUSES) {
    scenery.push(makeHouse(x, y, w, h));
    sites.reserve(x, y - h / 2, Math.max(w, h) * 0.8);
  }

  // --- the farm, up in the north-east meadow ---
  scenery.push(makeBarn(2180, 645, 235, 150));
  sites.reserve(2180, 580, 210);

  // The paddock: a closed rectangle with one gate, under the barn door so the
  // stock have somewhere to be driven to. Corners share coordinates, so the
  // rails actually meet.
  enclose(scenery, sites, PADDOCK, { gate: { side: 'top', from: 2120, to: 2240 } });

  scenery.push(makeHaystack(HAYSTACK.x, HAYSTACK.y, 1));
  scenery.push(makeHayBale(1935, 610, 1));
  scenery.push(makeHayBale(1988, 632, 0.9));
  scenery.push(makeHayBale(2612, 1075, 1.05));
  scenery.push(makeTrough(2090, 985));
  scenery.push(makeWell(1655, 1205));
  scenery.push(makeBench(BENCH.x, BENCH.y));

  /*
   * The hammock, in the quiet south-east where nothing else is.
   *
   * Its two trees are placed by hand rather than left to the scatter: a hammock
   * needs something at both ends, and the scatter would happily give it one
   * tree and a bush. The site is reserved wide so nothing grows through it.
   */
  scenery.push(makeTree(HAMMOCK.x - HAMMOCK_SPAN / 2, HAMMOCK.y, 1.35));
  scenery.push(makeTree(HAMMOCK.x + HAMMOCK_SPAN / 2, HAMMOCK.y, 1.25));
  scenery.push(makeHammock(HAMMOCK.x, HAMMOCK.y));
  sites.reserve(HAMMOCK.x, HAMMOCK.y, HAMMOCK_SPAN * 0.8);

  // And the easel it was left beside, facing the same valley it is a picture of.
  scenery.push(makeEasel(EASEL.x, EASEL.y));
  sites.reserve(EASEL.x, EASEL.y, 44);

  scenery.push(makeTreehouse(TREEHOUSE.x, TREEHOUSE.y));
  sites.reserve(TREEHOUSE.x, TREEHOUSE.y, 96);
  sites.reserve(2585, 590, 90);
  sites.reserve(1960, 620, 80);
  sites.reserve(1655, 1205, 60);
  sites.reserve(1425, 1255, 50);

  // The south-west pasture, drawn round the herds that actually live in it
  // rather than as two rails ending in mid-air.
  enclose(scenery, sites, SW_PASTURE, { gate: { side: 'top', from: 640, to: 760 } });
  scenery.push(makeHayBale(700, 1640, 0.95));

  // A chicken run tucked against the south-east cottage.
  enclose(scenery, sites, CHICKEN_RUN, { gate: { side: 'left', from: 1320, to: 1380 }, height: 24, bow: 5 });

  // The vegetable garden, with the scarecrow standing in the middle of it
  // where a scarecrow belongs.
  enclose(scenery, sites, GARDEN, { gate: { side: 'bottom', from: 1870, to: 1930 }, height: 22, bow: 4 });
  scenery.push(makeGardenBed(1825, 1105, 110, 28, 'carrot'));
  scenery.push(makeGardenBed(1975, 1105, 110, 28, 'cabbage'));
  scenery.push(makeGardenBed(1825, 1165, 110, 28, 'onion'));
  scenery.push(makeGardenBed(1975, 1165, 110, 28, 'carrot'));
  scenery.push(makeScarecrow(1900, 1148));
  sites.reserve(1900, 1120, 190);

  for (const [x, y] of LAMPS) {
    scenery.push(makeLamp(x, y));
    sites.reserve(x, y, 30);
  }

  // --- the animals, each with a patch of field they keep to ---
  const animals: AnimalSpawn[] = [];
  for (const [kind, hx, hy, radius, count, [minScale, maxScale]] of HERDS) {
    sites.reserve(hx, hy, radius + 30);
    for (let i = 0; i < count; i++) {
      const angle = rnd() * TAU;
      const d = Math.sqrt(rnd()) * radius;
      animals.push({
        kind,
        x: hx + Math.cos(angle) * d,
        y: hy + Math.sin(angle) * d,
        homeRadius: radius,
        scale: rr(minScale, maxScale),
      });
    }
  }
  /*
   * The hen and her chick, in the run with the other five.
   *
   * From the painting, and placed where somebody will actually come across
   * them: the run is tucked against the south-east cottage, on the way to
   * everything else. She is half again the size of the other birds, which is
   * what makes her read as somebody's mother rather than as a sixth chicken.
   */
  animals.push({ kind: 'hen', x: 2286, y: 1352, homeRadius: 44, scale: 1.5 });
  animals.push({ kind: 'chick', x: 2302, y: 1358, homeRadius: 44, scale: 0.82 });

  // a cat asleep by the cottage door
  animals.push({ kind: 'cat', x: 640, y: 1498, homeRadius: 0, scale: 1.05 });
  sites.reserve(640, 1498, 40);

  /*
   * Frogs, on the biggest lily pads. Each is scaled to the leaf it sits on, so
   * none of them is balanced on something the size of itself.
   *
   * A frog takes the whole leaf: its flower is cleared rather than drawn under
   * it. This happens before anything is baked — the pond's draw closure reads
   * these same pads when the bake runs — and it costs the world generator no
   * randomness, so the rest of the valley falls exactly where it did.
   *
   * Nothing is reserved for them. They are out on the water, where nothing else
   * is placed and nobody can walk.
   */
  for (const pad of [...pond.pads].sort((p, q) => q.r - p.r).slice(0, 5)) {
    pad.flower = false;
    /*
     * Bigger than the leaf, on purpose. Sized to fit, a frog was a smudge you
     * had to already know about; this is a cosy game rather than a survey of
     * pond wildlife, and a frog you can see the face of is worth more than one
     * in scale. Set left of centre for the same reason: at this size a centred
     * frog hides its leaf completely, and off to one side the pad still shows.
     */
    const scale = pad.r / 10.5;
    animals.push({ kind: 'frog', x: pad.x - 4 * scale, y: pad.y - 2, homeRadius: 0, scale });
  }

  // --- scattered nature, wherever there is room left ---
  /*
   * Noted as they go up, so the owl can be given one of them.
   *
   * It has to be an existing tree rather than one planted for it. Every stroke
   * of the bake draws from the world's shared randomness, so adding a tree here
   * would move everything placed afterwards — and half the point of this valley
   * is that it is the same one each time you come back to it.
   */
  const trees: { x: number; y: number; scale: number }[] = [];
  for (let i = 0; i < 34; i++) {
    const spot = sites.findFree(46, 60, 40);
    if (!spot) continue;
    const scale = rr(0.85, 1.55);
    scenery.push(makeTree(spot.x, spot.y, scale));
    sites.reserve(spot.x, spot.y, 40 * scale);
    trees.push({ x: spot.x, y: spot.y, scale });
  }
  for (let i = 0; i < 30; i++) {
    const spot = sites.findFree(26, 50);
    if (!spot) continue;
    scenery.push(makeBush(spot.x, spot.y, rr(0.8, 1.4)));
    sites.reserve(spot.x, spot.y, 24);
  }
  for (let i = 0; i < 22; i++) {
    const spot = sites.findFree(26, 50);
    if (!spot) continue;
    scenery.push(makeRock(spot.x, spot.y, rr(0.7, 1.3)));
    sites.reserve(spot.x, spot.y, 24);
  }
  for (let i = 0; i < 150; i++) {
    const x = rr(40, WORLD_WIDTH - 40);
    const y = rr(100, WORLD_HEIGHT - 40);
    if (sites.inPond(x, y, 12)) continue;
    scenery.push(makeFlower(x, y));
  }

  const tufts: Tuft[] = [];
  for (let i = 0; i < 1500; i++) {
    const x = rr(0, WORLD_WIDTH);
    const y = rr(60, WORLD_HEIGHT);
    if (sites.inPond(x, y, 6)) continue;
    tufts.push(makeTuft(x, y));
  }

  /*
   * The owl's tree: the biggest one in the northern half of the map.
   *
   * Biggest because a small tree puts it at knee height, and northern because
   * that is away from the cottages and the farm — up where the walking is all
   * trees, which is as near to a wood as this valley has. Deterministic, so it
   * is the same tree every time; the fallback is only there because a `Layout`
   * has to be complete even in the impossible case of no trees at all.
   */
  const wood = trees.filter((tree) => tree.y < WORLD_HEIGHT * 0.42);
  const perch = (wood.length ? wood : trees).reduce(
    (best, tree) => (tree.scale > best.scale ? tree : best),
    (wood.length ? wood : trees)[0] ?? { x: 300, y: 300, scale: 1 },
  );
  /*
   * Sitting on a branch on the left of the trunk, below the middle of the
   * crown: high enough to be up the tree rather than under it, low enough that
   * the leaves are behind it rather than over it.
   */
  const owl = {
    x: perch.x - 20 * perch.scale,
    y: perch.y - 42 * perch.scale,
    /*
     * A little larger than life, but not by much.
     *
     * It went up to half again this size while I was trying to make claws and
     * sweeping horns legible; the answer was to stop drawing those rather than
     * to inflate the bird. What has to read is the shape: two small pointed
     * ears, two big eyes and the wings down its sides.
     */
    scale: Math.max(1, perch.scale * 0.7),
  };

  /*
   * The stump, in the same northern wood as the owl, and the clearing north of
   * it that the elephant stands in.
   *
   * Both are looked for with `isFree`, which asks the same question the
   * scattering does but takes no numbers from the world's generator — so this
   * can run last and shift nothing. And nothing is baked for either of them:
   * the stump is drawn live, because a `draw` added to the scenery would put
   * its pencil strokes into the middle of the bake's sequence and move every
   * tree placed after it.
   */
  const near = (ax: number, ay: number, pad: number) =>
    sites.isFree(ax, ay, pad) &&
    ay > 120 &&
    ax > 120 &&
    ax < WORLD_WIDTH - 120 &&
    /*
     * And well clear of the pond, which `isFree` alone does not give: the first
     * spot this found was outside the water but inside casting distance of it,
     * so standing at the stump offered to go fishing instead of to sit down.
     */
    !sites.inPond(ax, ay, 150);

  /*
   * Out in the north-east, well away from everything.
   *
   * Scanned on a fixed grid rather than sampled at random: this runs after the
   * whole valley is laid out, and a `findFree` here would take numbers from the
   * world's generator. A scan asks `isFree` the same question and takes none.
   */
  const scan = (
    fromX: number,
    toX: number,
    fromY: number,
    toY: number,
    pad: number,
  ): { x: number; y: number } | null => {
    // East to west, so it settles as far into the corner as there is room for.
    for (let ay = fromY; ay <= toY; ay += 40) {
      for (let ax = toX; ax >= fromX; ax -= 40) {
        if (near(ax, ay, pad)) return { x: ax, y: ay };
      }
    }
    return null;
  };

  /*
   * As near the top edge as there is room for.
   *
   * Sitting on it is what lifts the camera over the paper, and how far it rises
   * depends on how far up the field you are — from two hundred down the sky
   * only half opened. Against the top edge the whole of it comes up, sun and
   * all, which is the view the waiting is for.
   */
  const stump = scan(1680, WORLD_WIDTH - 200, 60, 620, 30) ??
    scan(200, WORLD_WIDTH - 200, 200, 900, 30) ?? { x: perch.x + 96, y: perch.y + 74 };
  /*
   * Off to one side and a little further away, so it is something you look
   * across at from the stump rather than something standing over you.
   */
  /*
   * Up in the sky, over the top edge of the world.
   *
   * Not on the ground at all. The stump is at the head of the valley, so
   * sitting on it lifts the camera over the paper's edge — and what you have
   * been waiting two minutes for turns up in the air above the horizon,
   * floating, exactly as it does in the painting. There is nothing to explain
   * it and it does not need explaining.
   *
   * `near` is not consulted: there is nothing up there to be free of. Held
   * down from the very top of the sky, too — the camera only rises three
   * hundred units and the animal is a hundred and forty tall, so any higher and
   * its ears are cut off by the edge of the screen.
   */
  /*
   * The whole mirage moved with the taller sky: cloud, animal and heat shimmer
   * still share this one origin. The extra 150 west is the cloud's old rendered
   * width, so doubling it grows mostly into the newly cleared space on the left.
   */
  const standing = { x: stump.x - 360, y: -134 };

  // A collider so you cannot stand inside the stump, and nothing drawn: see
  // above. The bake calls `draw` on every piece of scenery, and this one has
  // nothing to say.
  scenery.push({
    y: stump.y,
    colliders: [circleCollider(stump.x, stump.y - 2, 13)],
    draw() {},
  });

  /*
   * The lion, in the top-left corner of the map.
   *
   * Held well in from the very corner on purpose. The camera stops at the edge
   * of the world, so standing up there puts world (0,0) at the top-left of the
   * screen — which is exactly where the paint-pot panel sits. Anything within
   * about two hundred by a hundred and twenty of the origin spends its life
   * behind the HUD and might as well not be drawn.
   */
  const lion = scan(240, 620, 190, 430, 34) ?? { x: 300, y: 260 };
  /*
   * And it is something you bump into.
   *
   * Two circles rather than one: it is lying down, so its footprint is a long
   * low shape — the maned head at one end and the haunch at the other — and a
   * single circle round the pair of them would stop you a stride short of it.
   *
   * Colliders only and nothing drawn, like the stump: the bake calls `draw` on
   * every piece of scenery, and putting pencil strokes into the middle of that
   * sequence would move every tree placed after them.
   */
  scenery.push({
    y: lion.y,
    colliders: [
      circleCollider(lion.x - 8, lion.y - 5, 15),
      circleCollider(lion.x + 9, lion.y - 4, 11),
    ],
    draw() {},
  });

  return {
    scenery,
    northernLandmarks: NORTHERN_LANDMARKS,
    tufts,
    paths,
    pond: pond.area,
    animals,
    owl,
    lion,
    vigil: { x: stump.x, y: stump.y, elephantX: standing.x, elephantY: standing.y },
  };
}
