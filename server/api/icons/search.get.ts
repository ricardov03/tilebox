/**
 * Dev only. Proxies the Iconify search API so the editor's icon picker
 * can search line-md and simple-icons. 5 s timeout. Returns `{ icons }`
 * with `line-md:` names first, at most 48.
 */
import { z } from 'zod'
import { assertDev } from '../../utils/editor'

const MAX_QUERY = 64
const LIMIT = 48
const PREFERRED = 'line-md:'

const IconifySearchSchema = z.object({
  icons: z.array(z.string()).default([]),
})

export default defineEventHandler(async (event) => {
  assertDev()
  const q = String(getQuery(event).q ?? '').trim().slice(0, MAX_QUERY)
  if (!q) return { icons: [] as string[] }

  const url = new URL('https://api.iconify.design/search')
  url.searchParams.set('query', q)
  url.searchParams.set('limit', String(LIMIT * 2))
  url.searchParams.set('prefixes', 'line-md,simple-icons')

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) {
      throw createError({ statusCode: 502, statusMessage: `Iconify search answered ${res.status}` })
    }
    const parsed = IconifySearchSchema.safeParse(await res.json())
    if (!parsed.success) {
      throw createError({ statusCode: 502, statusMessage: 'Iconify search returned an unexpected shape' })
    }
    const preferred = parsed.data.icons.filter(name => name.startsWith(PREFERRED))
    const rest = parsed.data.icons.filter(name => !name.startsWith(PREFERRED))
    return { icons: [...preferred, ...rest].slice(0, LIMIT) }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw createError({ statusCode: 504, statusMessage: 'Iconify search timed out after 5 s' })
    }
    throw error
  }
})
