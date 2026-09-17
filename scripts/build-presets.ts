/**
 * presets.ts -> app/assets/css/presets.css
 * Runs in `predev` and `pregenerate`. Output is deterministic.
 */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  COLOR_PRESET_IDS,
  COLOR_PRESETS,
  COLOR_ROLES,
  FONT_PRESET_IDS,
  FONT_PRESETS,
  fontStack,
  type ColorSet,
} from '../app/utils/presets'

const out = resolve(process.cwd(), 'app/assets/css/presets.css')

function colorBlock(selector: string, set: ColorSet): string {
  const lines = COLOR_ROLES.map(role => `  --color-${role}: ${set[role]};`)
  return `${selector} {\n${lines.join('\n')}\n}`
}

const parts: string[] = [
  '/* generated, do not edit. Source: app/utils/presets.ts. Run `npm run presets`. */',
  '',
  '/* Color presets. Light values, then dark values under [data-theme="dark"]. */',
]

for (const preset of COLOR_PRESET_IDS) {
  const { light, dark } = COLOR_PRESETS[preset]
  parts.push(colorBlock(`[data-colors="${preset}"]`, light))
  parts.push(colorBlock(`[data-colors="${preset}"][data-theme="dark"]`, dark))
}

parts.push('', '/* Font presets. */')

for (const preset of FONT_PRESET_IDS) {
  const { display, body, mono } = FONT_PRESETS[preset]
  const lines = [
    `  --font-display: ${fontStack(display, 'display')};`,
    `  --font-sans: ${fontStack(body, 'body')};`,
    `  --font-mono: ${fontStack(mono, 'mono')};`,
    `  --font-display-weight: ${display.weights[0]};`,
  ]
  parts.push(`[data-fonts="${preset}"] {\n${lines.join('\n')}\n}`)
  if (display.style) {
    parts.push(`[data-fonts="${preset}"] .font-display {\n  ${display.style};\n}`)
  }
}

const css = `${parts.join('\n')}\n`
await writeFile(out, css, 'utf8')
process.stdout.write(`presets.css written (${COLOR_PRESET_IDS.length} color presets, ${FONT_PRESET_IDS.length} font presets)\n`)
