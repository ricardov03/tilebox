/**
 * Shared by the dev-only Pexels routes (`server/api/images/pexels/*`). WP12.
 * The engine (content/pexels.ts) is loaded by each route with `import.meta.dev ? await import(...) : null`,
 * so a production build has no copy of it. Only TYPES are imported here.
 */
import type { PexelsError } from '~~/content/pexels'

/**
 * The owner's key. Nuxt loads `.env` into the environment of `nuxt dev`. It is read here, on the server,
 * on every call. It is not in `runtimeConfig.public`, so no client file can hold it.
 */
export function pexelsKey(): string | undefined {
  return process.env.PEXELS_API_KEY
}

/** A `PexelsError` becomes the HTTP answer of the route: its status and its one line. Anything else is a plain 500. */
export function pexelsFailure(error: unknown, PexelsErrorClass: typeof PexelsError): Error {
  if (error instanceof PexelsErrorClass) {
    return createError({ statusCode: error.status, statusMessage: error.message, data: { reset: error.reset } })
  }
  return createError({ statusCode: 500, statusMessage: 'The Pexels request failed' })
}
