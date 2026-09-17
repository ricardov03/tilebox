/**
 * Dev only. Proxies the Iconify search API so the editor's icon picker
 * can search line-md and simple-icons. 5 s timeout. Returns `{ icons }`.
 */
import { assertDev } from '../../utils/editor'

interface IconifySearch {
  icons?: string[]
}

export default defineEventHandler(async (event) => {
  assertDev()
  const q = String(getQuery(event).q ?? '').trim()
  if (!q) return { icons: [] as string[] }

  const url = new URL('https://api.iconify.design/search')
  url.searchParams.set('query', q)
  url.searchParams.set('limit', '48')
  url.searchParams.set('prefixes', 'line-md,simple-icons')

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) {
      throw createError({ statusCode: 502, statusMessage: `Iconify search answered ${res.status}` })
    }
    const data = (await res.json()) as IconifySearch
    return { icons: (data.icons ?? []).slice(0, 48) }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw createError({ statusCode: 504, statusMessage: 'Iconify search timed out after 5 s' })
    }
    throw error
  }
})
