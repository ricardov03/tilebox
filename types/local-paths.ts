/**
 * The two public paths the link preview engine (content/unfurl.ts) may write.
 * ONE place for both patterns: the profile contract (./profile.ts), the tile
 * (app/components/blocks/media.ts) and the cache reader (content/unfurl-cache.ts)
 * all use them. No imports, so the public page can load this file too.
 *
 * Icons are PNG only. The engine draws every fetched icon again as a PNG; a
 * remote SVG (or any other remote file as it came) is never stored, because a
 * file under `/icons/` is served from the site's own origin.
 */

/** `/icons/<hash>.png` */
export const LOCAL_ICON_PATH = /^\/icons\/[a-z0-9]+\.png$/
/** `/thumbs/<hash>.webp` */
export const LOCAL_THUMB_PATH = /^\/thumbs\/[a-z0-9]+\.webp$/
