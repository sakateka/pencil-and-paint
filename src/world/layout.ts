import { TAU } from '../core/math';
import { rng, rnd, rr } from '../core/rng';
import type { AnimalKind } from '../entities/animalKinds';
import { makeBarn, makeHouse } from './buildings';
import { makeBench, makeHayBale, makeHaystack, makeScarecrow, makeTrough, makeWell } from './farm';
import { makeBush, makeFence, makeFlower, makeLamp, makeRock, makeTree } from './scenery';
import { makePond, makeTuft, type Ellipse, type Path, type Tuft } from './terrain';
import type { Scenery } from './types';

export const WORLD_WIDTH = 2800;
export const WORLD_HEIGHT = 2000;

/** Where the walker starts, and where they return on restart. */
export const SPAWN = { x: 1300, y: 1330 } as const;

export interface AnimalSpawn {
  kind: AnimalKind;
  x: number;
  y: number;
  homeRadius: number;
  scale: number;
}

export interface Layout {
  scenery: Scenery[];
  tufts: Tuft[];
  paths: Path[];
  pond: Ellipse;
  animals: AnimalSpawn[];
}

/**
 * Keeps scattered scenery out of places that need to stay clear — paths,
 * doorways, pastures, the pond. Rejection sampling: propose a spot, take it if
 * nothing has claimed the space.
 */
class Sites {
  private claimed: { x: number; y: number; r: number }[] = [];
  private pond: Ellipse | null = null;

  setPond(pond: Ellipse): void {
    this.pond = pond;
  }

  reserve(x: number, y: number, r: number): void {
    this.claimed.push({ x, y, r });
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
    return !this.claimed.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + pad);
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

  // paddock rails, with a gap left open as a gate
  scenery.push(makeFence(1900, 700, 2210, 700));
  scenery.push(makeFence(2330, 700, 2570, 706));
  scenery.push(makeFence(2570, 706, 2560, 1030));
  scenery.push(makeFence(2560, 1030, 2180, 1040));
  scenery.push(makeFence(1980, 1036, 1900, 1030));
  scenery.push(makeFence(1900, 1030, 1900, 700));

  scenery.push(makeHaystack(2585, 590, 1));
  scenery.push(makeHayBale(1935, 610, 1));
  scenery.push(makeHayBale(1988, 632, 0.9));
  scenery.push(makeHayBale(2612, 1075, 1.05));
  scenery.push(makeTrough(2090, 985));
  scenery.push(makeScarecrow(1840, 1160));
  scenery.push(makeWell(1655, 1205));
  scenery.push(makeBench(1425, 1255));
  sites.reserve(2585, 590, 90);
  sites.reserve(1960, 620, 80);
  sites.reserve(1840, 1160, 60);
  sites.reserve(1655, 1205, 60);
  sites.reserve(1425, 1255, 50);

  // a second, smaller pasture behind the south-west cottage
  scenery.push(makeFence(660, 1520, 900, 1500));
  scenery.push(makeFence(900, 1500, 930, 1330));
  scenery.push(makeFence(2150, 1300, 2400, 1330));
  scenery.push(makeHayBale(700, 1640, 0.95));

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
  // a cat asleep by the cottage door
  animals.push({ kind: 'cat', x: 640, y: 1498, homeRadius: 0, scale: 1.05 });
  sites.reserve(640, 1498, 40);

  // --- scattered nature, wherever there is room left ---
  for (let i = 0; i < 34; i++) {
    const spot = sites.findFree(46, 60, 40);
    if (!spot) continue;
    const scale = rr(0.85, 1.55);
    scenery.push(makeTree(spot.x, spot.y, scale));
    sites.reserve(spot.x, spot.y, 40 * scale);
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

  return { scenery, tufts, paths, pond: pond.area, animals };
}
