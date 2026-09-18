/**
 * WCAG 2.x contrast check for every color preset, light and dark.
 * Body text pairs need 4.5:1. accent-soft on accent needs 3:1 (small label, large weight).
 * Exit 1 on any failure.
 */
import { COLOR_PRESET_IDS, COLOR_PRESETS, type ColorRole, type ColorSet } from '../app/utils/presets'

type Rgb = [number, number, number]

function parseColor(value: string): Rgb {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i)
  if (hex && hex[1]) {
    const n = Number.parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = value.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgb && rgb[1] && rgb[2] && rgb[3]) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  }
  throw new Error(`Cannot parse color "${value}"`)
}

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(fg: string, bg: string): number {
  const a = luminance(parseColor(fg))
  const b = luminance(parseColor(bg))
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

interface Pair { fg: ColorRole, bg: ColorRole, min: number }

const PAIRS: Pair[] = [
  { fg: 'ink', bg: 'ground', min: 4.5 },
  { fg: 'ink', bg: 'tile', min: 4.5 },
  { fg: 'muted', bg: 'tile', min: 4.5 },
  { fg: 'muted', bg: 'ground', min: 4.5 },
  { fg: 'accent-ink', bg: 'accent', min: 4.5 },
  { fg: 'accent-soft', bg: 'accent', min: 4.5 },
  { fg: 'pop-ink', bg: 'pop', min: 4.5 },
  { fg: 'hover', bg: 'ground', min: 4.5 },
  { fg: 'hover', bg: 'tile', min: 4.5 },
  // The editor's delete control: the trash icon and its 1px border sit on a tile and on the ground.
  { fg: 'danger', bg: 'tile', min: 4.5 },
  { fg: 'danger', bg: 'ground', min: 4.5 },
  // "Yes" of the delete confirm: text on a filled danger button.
  { fg: 'danger-ink', bg: 'danger', min: 4.5 },
]

interface Row { preset: string, mode: 'light' | 'dark', pair: string, ratio: number, min: number, pass: boolean }

const rows: Row[] = []
for (const preset of COLOR_PRESET_IDS) {
  const modes: Array<['light' | 'dark', ColorSet]> = [['light', COLOR_PRESETS[preset].light], ['dark', COLOR_PRESETS[preset].dark]]
  for (const [mode, set] of modes) {
    for (const { fg, bg, min } of PAIRS) {
      const ratio = contrast(set[fg], set[bg])
      rows.push({ preset, mode, pair: `${fg} on ${bg}`, ratio, min, pass: ratio >= min })
    }
  }
}

const header = '| preset | mode | pair | ratio | min | ok |'
const sep = '|---|---|---|---|---|---|'
const lines = rows.map(r => `| ${r.preset} | ${r.mode} | ${r.pair} | ${r.ratio.toFixed(2)}:1 | ${r.min}:1 | ${r.pass ? 'yes' : 'NO'} |`)
process.stdout.write(`${[header, sep, ...lines].join('\n')}\n`)

const failed = rows.filter(r => !r.pass)
if (failed.length > 0) {
  process.stderr.write(`\n${failed.length} contrast pair(s) below the minimum.\n`)
  process.exit(1)
}
process.stdout.write(`\nAll ${rows.length} pairs pass.\n`)
