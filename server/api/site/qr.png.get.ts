/**
 * Dev only. "Download PNG" in the Site tab of the editor (WP11): the QR code of
 * `public/site/qr.svg`, drawn again by sharp as a 1024 px PNG. No input, no network.
 * 404 when there is no QR code yet (no site URL). The builder is imported inside
 * the handler, behind the dev check, so sharp never reaches a production build.
 */
import { assertEditorRequest } from '../../utils/editor'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  assertEditorRequest(event, 'none')

  const { qrPng } = await import('~~/content/site-extras')
  const png = await qrPng(1024)
  if (!png) throw createError({ statusCode: 404, statusMessage: 'No QR code yet. Set the site URL, then click Regenerate.' })
  setHeader(event, 'Content-Type', 'image/png')
  setHeader(event, 'Content-Disposition', 'attachment; filename="qr.png"')
  setHeader(event, 'Cache-Control', 'no-store')
  return png
})
