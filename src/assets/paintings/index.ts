import lionFull from './lion.webp';
import lionThumb from './thumb/lion.webp';

/**
 * The paintings on the easel, and where each of them stands in the valley.
 *
 * Our own drawings, photographed and resized — see CREDITS.md. The idea of the
 * collection is that most of them are also out there somewhere: the frogs
 * really are on the pond. Showing them all at once, at the end, lets somebody
 * who walked past them put the two together.
 *
 * Only the lion so far. The rest are being re-photographed, flat and square in
 * daylight, which is the difference between a painting and a picture of one.
 */
export interface Painting {
  readonly id: string;
  readonly thumb: string;
  readonly full: string;
  /** Whether this one also stands somewhere in the world. */
  readonly inTheWorld: boolean;
}

export const PAINTINGS: readonly Painting[] = [
  { id: 'lion', thumb: lionThumb, full: lionFull, inTheWorld: false },
];
