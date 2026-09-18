/**
 * WP18: the icon routes of the editor, on `nuxt dev` (the `dev` project).
 * No browser: Playwright's APIRequestContext talks to the dev server.
 * "No outbound request" is proven in icons.spec.ts (static): the two routes and the index import
 * no network code. Here the routes answer from the local packs, whatever the network does.
 */
import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { isAllowedIconName } from '../../app/utils/icon-sets'
import type { Profile } from '../../types/profile'
import { PERSONAL_PROFILE_PATH, readProfile } from './helpers'

const ASSET_CSP = 'default-src \'none\'; style-src \'unsafe-inline\'; sandbox'

interface SearchAnswer {
  icons: string[]
  sets: string[]
  total: number
}

test.describe('GET /api/icons/search', () => {
  test('q=github: line-md:github first, only the two sets, the documented shape', async ({ request }) => {
    const response = await request.get('/api/icons/search?q=github')
    expect(response.status()).toBe(200)
    const answer = await response.json() as SearchAnswer
    expect(answer.icons[0]).toBe('line-md:github')
    expect(answer.icons[1]).toBe('simple-icons:github')
    expect(answer.sets).toEqual(['line-md', 'simple-icons'])
    expect(answer.total).toBeGreaterThanOrEqual(answer.icons.length)
    expect(answer.icons.length).toBeLessThanOrEqual(48)
    for (const name of answer.icons) expect(isAllowedIconName(name), name).toBe(true)
  })

  test('q=lucide:mail returns no lucide: name', async ({ request }) => {
    const answer = await (await request.get('/api/icons/search?q=lucide:mail')).json() as SearchAnswer
    expect(answer.icons.length).toBeGreaterThan(0)
    expect(answer.icons.filter(name => name.startsWith('lucide:'))).toEqual([])
    for (const name of answer.icons) expect(isAllowedIconName(name), name).toBe(true)
  })

  test('a full name comes first, a removed brand never comes, an empty q gives the default list', async ({ request }) => {
    const exact = await (await request.get('/api/icons/search?q=simple-icons:github')).json() as SearchAnswer
    expect(exact.icons[0]).toBe('simple-icons:github')
    const linkedin = await (await request.get('/api/icons/search?q=linkedin')).json() as SearchAnswer
    expect(linkedin.icons).toContain('line-md:linkedin')
    expect(linkedin.icons).not.toContain('simple-icons:linkedin')
    const empty = await (await request.get('/api/icons/search?q=')).json() as SearchAnswer
    expect(empty.icons.length).toBeGreaterThan(10)
    expect(empty.icons).toContain('line-md:link')
  })

  test('input is checked: q twice is 400, a very long q is cut, a foreign Host is 403', async ({ request }) => {
    expect((await request.get('/api/icons/search?q=a&q=b')).status()).toBe(400)
    const long = await request.get(`/api/icons/search?q=${'z'.repeat(1500)}`)
    expect(long.status()).toBe(200)
    expect((await long.json() as SearchAnswer).icons).toEqual([])
    expect((await request.get('/api/icons/search?q=github', { headers: { host: 'evil.example' } })).status()).toBe(403)
  })

  test('a query is fast (the index is built once)', async ({ request }) => {
    await request.get('/api/icons/search?q=warm-up')
    const start = performance.now()
    for (const q of ['a', 'github', 'you tube', 'mail']) expect((await request.get(`/api/icons/search?q=${encodeURIComponent(q)}`)).status()).toBe(200)
    // Four HTTP round trips on localhost. The search itself is about 1 ms (icons.spec.ts).
    expect(performance.now() - start).toBeLessThan(1000)
  })
})

test.describe('GET /api/icons/svg', () => {
  test('line-md:github is an SVG file from the local pack, cached, sandboxed', async ({ request }) => {
    const response = await request.get('/api/icons/svg?name=line-md:github')
    expect(response.status()).toBe(200)
    const headers = response.headers()
    expect(headers['content-type']).toContain('image/svg+xml')
    expect(headers['cache-control']).toBe('max-age=3600')
    expect(headers['content-security-policy']).toBe(ASSET_CSP)
    expect(headers['x-content-type-options']).toBe('nosniff')
    const svg = await response.text()
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('currentColor')
    expect(svg).not.toMatch(/<script/i)
  })

  test('color=<rrggbb> tints the icon', async ({ request }) => {
    const svg = await (await request.get('/api/icons/svg?name=simple-icons:whatsapp&color=a1b2c3')).text()
    expect(svg).toContain('#a1b2c3')
    expect(svg).not.toContain('currentColor')
    expect((await request.get('/api/icons/svg?name=line-md:github&color=red')).status()).toBe(400)
  })

  test('another set is 400, a missing or hidden icon is 404, a foreign Host is 403', async ({ request }) => {
    expect((await request.get('/api/icons/svg?name=lucide:mail')).status()).toBe(400)
    expect((await request.get('/api/icons/svg')).status()).toBe(400)
    expect((await request.get('/api/icons/svg?name=../../package.json')).status()).toBe(400)
    expect((await request.get('/api/icons/svg?name=line-md:not-an-icon-name')).status()).toBe(404)
    expect((await request.get('/api/icons/svg?name=simple-icons:linkedin')).status()).toBe(404)
    expect((await request.get('/api/icons/svg?name=line-md:github', { headers: { host: 'evil.example' } })).status()).toBe(403)
  })
})

test.describe('POST /api/save', () => {
  const fileNow = () => (existsSync(PERSONAL_PROFILE_PATH) ? readFileSync(PERSONAL_PROFILE_PATH, 'utf8') : null)

  function withIcon(icon: string): Profile {
    const profile = readProfile()
    const target = profile.blocks.findIndex(block => block.type === 'link')
    expect(target, 'the profile needs a link block').toBeGreaterThan(-1)
    return { ...profile, blocks: profile.blocks.map((block, index) => (index === target ? { ...block, icon } : block)) }
  }

  /** The `errors` list of a refused save, one line per problem. */
  async function errorsOf(response: { json: () => Promise<unknown> }): Promise<string> {
    const body = await response.json() as { data?: { errors?: string[] } }
    return (body.data?.errors ?? []).join('\n')
  }

  test('an icon of another set is refused with the two-sets message, and the file stays as it is', async ({ request, baseURL }) => {
    const before = fileNow()
    const response = await request.post('/api/save', { headers: { 'origin': baseURL ?? '', 'sec-fetch-site': 'same-origin' }, data: withIcon('lucide:mail') })
    expect(response.status()).toBe(400)
    const errors = await errorsOf(response)
    expect(errors).toContain('Use an icon from line-md or simple-icons')
    expect(errors).toMatch(/blocks\.\d+\.icon/)
    expect(fileNow()).toBe(before)
  })

  test('a removed brand and a missing icon are refused too, with the two sets in the message', async ({ request, baseURL }) => {
    const before = fileNow()
    for (const icon of ['simple-icons:linkedin', 'line-md:not-an-icon-name']) {
      const response = await request.post('/api/save', { headers: { 'origin': baseURL ?? '', 'sec-fetch-site': 'same-origin' }, data: withIcon(icon) })
      expect(response.status(), icon).toBe(400)
      const errors = await errorsOf(response)
      expect(errors, icon).toContain(`Icon "${icon}"`)
      expect(errors, icon).toContain('https://icones.js.org/collection/line-md')
      expect(errors, icon).toContain('https://icones.js.org/collection/simple-icons')
    }
    expect(fileNow()).toBe(before)
  })
})
