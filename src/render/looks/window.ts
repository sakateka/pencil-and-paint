import type { Treehouse } from '../../entities/treehouse';
import {
  drawRoomFigure,
  drawRoomLight,
  drawWindowFrame,
  drawWindowSpill,
  roomBob,
  roomFloor,
  windowPane,
  WINDOW,
} from '../../world/treehouse';
import type { Look, LookLibrary } from '../looks';
import type { Layer, Stage } from '../stage';

/**
 * The lit window of the treehouse, and whoever is pacing about behind it.
 *
 * The most expensive thing in the game, measured: **29.7MB a second**, every
 * second you are up there. A three-hundred-and-sixty-unit square canvas,
 * repainted every frame — the pose string carried the room's clock — to move a
 * figure eleven pixels wide a fraction of a pixel across a window.
 *
 * Three of the four parts never change at all: the lamplight in the room, the
 * frame over it, the spill on the platform outside. The fourth is a person
 * walking, and walking is a position and a bob.
 *
 * What is not a transform is the *clip*. The wall is a wall: the figure must
 * stop existing at the edge of the glass rather than fade out or be painted
 * over, and that was `ctx.clip()` around the whole drawing. As a sprite it is a
 * crop — see `Stage.showLook` — which is the same thing said to the GPU, and
 * the only reason this look bakes both facings instead of mirroring one: a crop
 * is measured in the picture's own pixels, and mirroring measures them from the
 * other end.
 */

interface Only {
  readonly only: 0;
}

const ONE: readonly Only[] = [{ only: 0 }];

function partLook(spec: {
  id: string;
  reach: number;
  draw(ctx: CanvasRenderingContext2D): void;
}): Look<Only> {
  return {
    id: spec.id,
    /* Up a ladder at the top of the map, and only ever seen in colour. */
    media: ['color'],
    reach: spec.reach,
    poses: () => ONE,
    key: () => 'one',
    draw: (ctx) => spec.draw(ctx),
  };
}

/*
 * The pane and the frame are baked about the window's top-left corner rather
 * than about its middle, which is how `drawRoomLight` and `drawWindowFrame`
 * draw them and how the clip rectangle is written down. `reach` has to cover
 * the whole rectangle from that corner, so it is the diagonal, not the half.
 */
const paneReach = Math.ceil(Math.hypot(WINDOW.w, WINDOW.h)) + 4;

const roomLight = partLook({ id: 'window:room', reach: paneReach, draw: drawRoomLight });
const windowFrame = partLook({ id: 'window:frame', reach: paneReach, draw: drawWindowFrame });

/** Soft to its edge and forty-six units across, so it is baked coarse. */
const windowSpill: Look<Only> = {
  ...partLook({ id: 'window:spill', reach: 52, draw: drawWindowSpill }),
  grain: () => 2,
};

interface FigurePose {
  readonly facing: -1 | 1;
}

const roomFigure: Look<FigurePose> = {
  id: 'window:figure',
  media: ['color'],
  reach: 36,
  poses: () => [{ facing: 1 }, { facing: -1 }],
  key: (pose) => (pose.facing < 0 ? 'west' : 'east'),
  draw: (ctx, pose) => drawRoomFigure(ctx, pose.facing),
};

export function registerWindowLooks(library: LookLibrary): void {
  library.register(roomLight);
  library.register(windowFrame);
  library.register(roomFigure);
  library.register(windowSpill);
}

/**
 * Show the window, if anybody is up there.
 *
 * The order is the order the one canvas was painted in: the lit room, the
 * figure cut to the glass, the frame over both, and the spill outside it.
 */
export function showWindow(
  stage: Stage,
  library: LookLibrary,
  house: Treehouse,
  layer: Layer,
  depth: number,
): void {
  if (!house.inside) return;
  const pane = windowPane(house.x, house.y);
  const on = { library, medium: 'color', layer } as const;
  const at = (n: number) => depth + n * 0.000001;

  stage.showLook({
    ...on,
    id: roomLight.id,
    poseKey: 'one',
    x: pane.left,
    y: pane.top,
    depth: at(0),
  });

  stage.showLook({
    ...on,
    id: roomFigure.id,
    poseKey: roomFigure.key({ facing: house.facing }, 'color'),
    x: house.x + house.offset,
    y: roomFloor(house.y) - roomBob(house.walk, house.moving),
    depth: at(1),
    crop: pane,
  });

  stage.showLook({
    ...on,
    id: windowFrame.id,
    poseKey: 'one',
    x: pane.left,
    y: pane.top,
    depth: at(2),
  });

  stage.showLook({
    ...on,
    id: windowSpill.id,
    poseKey: 'one',
    x: (pane.left + pane.right) / 2,
    y: pane.bottom,
    depth: at(3),
  });
}
