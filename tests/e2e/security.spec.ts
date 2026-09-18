/**
 * The WP10 security round (NOTES.md `## WP10 security round`), the parts that
 * need no browser and no dev server. Runs in the `static` project, after
 * `npm run generate`. The engine's own cases are in unfurl.spec.ts.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { ROOT } from './helpers'

const UNTRUSTED_DIRS = ['icons', 'thumbs', 'blocks', 'site', 'site-uploads']
const ASSET_CSP = 'default-src \'none\'; style-src \'unsafe-inline\'; sandbox'

/** `_headers` -> { path -> { header -> value } }. The format of Cloudflare Pages and Netlify. */
function parseHeadersFile(text: string): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>()
  let current: Record<string, string> | null = null
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      current = {}
      rules.set(line.trim(), current)
      continue
    }
    const at = line.indexOf(':')
    if (current && at > 0) current[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim()
  }
  return rules
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)])
}

test.describe('S1b: response headers for the static host', () => {
  test('public/_headers is tracked and lands in dist/ unchanged', () => {
    const tracked = execFileSync('git', ['ls-files', 'public/_headers'], { cwd: ROOT, encoding: 'utf8' }).trim()
    expect(tracked).toBe('public/_headers')
    expect(existsSync(resolve(ROOT, 'dist/_headers'))).toBe(true)
    expect(readFileSync(resolve(ROOT, 'dist/_headers'), 'utf8')).toBe(readFileSync(resolve(ROOT, 'public/_headers'), 'utf8'))
  })

  test('every folder with fetched or uploaded files gets the sandbox CSP and nosniff, every path gets nosniff and a referrer policy', () => {
    const rules = parseHeadersFile(readFileSync(resolve(ROOT, 'dist/_headers'), 'utf8'))
    for (const dir of UNTRUSTED_DIRS) {
      expect(rules.get(`/${dir}/*`), dir).toEqual({ 'content-security-policy': ASSET_CSP, 'x-content-type-options': 'nosniff' })
    }
    expect(rules.get('/*')).toEqual({ 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' })
  })

  test('netlify.toml keeps the cache headers and sets no header that _headers sets', () => {
    const toml = readFileSync(resolve(ROOT, 'netlify.toml'), 'utf8').split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')
    expect(toml).toContain('for = "/_nuxt/*"')
    expect(toml).toContain('for = "/_fonts/*"')
    expect(toml).not.toMatch(/X-Content-Type-Options|Referrer-Policy|Content-Security-Policy/i)
  })

  test('nuxt.config.ts sets the same CSP for the same folders in dev', () => {
    const config = readFileSync(resolve(ROOT, 'nuxt.config.ts'), 'utf8')
    expect(config).toContain(`[${UNTRUSTED_DIRS.map(dir => `'${dir}'`).join(', ')}]`)
    expect(config.replaceAll('\\\'', '\'')).toContain(ASSET_CSP)
  })
})

test.describe('S1: the built site has no fetched SVG', () => {
  test('dist/icons holds no .svg file, and dist/site only the icon.svg this repo draws itself', () => {
    expect(filesUnder(resolve(ROOT, 'dist/icons')).filter(file => file.endsWith('.svg'))).toEqual([])
    expect(filesUnder(resolve(ROOT, 'dist/site-uploads')).filter(file => file.endsWith('.svg'))).toEqual([])
    const siteSvgs = filesUnder(resolve(ROOT, 'dist/site')).filter(file => file.endsWith('.svg'))
    for (const file of siteSvgs) {
      expect(file.endsWith('/icon.svg')).toBe(true)
      // The initials tile: outlines and one <style>, nothing that can run.
      expect(readFileSync(file, 'utf8')).not.toMatch(/script|href|foreignObject|\son\w+=/i)
    }
  })
})
