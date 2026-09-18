/**
 * Dev only. The folders with fetched and uploaded files (`/icons`, `/thumbs`, `/blocks`, `/site`,
 * `/site-uploads`) get their sandbox CSP and `nosniff` from `routeRules` in nuxt.config.ts, the
 * same headers `public/_headers` gives them on the static host (docs/security.md).
 *
 * One gap is closed here: for a file that does NOT exist, Nitro's dev error handler writes its
 * own `content-security-policy` over the one of the route rule. So a missing file in those folders
 * is answered here, as a plain 404 with the same two headers, before any error handler runs.
 * A file that exists is left to the static handler (the route rule has set its headers already).
 *
 * The built site has no server, so nothing of this file ships.
 */
import { existsSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { ROOT } from '~~/content/resolve'

const UNTRUSTED_PREFIX = /^\/(icons|thumbs|blocks|site|site-uploads)\//
const PUBLIC_DIR = resolve(ROOT, 'public')

function isPublicFile(pathname: string): boolean {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  }
  catch {
    return false
  }
  const file = resolve(PUBLIC_DIR, `.${decoded}`)
  if (!file.startsWith(PUBLIC_DIR + sep)) return false
  try {
    return existsSync(file) && statSync(file).isFile()
  }
  catch {
    return false
  }
}

export default defineEventHandler((event) => {
  if (!import.meta.dev) return
  const pathname = event.path.split('?')[0] ?? ''
  if (!UNTRUSTED_PREFIX.test(pathname) || isPublicFile(pathname)) return
  setResponseStatus(event, 404, 'Not found')
  setResponseHeaders(event, {
    'Content-Security-Policy': 'default-src \'none\'; style-src \'unsafe-inline\'; sandbox',
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache',
  })
  return 'Not found'
})
