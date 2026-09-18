/**
 * Dev only. The link form in the editor asks: "what does this website say about itself?".
 * Body `{ url, showImage?, force? }`. Answer: the engine's result (content/unfurl.ts),
 * `{ ok: true, title, description, siteName, favicon, image, ... }` with LOCAL file paths,
 * or `{ ok: false, reason }`. A failed read is an answer, not an HTTP error.
 *
 * Guards, because this route makes the machine fetch a URL the caller picks:
 * - 404 outside `nuxt dev`. The engine is loaded only there, so a build never bundles it.
 * - The `Host` header must be localhost, 127.0.0.1 or [::1]: a DNS-rebinding page has another host.
 * - An `Origin` header, when present, must be this same origin: another website cannot POST here (CSRF).
 * - One request per target host at a time: the rest wait in line.
 * The engine itself refuses private and loopback targets (SSRF).
 */
import { z } from 'zod'
import type { UnfurlResult } from '~~/content/unfurl'

const BodySchema = z.object({
  url: z.string().min(1).max(2048),
  showImage: z.boolean().optional(),
  force: z.boolean().optional(),
}).strict()

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** `localhost:3000` -> `localhost`, `[::1]:3000` -> `[::1]`. */
function hostnameOf(hostHeader: string): string {
  return hostHeader.trim().toLowerCase().replace(/:\d+$/, '')
}

/** The running request per target host. The next one for that host starts when it ends. */
const inFlight = new Map<string, Promise<unknown>>()

function queued<T>(host: string, job: () => Promise<T>): Promise<T> {
  const previous = inFlight.get(host) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(job)
  const settled = next.catch(() => undefined).finally(() => {
    if (inFlight.get(host) === settled) inFlight.delete(host)
  })
  inFlight.set(host, settled)
  return next
}

export default defineEventHandler(async (event): Promise<UnfurlResult> => {
  // A build-time constant: in a production build the import below is dead code and is dropped.
  const engine = import.meta.dev ? await import('~~/content/unfurl') : null
  if (!engine) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const host = getRequestHeader(event, 'host') ?? ''
  if (!LOCAL_HOSTS.has(hostnameOf(host))) {
    throw createError({ statusCode: 403, statusMessage: 'The editor API answers on localhost only.' })
  }
  const origin = getRequestHeader(event, 'origin')
  if (origin !== undefined && origin !== `http://${host}` && origin !== `https://${host}`) {
    throw createError({ statusCode: 403, statusMessage: 'Cross-origin requests are refused.' })
  }

  const body = BodySchema.safeParse(await readBody<unknown>(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Send { url, showImage?, force? }.' })

  const key = engine.normalizeUrl(body.data.url)
  if (!key) return { ok: false, reason: 'not a web address (http or https)' }
  const { showImage, force } = body.data
  return queued(new URL(key).hostname, () => engine.unfurl(key, { showImage, force }))
})
