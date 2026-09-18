/**
 * The head of the public page (WP10b): `<html lang>`, title, description,
 * canonical, Open Graph, X card, robots, favicon links, manifest and JSON-LD.
 * The data is built by the pure `buildHead()` in ~/utils/site-head.ts; this
 * composable only adds the site URL from the runtime config and hands it to unhead.
 *
 * Site URL precedence: `NUXT_PUBLIC_SITE_URL` > `site.url` > unknown.
 * The theme-color and color-scheme metas stay in useTheme.
 */
import { buildHead } from '~/utils/site-head'

export function useSiteHead(): void {
  const { profile } = useProfile()
  const head = buildHead(profile, useRuntimeConfig().public.siteUrl)
  // `SiteHead` is plain data with `string` names. unhead types every meta name and link rel as a literal union.
  useHead(head as Parameters<typeof useHead>[0])
}
