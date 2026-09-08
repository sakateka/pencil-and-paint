import { roundRectPath } from '../core/geom';
import type { Hex } from '../core/color';
import { TAU } from '../core/math';
import { jitter } from '../media/ink';
import { PENCIL, type Medium } from '../media/medium';
import { drawGlow } from '../media/sprites';

/**
 * The paint pots: fourteen of them, scattered somewhere new each game.
 *
 * Each one found widens the colour a little, which is the whole progression —
 * the reward for exploring is that you can see further while you do it.
 */

export interface Pot {
  readonly x: number;
  readonly y: number;
  readonly hue: Hex;
  found: boolean;
  /** Whether the colour has reached it. */
  awake: boolean;
  /**
   * Seconds since the colour reached it. Zero is the instant it noticed, which
   * is the instant it starts calling; it does not run at all out in the pencil.
   */
  clock: number;
  /** How hard it is shaking, nought to one. See `potStir`. */
  stir: number;
}

/**
 * How hard a pot shakes: full while it is still half-lost in the fog, nought
 * the moment it can be seen properly.
 *
 * A pot is the one thing in the valley whose job is to be noticed, and it only
 * has that job while it has not been. The colour does not end at a line — it is
 * solid out to `SOLID_TO` of its radius and fades the rest of the way — so
 * there is a wide band round the outside of it where a pot is *there*, and dim,
 * and easy to walk straight past. That band is exactly where it calls. Come far
 * enough in that it is painted at full strength and it goes quiet: it has been
 * seen, you are walking towards it, and a thing that keeps jiggling after it
 * has your attention is a thing you stop believing.
 *
 * `unseenWithin` is the width of that band, which grows with the light — every
 * pot found widens the colour — so it is handed in rather than fixed here.
 *
 * The ramp off nought on the line is because nothing the colour has not reached
 * may move — that is the rule the whole game is built on — and it means a pot
 * does not *snap* into motion either: it comes to life across the first few
 * units of colour rather than at a step.
 */
export function potStir(inside: number, unseenWithin: number): number {
  if (inside <= 0) return 0;
  return Math.min(1, inside / WAKE_OVER) * atRim(inside, unseenWithin);
}

/**
 * How much faster the call comes at the rim, one to about a half as fast again.
 *
 * A wider twist alone is a pot taking its time: it leans further and waits just
 * as long before it says anything again. What says *over here* is a pot that
 * calls more often, so the rim hurries the pot's own clock rather than only
 * stretching the lean. Applied to the clock and not to the
 * rate inside the sine on purpose — the clock is an accumulator, so changing
 * how fast it fills cannot jump the phase, where changing the rate a phase is
 * multiplied by would jump it every time you took a step.
 */
export function potHurry(inside: number, unseenWithin: number): number {
  return 1 + HURRY * atRim(inside, unseenWithin);
}

/** One at the edge of the colour, nought once the pot is properly in view. */
function atRim(inside: number, unseenWithin: number): number {
  if (unseenWithin <= 0) return 0;
  const near = 1 - Math.min(1, Math.max(0, inside) / unseenWithin);
  return near * near;
}

/**
 * Units of colour over a pot before it is shaking its full width.
 *
 * Short on purpose. This is not a fade-in — the pot is *meant* to come alive
 * the moment the colour touches it — it is only there so that the amplitude
 * leaves nought continuously rather than at a step, and four units is about a
 * twentieth of a second of walking.
 */
const WAKE_OVER = 4;

/** How much more often the call comes right on the line than at the far edge. */
const HURRY = 0.6;

/**
 * How far over the pot leans on the first swing, in radians. About eight
 * degrees, and deliberately not more: past that the jar stops reading as being
 * jogged where it stands and starts reading as being tipped over.
 */
const TILT = 0.14;

/**
 * And how far it comes up off the ground at the ends of its swing, in world
 * units.
 *
 * A jar rocked on the spot pivots on the rim of its base rather than on the
 * middle, so it rises as it leans — which is what makes a lean read as *being
 * shaken* rather than as a picture drawn crooked. It is also where the liveliness
 * comes from now: the lift is generous where the tilt is small, because three
 * pixels of rise is quite visible and eight degrees of lean is not.
 */
const LIFT = 3.5;

