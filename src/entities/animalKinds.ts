/**
 * Separated from `animals.ts` so the world layout can name a herd without
 * pulling in the drawing code (and the import cycle that would create).
 */
export type AnimalKind = 'sheep' | 'cow' | 'chicken' | 'cat' | 'frog';
