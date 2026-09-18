/**
 * Stand-in for `public/icons/manifest.json` and `public/thumbs/manifest.json`
 * when they do not exist yet (fresh clone, before `npm run fetch:favicons`).
 * nuxt.config.ts points the `#manifest/*` aliases here in that case.
 * Empty map: link tiles fall back to `line-md:link`, video tiles to `bg-photo`.
 */
const EMPTY_MANIFEST: Readonly<Record<string, string>> = {}

export default EMPTY_MANIFEST
