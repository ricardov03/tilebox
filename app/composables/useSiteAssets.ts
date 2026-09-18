/**
 * What the last `POST /api/site/assets` of this editor session made. ONE state for the Site panel
 * ("Regenerate", the uploads) and the QR panel ("Make the QR code"): both buttons call the same route,
 * and the route writes ALL files of `public/site/` (favicons, social image, contact card, QR code).
 * With one stamp per panel, the other panel kept the old `?v=` and showed the old bytes.
 */
export interface SiteAssetsMade {
  version: string
  extras?: { qrUrl: string, messages: string[] }
}

export function useSiteAssets() {
  /** Cache-busting stamp of every preview of `public/site/`. Empty on the first render (no `?v=` in the SSR html). */
  const version = useState<string>('site-assets-version', () => '')
  /** The URL inside `qr.svg`: `null` = not made in this session (unknown), `''` = the route made no QR code. */
  const qrUrl = useState<string | null>('site-assets-qr-url', () => null)

  /** Client only: the first stamp of the session. */
  function touch() {
    if (!version.value) version.value = Date.now().toString(36)
  }

  function made(answer: SiteAssetsMade) {
    version.value = answer.version
    if (answer.extras) qrUrl.value = answer.extras.qrUrl
  }

  const bust = (path: string) => (version.value ? `${path}?v=${version.value}` : path)

  return { version, qrUrl, touch, made, bust }
}
