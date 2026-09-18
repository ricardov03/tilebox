/**
 * Stand-in for `public/thumbs/manifest.json` when it does not exist yet
 * (fresh clone, before `npm run fetch:links`).
 * nuxt.config.ts points the `#manifest/thumbs` alias here in that case.
 * Empty map: video tiles fall back to `bg-photo`.
 */
const EMPTY_MANIFEST: Readonly<Record<string, string>> = {}

export default EMPTY_MANIFEST
