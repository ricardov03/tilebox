/**
 * Tiny static server for `dist/` (the `nuxt generate` output). Used by the
 * Playwright `static` project and by Lighthouse. No dependencies.
 * `node scripts/serve-dist.mjs [port]`, default port 4173.
 */
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'

const ROOT = resolve(process.cwd(), 'dist')
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4173)
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

/** First existing file among `path`, `path/index.html`, `path.html`, else `404.html`. */
function fileFor(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  const base = join(ROOT, clean)
  if (!base.startsWith(ROOT)) return { file: join(ROOT, '404.html'), status: 404 }
  for (const candidate of [base, join(base, 'index.html'), `${base}.html`]) {
    try {
      if (statSync(candidate).isFile()) return { file: candidate, status: 200 }
    }
    catch {
      // try the next candidate
    }
  }
  return { file: join(ROOT, '404.html'), status: 404 }
}

createServer((req, res) => {
  const { file, status } = fileFor(new URL(req.url ?? '/', 'http://localhost').pathname)
  res.writeHead(status, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).on('error', () => res.end()).pipe(res)
}).listen(PORT, () => {
  process.stdout.write(`serving ${ROOT} on http://localhost:${PORT}\n`)
})
