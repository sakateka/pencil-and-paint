import lionFull from './lion.webp';
import lionThumb from './thumb/lion.webp';

/**
 * The paintings somebody brought, and where each of them stands in the valley.
 *
 * This is the whole idea of the collection: most of them are also out there
 * somewhere — the frogs really are on the pond, the owl really is up a tree —
 * and the point of showing them all at once, at the end, is that somebody who
 * walked past them gets to put the two together.
 *
 * Only the lion so far. An earlier batch was photographed at an angle on a lit
 * table and no amount of straightening made them read as paintings rather than
 * as pictures of paintings; the lion was shot flat and square in daylight and
 * needed almost nothing doing to it. The rest are being re-shot the same way.
 * See CREDITS.md.
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
