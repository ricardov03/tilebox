/**
 * axe-core on the prerendered page, both viewports, both themes.
 * Passes when no violation is serious or critical.
 */
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { presetTheme, settle } from './helpers'

const viewports = [
  { name: '1280', width: 1280, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const
const themes = ['light', 'dark'] as const

for (const viewport of viewports) {
  for (const theme of themes) {
    test(`no serious or critical issues at ${viewport.name}, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await presetTheme(page, theme)
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      // The tile stagger fades tiles in. axe must see the final colors.
      await settle(page)

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .analyze()

      const blocking = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      const describe = (v: (typeof results.violations)[number]) =>
        `${v.impact}: ${v.id} (${v.nodes.length} nodes) ${v.help}`
      expect(blocking.map(describe), results.violations.map(describe).join('\n')).toEqual([])
    })
  }
}
