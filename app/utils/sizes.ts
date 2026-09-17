/**
 * Tile sizes on the 4-column grid. PLAN.md section 4.
 */

export const SIZES = ['1x1', '2x1', '1x2', '2x2'] as const
export type Size = (typeof SIZES)[number]

/** Tailwind classes per size. `1x1` needs no class. */
export const SIZE_CLASSES: Record<Size, string> = {
  '1x1': '',
  '2x1': 'col-span-2',
  '1x2': 'row-span-2',
  '2x2': 'col-span-2 row-span-2',
}

export function sizeToSpan(size: Size): { cols: 1 | 2, rows: 1 | 2 } {
  const cols = size === '2x1' || size === '2x2' ? 2 : 1
  const rows = size === '1x2' || size === '2x2' ? 2 : 1
  return { cols, rows }
}
