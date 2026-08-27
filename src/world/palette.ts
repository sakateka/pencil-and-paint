import type { Hex } from '../core/color';

/** Foliage. Picked per plant so a wood is not one flat green. */
export const GREENS: readonly Hex[] = ['#5d9e4f', '#4e8c4a', '#6cae57', '#57a05e'];

/** Rendered walls. */
export const WALLS: readonly Hex[] = ['#efe0c4', '#e8cfae', '#f0d9b8', '#e3d3bb'];

export const ROOFS: readonly Hex[] = ['#b8523f', '#8a5a7a', '#4a6f8c', '#a86a3c'];

export const BLOOMS: readonly Hex[] = [
  '#e8563f',
  '#f7c14b',
  '#e07ab0',
  '#f0f0e2',
  '#8e6fd0',
  '#ef8b4a',
];

/** What is actually in the paint pots. */
/**
 * One colour per pot, and no two the same.
 *
 * There were seven of these for fourteen pots, which was fine while a pot was
 * only a thing to find. It stopped being fine when the easel arrived: what you
 * can draw with is what you have picked up, so a repeated colour is a pot that
 * gives you nothing.
 *
 * Chosen to stay apart from each other at the size of a paint blob — four reds
 * that need holding side by side to tell apart would be the same problem in a
 * politer form.
 */
export const POT_HUES: readonly Hex[] = [
  '#e8563f',
  '#f7c14b',
  '#4a90c2',
  '#69b45c',
  '#e07ab0',
  '#8e6fd0',
  '#ef8b4a',
  '#2fa39a',
  '#c0405f',
  '#a9bf42',
  '#8dd0f0',
  '#a9713f',
  '#5560b8',
  '#5a6b70',
];

export const BARK = '#7d5a3a';
export const BARK_EDGE = '#5e4128';
export const STRAW = '#d9b45c';
export const STRAW_EDGE = '#a8823a';
export const WOOD = '#a9793f';
export const WOOD_EDGE = '#7a5730';
export const STONE = '#9a978e';
export const STONE_EDGE = '#66625a';
export const WATER = '#6fb3d2';
export const FENCE = '#b99a6e';
