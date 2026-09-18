/**
 * Dev only. The link form in the editor asks: "what does this website say about itself?".
 * Body `{ url, showImage?, force? }`. Answer: the engine's result (content/unfurl.ts),
 * `{ ok: true, title, description, siteName, favicon, image, ... }` with LOCAL file paths,
 * or `{ ok: false, reason }`. A failed read is an answer, not an HTTP error.
 *
 * Guards, because this route makes the machine fetch a URL the caller picks:
 * - 404 outside `nuxt dev`. The engine is loaded only there, so a build never bundles it.
 * - `assertEditorRequest()` (server/utils/editor.ts), the same gate as every dev route: `Host` must be
 *   localhost (DNS rebinding), `Origin` must be this origin, `Sec-Fetch-Site` must not be `cross-site`
 *   or `same-site`, and the body must be `application/json` (an HTML form on another website cannot send that): 403 / 415.
 * - One request per target host at a time: the rest wait in line.
 * - A request the editor closed (a newer URL, another block) stops its job in the engine
 *   (`signal`), so the line for that host is free again and nothing is cached.
 *   The engine also ends every job after 20 s in total.
 * The engine itself refuses private and loopback targets (SSRF).
 */
import { z } from 'zod'
import type { UnfurlResult } from '~~/content/unfurl'
import { assertEditorRequest } from '../utils/editor'

const BodySchema = z.object({
  url: z.string().min(1).max(2048),
  showImage: z.boolean().optional(),
  force: z.boolean().optional(),
}).strict()

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

  assertEditorRequest(event, 'json')

  const body = BodySchema.safeParse(await readBody<unknown>(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Send { url, showImage?, force? }.' })

  const key = engine.normalizeUrl(body.data.url)
  if (!key) return { ok: false, reason: 'not a web address (http or https)' }
  const { showImage, force } = body.data

  // `close` before the answer was written = the client went away.
  const controller = new AbortController()
  const res = event.node.res
  res.once('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  return queued(new URL(key).hostname, () => engine.unfurl(key, { showImage, force, signal: controller.signal }))
})
