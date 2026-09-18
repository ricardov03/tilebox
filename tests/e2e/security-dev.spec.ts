/**
 * The WP10 security round, the parts that need `nuxt dev` (the `dev` project).
 * No browser: Playwright's APIRequestContext talks to the dev server.
 */
import { expect, test } from '@playwright/test'

const ASSET_CSP = 'default-src \'none\'; style-src \'unsafe-inline\'; sandbox'

test.describe('S1b: the dev server sends the asset headers too', () => {
  for (const path of ['/icons/x.png', '/thumbs/x.webp', '/blocks/sample.jpg', '/site/og.png', '/site-uploads/x.png']) {
    test(`${path} has the sandbox CSP and nosniff`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.headers()['content-security-policy']).toBe(ASSET_CSP)
      expect(response.headers()['x-content-type-options']).toBe('nosniff')
    })
  }

  test('the page and the editor have no sandbox CSP', async ({ request }) => {
    for (const path of ['/', '/edit']) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
      expect(response.headers()['content-security-policy'] ?? '', path).not.toContain('sandbox')
    }
  })
})
