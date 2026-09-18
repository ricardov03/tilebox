/**
 * The Gravatar download (`fetchGravatar` in content/gravatar.ts). No browser, no network:
 * `globalThis.fetch` is a stub, and the target file lives in a temp folder
 * (`targetFile`), never in `public/`.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { fetchGravatar } from '../../content/gravatar'

const EMAIL = 'someone@tilebox.test'
const OLD_BYTES = 'old picture'
const realFetch = globalThis.fetch

let dir = ''
let target = ''
let calls: string[] = []

function stubFetch(response: () => Response) {
  globalThis.fetch = ((input: RequestInfo | URL) => {
    calls.push(String(input))
    return Promise.resolve(response())
  }) as typeof fetch
}

const notFound = () => new Response('', { status: 404 })
const picture = (type: string, body = 'new picture') => new Response(body, { status: 200, headers: { 'content-type': type } })

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tilebox-gravatar-'))
  target = join(dir, 'avatar.gravatar.jpg')
  writeFileSync(target, OLD_BYTES)
  calls = []
})

test.afterEach(() => {
  globalThis.fetch = realFetch
  rmSync(dir, { recursive: true, force: true })
})

test('404 without allowDelete keeps the old file', async () => {
  stubFetch(notFound)
  const result = await fetchGravatar(EMAIL, { allowDelete: false, targetFile: target })
  expect(result.status).toBe('none')
  expect(readFileSync(target, 'utf8')).toBe(OLD_BYTES)
  expect(calls).toHaveLength(1)
  expect(calls[0]).toContain('https://gravatar.com/avatar/')
})

test('404 with allowDelete removes the stale file', async () => {
  stubFetch(notFound)
  const result = await fetchGravatar(EMAIL, { allowDelete: true, targetFile: target })
  expect(result.status).toBe('none')
  expect(existsSync(target)).toBe(false)
})

test('image/svg+xml is rejected and the old file stays', async () => {
  stubFetch(() => picture('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"/>'))
  const result = await fetchGravatar(EMAIL, { allowDelete: true, targetFile: target })
  expect(result.status).toBe('offline')
  expect(readFileSync(target, 'utf8')).toBe(OLD_BYTES)
  expect(readdirSync(dir)).toEqual(['avatar.gravatar.jpg'])
})

test('a jpeg is written through a tmp file, and no tmp file is left', async () => {
  stubFetch(() => picture('image/jpeg; charset=binary'))
  const result = await fetchGravatar(EMAIL, { allowDelete: false, targetFile: target })
  expect(result.status).toBe('saved')
  expect(readFileSync(target, 'utf8')).toBe('new picture')
  expect(readdirSync(dir)).toEqual(['avatar.gravatar.jpg'])
})

test('a failed write removes the tmp file and keeps the result "offline"', async () => {
  stubFetch(() => picture('image/png'))
  // The folder of the target does not exist: the write fails.
  const result = await fetchGravatar(EMAIL, { allowDelete: false, targetFile: join(dir, 'missing', 'avatar.jpg') })
  expect(result.status).toBe('offline')
  expect(readdirSync(dir)).toEqual(['avatar.gravatar.jpg'])
})