/**
 * A beat between the colour arriving and the pot answering it.
 *
 * Without it the shake lands on the same frame as the light does, and two
 * things happening at once read as one thing: the pot looks like part of how
 * the colour paints itself in, rather than like something the colour has just
 * found. Wait a third of a second and the eye has time to put the jar down as
 * scenery — which is exactly what makes it moving afterwards a thing that
 * speaks to you.
 */
const BEFORE_CALLING = 0.35;

/**
 * Seconds of shaking, once it starts.
 *
 * Two swings inside it, so each takes half a second. Brisker than that and the
 * jar moves more than a pixel a frame at the crossings, which is where a smooth
 * curve starts reading as a stepped one however honest the maths is — measured
 * with `motion.mjs pots`, which is what that instrument is for.
 */
const SHAKE_FOR = 1;

/** And how long from one shake to the next, so there is a silence between calls. */
const SHAKE_EVERY = 2.6;

/** Swings per shake: over, back, over, back. Two calls, not a wag. */
const SWINGS = 2;

/**
 * One swing of the shake, minus one to one, envelope and all.
 *
 * Both halves of a pot's animation are this number: the lean is it, and the
 * rise is its size. Written once so they cannot drift apart — a jar that comes
 * up off the ground at a different moment from the one it leans at is a jar
 * being pulled by two hands.
 */
function swing(clock: number, stir: number): number {
  const t = (clock % SHAKE_EVERY) - BEFORE_CALLING;
  if (t < 0 || t >= SHAKE_FOR) return 0;
  /*
   * Straight down from the first swing rather than a bell, because a bell is a
   * pot working up to it and a nudge is hardest the instant it lands. Linear
   * and not squared so the second call still carries: at a square it is a
   * seventh of the first and reads as one swing with a tremor after it.
   */
  const through = t / SHAKE_FOR;
  return Math.sin(through * TAU * SWINGS) * (1 - through) * stir;
}

/**
 * A pot shaken on the spot, in radians about its own base. Half its animation;
 * `potLift` is the other half.
 *
 * It used to be a bob — a translate, up and down. Which is a hop, and a hopping
 * jar is a thing with legs; what a pot wants to look like is a jar somebody has
 * just given a nudge, calling *here, over here*. So it is a rotation now,
 * hinged where the jar meets the ground, and it comes in bursts rather than
 * running forever: two swings that die away, then a second and a half of
 * standing perfectly still before it asks again. The silence is most of what
 * does the work — a thing that moves all the time is scenery, and a thing that
 * is still and then moves is something calling you.
 *
 * The clock is seconds since the colour arrived, not a free-running one, which
 * is the whole reason a pot has a clock of its own: the first swing has to land
 * on the instant the light touches it. Started from a shared clock with a
 * per-pot offset — as the bob was — a pot the colour reached mid-silence stood
 * there saying nothing for two seconds, exactly when it had the most to say.
 * Nothing keeps the fourteen from calling in chorus now and nothing needs to:
 * they are two hundred units apart at the least, so the colour cannot arrive at
 * two of them at once.
 *
 * The bob was also baked into the drawing once, which is why an unfound pot
 * kept a private frozen canvas that had to be thrown away and remade whenever
 * the colour crossed it — and `awake` is recomputed from the lit radius every
 * tick with no hysteresis, so a pot sitting on the edge of the circle allocated
 * a fresh canvas every frame. That churn is what drives an accelerated canvas
 * past its cache-miss ratio and drops a whole session onto the software path.
 * Nothing is baked from a pot's own numbers now, so there is nothing left to
 * throw away.
 */
export function potShake(clock: number, stir = 1): number {
  return swing(clock, stir) * TILT;
}

/**
 * How far the pot is up off the ground, in world units. Never negative: a jar
 * rocking on the rim of its base rises whichever way it leans, and it is the
 * rise that carries the shake — this is the old bob, kept, but spent on the
 * ends of the swings instead of running on for ever on a clock of its own.
 */
export function potLift(clock: number, stir = 1): number {
  return Math.abs(swing(clock, stir)) * LIFT;
}

/** The soft light a pot gives off, in white, so one picture serves all of them. */
export function drawPotGlow(ctx: CanvasRenderingContext2D): void {
  drawGlow(ctx, '#ffffff', 0, -8, 36);
}

/**
 * One jar, at its own origin.
 *
 * `seed` is where the pencil's wobble comes from. It used to come from the
 * pot's phase, which made every one of the fourteen a slightly different
 * drawing — fine when each carried its own canvas, and impossible to enumerate,
 * so the baked version picks between a few inked variants instead. Three is
 * what a hand-drawn cartoon uses and it is what the field already does.
 */
