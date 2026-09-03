import { TAU } from '../core/math';
import { STONE, STONE_EDGE, STRAW, STRAW_EDGE, WATER, WOOD, WOOD_EDGE } from './palette';
import { SCARECROW, WELL } from './layout';

/**
 * The few things worth leaning in on.
 *
 * Not everything you can stand at. A prompt that follows you round the valley
 * offering to look at grass is a prompt nobody reads, so this is a short list
 * and it stays short: a thing earns a place here by having something in it the
 * world view genuinely cannot show you.
 *
 * Which is the rule these drawings are held to. They are not the world sprite
 * scaled up — that is the same picture, larger, and leaning in on it would tell
 * you nothing. Each one is drawn again, close, with the things you could never
 * have seen from standing height: what is at the bottom of the well, and what
 * somebody stitched on the scarecrow's face.
 */

/** Something you can stand at and lean in on. */
export interface Lookable {
  /** Matches the i18n keys and identifies it to the tests. */
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** How near you must be standing. */
  readonly reach: number;
  /**
   * Drawn into a square of this many units, centred on the origin.
   *
   * The panel scales to fit, so this is about proportion rather than size.
   */
  draw(ctx: CanvasRenderingContext2D): void;
}

/** The side of the square each close-up is composed inside. */
export const CLOSE_SPAN = 200;

/**
 * Down the well.
 *
 * Straight down, which is the one view of it standing height cannot give you:
 * courses of stone running away and narrowing, moss as far down as the light
 * reaches, and cold water a long way below that.
 *
 * There was a reflection of the walker in the water here for a while. It read
 * as a smudge floating in the dark rather than as anybody, and it broke up the
 * depth the courses had just spent seven rings establishing — so the water is
 * water again.
 */
function drawWell(ctx: CanvasRenderingContext2D): void {
  // The shaft, seen straight down: stones in courses, narrowing into the dark.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 4, 86, 74, 0, 0, TAU);
  ctx.clip();

  ctx.fillStyle = '#2b2721';
  ctx.fillRect(-100, -100, 200, 200);

  /*
   * Courses of stone running away from you.
   *
   * Each ring is smaller and darker than the one above it, which is the only
   * thing that makes a flat ellipse read as a hole rather than a plate.
   */
  for (let ring = 0; ring < 7; ring++) {
    const t = ring / 6;
    const rx = 86 - t * 52;
    const ry = 74 - t * 46;
    const dim = 1 - t * 0.72;
    ctx.strokeStyle = STONE_EDGE;
    ctx.globalAlpha = 0.55 * dim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 4 + t * 6, rx, ry, 0, 0, TAU);
    ctx.stroke();
    // Joints, staggered course to course the way a bricklayer would set them.
    ctx.globalAlpha = 0.4 * dim;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + (ring % 2 ? 0.35 : 0);
      const inner = 1 - 0.14;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rx, 4 + t * 6 + Math.sin(a) * ry);
      ctx.lineTo(Math.cos(a) * rx * inner, 4 + t * 6 + Math.sin(a) * ry * inner);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Moss on the upper courses, where the light still gets in.
  ctx.fillStyle = 'rgba(86,124,66,.45)';
  for (const [mx, my, mr] of [
    [-64, -18, 13],
    [-48, -44, 9],
    [52, -34, 11],
    [70, -2, 8],
    [18, -62, 10],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(mx, my, mr, mr * 0.62, 0, 0, TAU);
    ctx.fill();
  }

  // The water, far down and almost still.
  ctx.fillStyle = WATER;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(0, 12, 33, 27, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(20,44,58,.55)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 33, 27, 0, 0, TAU);
  ctx.fill();

  // The ripples that say it is water and not a mirror.
  ctx.strokeStyle = 'rgba(214,238,247,.4)';
  ctx.lineWidth = 1.4;
  for (const [ry, rw] of [
    [2, 24],
    [16, 28],
    [26, 18],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(-rw, ry);
    ctx.quadraticCurveTo(-rw / 2, ry - 3, 0, ry);
    ctx.quadraticCurveTo(rw / 2, ry + 3, rw, ry);
    ctx.stroke();
  }
  ctx.restore();

  // The rim you are leaning on, across the bottom of the view.
  ctx.fillStyle = STONE;
  ctx.beginPath();
  ctx.ellipse(0, 4, 96, 84, 0, 0, TAU);
  ctx.ellipse(0, 4, 86, 74, 0, 0, TAU);
  ctx.fill('evenodd');
  ctx.strokeStyle = STONE_EDGE;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(0, 4, 96, 84, 0, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 4, 86, 74, 0, 0, TAU);
  ctx.stroke();

  // The rope, over the rim and down out of sight.
  ctx.strokeStyle = WOOD_EDGE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-72, -58);
  ctx.quadraticCurveTo(-40, -30, -22, 2);
  ctx.stroke();
  ctx.strokeStyle = WOOD;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-72, -58);
  ctx.quadraticCurveTo(-40, -30, -22, 2);
  ctx.stroke();
}

const SACKING = '#d8c49a';
const SACKING_EDGE = '#a4906a';

/** Where the flat of the brim sits — the crown rises from it, the head through it. */
const BRIM_Y = -52;

/**
 * The head, as one shape, because four things are cut to it.
 *
 * Tall enough that its top goes up past the brim and is lost under the crown,
 * which is what makes the hat look worn rather than balanced on top.
 */
function head(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.ellipse(0, 2, 60, 64, 0, 0, TAU);
}

