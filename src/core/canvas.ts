/** An offscreen drawing surface and its context, kept together. */
export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', options);
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

export function createSurface(
  width: number,
  height: number,
  options?: CanvasRenderingContext2DSettings,
): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return { canvas, ctx: context2d(canvas, options) };
}

/** Run `draw` between a save/restore pair, so styles cannot leak out. */
export function isolate(ctx: CanvasRenderingContext2D, draw: () => void): void {
  ctx.save();
  try {
    draw();
  } finally {
    ctx.restore();
  }
}
