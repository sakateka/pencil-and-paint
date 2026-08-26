import { clamp, TAU } from '../core/math';
import { rr } from '../core/rng';

/**
 * Paint splashes when a pot is found, and drifting motes of colour that follow
 * the walker around. Both are pure decoration and both live only inside the
 * lit area, so they never give away what is out in the dark.
 */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  readonly maxLife: number;
  readonly radius: number;
  readonly colour: string;
  readonly gravity: number;
}

const MOTE_COLOURS = ['#fff6c9', '#ffd9a0', '#cfeeff', '#ffd4e6'] as const;

/**
 * Compact in place. `arr = arr.filter(...)` throws away a fresh array every
 * frame for each of these lists — small, but it is per-frame garbage.
 */
function sweep<T>(arr: T[], alive: (item: T) => boolean): void {
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (alive(arr[i])) arr[n++] = arr[i];
  }
  arr.length = n;
}

export class Particles {
  private readonly splashes: Particle[] = [];
  private readonly motes: Particle[] = [];

  clear(): void {
    this.splashes.length = 0;
    this.motes.length = 0;
  }

  /** A pot has been found. */
  burst(x: number, y: number, colour: string, count = 26): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const speed = 40 + Math.random() * 150;
      this.splashes.push({
        x,
        y: y - 8,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 60,
        life: 0.8 + Math.random() * 0.7,
        maxLife: 1.5,
        radius: 1.6 + Math.random() * 3.2,
        colour,
        gravity: 190,
      });
    }
  }

  private spawnMote(x: number, y: number, radius: number): void {
    const a = Math.random() * TAU;
    const d = Math.random() * radius * 0.85;
    this.motes.push({
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      vx: rr(-8, 8),
      vy: rr(-16, -4),
      life: rr(1.6, 3.4),
      maxLife: 3.4,
      radius: rr(0.9, 2.2),
      colour: MOTE_COLOURS[Math.floor(Math.random() * MOTE_COLOURS.length)],
      gravity: 0,
    });
  }

  update(dt: number, elapsed: number, walkerX: number, walkerY: number, litRadius: number, walkerSpeed: number): void {
    for (const p of this.splashes) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.6 * dt;
    }
    sweep(this.splashes, (p) => p.life > 0);

    if (Math.random() < (walkerSpeed > 20 ? 0.55 : 0.22)) {
      this.spawnMote(walkerX, walkerY, litRadius);
    }
    for (const m of this.motes) {
      m.life -= dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vx += Math.sin(elapsed * 1.3 + m.y * 0.01) * 6 * dt;
    }
    sweep(this.motes, (m) => m.life > 0);
  }

  /** Motes fade out towards the edge of the light; splashes do not. */
  draw(
    ctx: CanvasRenderingContext2D,
    walkerX: number,
    walkerY: number,
    litRadius: number,
    flooded: boolean,
  ): void {
    for (const m of this.motes) {
      const fade = clamp(m.life / m.maxLife, 0, 1) * 0.9;
      const nearness = flooded
        ? 1
        : clamp(1 - Math.hypot(m.x - walkerX, m.y - walkerY) / (litRadius * 0.95), 0, 1);
      ctx.globalAlpha = fade * nearness;
      ctx.fillStyle = m.colour;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius, 0, TAU);
      ctx.fill();
    }
    for (const p of this.splashes) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