/**
 * The scarecrow's face.
 *
 * Somebody made this, and at standing height you cannot see that they gave it
 * two odd buttons and a mouth sewn on crooked by hand.
 */
function drawScarecrow(ctx: CanvasRenderingContext2D): void {
  /*
   * A hat is a disc with a head through the middle of it, and the drawing has
   * to be built in that order or it never sits right.
   *
   * The whole brim goes down first, so its far edge is behind everything. Then
   * the head, rising up through the hole in it. Then the crown, on top of the
   * skull. Then the near half of the brim again, over the face — because the
   * edge nearest you passes in front of the forehead, and that one overlap is
   * the entire difference between a worn hat and a hat floating above a ball.
   */
  const brim = (from: number, to: number): void => {
    ctx.beginPath();
    ctx.ellipse(0, BRIM_Y, 92, 20, 0, from, to);
    ctx.closePath();
  };

  ctx.fillStyle = STRAW;
  brim(0, TAU);
  ctx.fill();
  ctx.strokeStyle = STRAW_EDGE;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // The sacking head, whose top disappears into the hat.
  ctx.fillStyle = SACKING;
  head(ctx);
  ctx.fill();
  ctx.strokeStyle = SACKING_EDGE;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // The weave of it, which is only visible this close.
  ctx.strokeStyle = 'rgba(140,120,88,.34)';
  ctx.lineWidth = 1;
  ctx.save();
  head(ctx);
  ctx.clip();
  for (let i = -70; i <= 70; i += 7) {
    ctx.beginPath();
    ctx.moveTo(i, -62);
    ctx.lineTo(i, 68);
    ctx.moveTo(-70, i + 2);
    ctx.lineTo(70, i + 2);
    ctx.stroke();
  }
  ctx.restore();

  // The crown, sitting on the skull.
  ctx.fillStyle = STRAW;
  ctx.beginPath();
  ctx.moveTo(-41, BRIM_Y);
  ctx.lineTo(-35, -96);
  ctx.lineTo(35, -96);
  ctx.lineTo(41, BRIM_Y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = STRAW_EDGE;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  /*
   * And the near half of the brim, back over the face.
   *
   * The straight edge of this half-disc lies exactly along the middle of the
   * brim already drawn, in the same colour, so it leaves no seam — it simply
   * lifts the front of the brim in front of the head.
   */
  ctx.fillStyle = STRAW;
  brim(0, Math.PI);
  ctx.fill();
  ctx.fillStyle = STRAW_EDGE;
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  ctx.ellipse(0, BRIM_Y + 2, 92, 20, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = STRAW_EDGE;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(0, BRIM_Y, 92, 20, 0, 0, Math.PI);
  ctx.stroke();

  // The shadow it throws across the forehead, just under that near edge.
  ctx.save();
  head(ctx);
  ctx.clip();
  ctx.fillStyle = 'rgba(96,80,56,.22)';
  ctx.beginPath();
  ctx.ellipse(0, -30, 92, 22, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  /*
   * Two buttons for eyes, and they do not match.
   *
   * That is the detail the whole close-up is for: from standing height it is
   * two dots, and whoever sewed it on clearly used whatever was in the tin.
   */
  const button = (bx: number, by: number, r: number, fill: string, holes: number): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(50,44,36,.6)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = 'rgba(50,44,36,.75)';
    for (let i = 0; i < holes; i++) {
      const a = (i / holes) * TAU + 0.6;
      ctx.beginPath();
      ctx.arc(bx + Math.cos(a) * r * 0.36, by + Math.sin(a) * r * 0.36, 1.5, 0, TAU);
      ctx.fill();
    }
    // The thread somebody left hanging.
    ctx.strokeStyle = 'rgba(50,44,36,.45)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(bx, by + r * 0.4);
    ctx.quadraticCurveTo(bx + 3, by + r + 5, bx - 2, by + r + 11);
    ctx.stroke();
  };
  button(-23, -6, 11, '#4a6f8c', 4);
  button(22, -3, 8.5, '#b8523f', 2);

  // A mouth sewn on crooked, in big cross stitches.
  ctx.strokeStyle = 'rgba(70,58,44,.8)';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const mx = -26 + i * 10.5;
    const my = 32 + Math.sin(i * 1.1) * 3;
    ctx.beginPath();
    ctx.moveTo(mx - 4, my - 4);
    ctx.lineTo(mx + 4, my + 4);
    ctx.moveTo(mx + 4, my - 4);
    ctx.lineTo(mx - 4, my + 4);
    ctx.stroke();
  }

  // Straw out of the collar, because it is stuffed with it.
  ctx.strokeStyle = STRAW_EDGE;
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 11; i++) {
    const sx = -48 + i * 9.6;
    ctx.beginPath();
    ctx.moveTo(sx, 60);
    ctx.lineTo(sx + Math.sin(i * 2.3) * 9, 60 + 16 + Math.cos(i * 1.7) * 6);
    ctx.stroke();
  }
}

/**
 * How near you must be standing.
 *
 * Wider than an arm's reach, because both of these are things you walk up to
 * rather than things you touch, and narrow enough that the prompt does not
 * follow you across the yard.
 */
const LOOK_REACH = 74;

export const LOOKABLES: readonly Lookable[] = [
  { id: 'well', x: WELL.x, y: WELL.y, reach: LOOK_REACH, draw: drawWell },
  { id: 'scarecrow', x: SCARECROW.x, y: SCARECROW.y, reach: LOOK_REACH, draw: drawScarecrow },
];