export function drawPotJar(
  ctx: CanvasRenderingContext2D,
  hue: Hex,
  medium: Medium,
  seed: number,
): void {
  if (medium === 'color') {
    // jar
    ctx.fillStyle = '#e9e2d2';
    roundRectPath(ctx, -9, -16, 18, 18, 3.5); ctx.fill();
    ctx.fillStyle = hue;
    roundRectPath(ctx, -9, -11, 18, 13, 3.5); ctx.fill();
    // spill on the rim
    ctx.fillStyle = hue;
    ctx.beginPath();
    ctx.moveTo(-9, -12);
    ctx.quadraticCurveTo(-12, -6, -10, 1);
    ctx.lineTo(-6, 1);
    ctx.quadraticCurveTo(-7, -6, -5, -12);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,40,.55)'; ctx.lineWidth = 1.4;
    roundRectPath(ctx, -9, -16, 18, 18, 3.5); ctx.stroke();
    // brush sticking out
    ctx.strokeStyle = '#a9793f'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(2, -14); ctx.lineTo(8, -26); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    roundRectPath(ctx, -6.5, -14, 3, 6, 1.5); ctx.fill();
    return;
  }

  let kk = seed;
  ctx.strokeStyle = PENCIL; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2;
  for (let pass = 0; pass < 2; pass++) {
    roundRectPath(ctx, -9 + jitter(kk++, 0.8), -16 + jitter(kk++, 0.8), 18, 18, 3.5);
    ctx.globalAlpha = pass ? 0.28 : 0.55;
    ctx.stroke();
  }
  ctx.globalAlpha = 0.4;
  for (let i = 0; i < 5; i++) {
    const yy = -10 + i * 2.4;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-7.5, yy + jitter(kk++, 0.5));
    ctx.lineTo(7.5, yy + jitter(kk++, 0.5));
    ctx.stroke();
  }
  ctx.lineWidth = 1.1; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(2, -14); ctx.lineTo(8 + jitter(kk++, 1), -26); ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Scatter the pots afresh — a new hunt every game.
 *
 * Uses `Math.random` rather than the world's seeded generator on purpose: the
 * valley should be the same place every visit, but the pots should not be where
 * you last found them.
 */
export function scatterPots(
  count: number,
  hues: readonly Hex[],
  bounds: { width: number; height: number },
  spawn: { x: number; y: number },
  isClear: (x: number, y: number, pad: number) => boolean,
): Pot[] {
  const pots: Pot[] = [];
  const MIN_SEPARATION = 210;
  const GOOD_ENOUGH = 430;

  const propose = () => ({
    x: 90 + Math.random() * (bounds.width - 180),
    y: 130 + Math.random() * (bounds.height - 220),
  });

  for (let i = 0; i < count; i++) {
    let best: { x: number; y: number } | null = null;
    let bestDistance = -1;

    // Try a batch and keep whichever candidate sits furthest from everything
    // already placed, so they spread out instead of clumping.
    for (let attempt = 0; attempt < 260; attempt++) {
      const spot = propose();
      if (!isClear(spot.x, spot.y, 46)) continue;
      let nearest = Math.min(Math.hypot(spot.x - spawn.x, spot.y - spawn.y), 900);
      for (const p of pots) nearest = Math.min(nearest, Math.hypot(spot.x - p.x, spot.y - p.y));
      if (nearest < MIN_SEPARATION) continue;
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = spot;
      }
      if (bestDistance > GOOD_ENOUGH) break;
    }

    // Nowhere roomy left: relax the spacing rather than drop a pot, since the
    // game is unwinnable if fewer than `count` exist.
    if (!best) {
      for (let attempt = 0; attempt < 900 && !best; attempt++) {
        const spot = propose();
        if (isClear(spot.x, spot.y, 40)) best = spot;
      }
    }
    if (!best) continue;

    pots.push({
      x: best.x,
      y: best.y,
      /*
       * One pot per colour, in order, rather than a colour drawn at random.
       *
       * Random gave duplicates and gaps, and now that the palette at the easel
       * is what you have collected, a duplicate is a pot that hands you nothing
       * you did not already have.
       */
      hue: hues[pots.length % hues.length],
      found: false,
      awake: false,
      clock: 0,
      stir: 0,
    });
  }
  return pots;
}
