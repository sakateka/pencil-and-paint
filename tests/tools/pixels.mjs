import { PNG } from 'pngjs';

/**
 * The pixels of a region of the page, as the screen shows them.
 *
 * Through a screenshot rather than through `pencil.composited`, which reads the
 * WebGL canvas back and needs the drawing buffer preserved — reliable in the
 * test suite, and not reliable enough here: it came back empty on some runs of
 * the same build, which for an instrument is worse than useless. A screenshot
 * is what the player sees, and it is never empty.
 */
export async function pixels(page, clip) {
  const png = PNG.sync.read(await page.screenshot({ clip }));
  return { width: png.width, height: png.height, data: png.data };
}

/** How far apart two regions of pixels are, 0 to 255. */
export function difference(a, b) {
  if (a.data.length !== b.data.length) return undefined;
  let total = 0;
  let worst = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.abs(a.data[i] - b.data[i]);
    total += d;
    if (d > worst) worst = d;
  }
  return { mean: total / a.data.length, worst };
}
