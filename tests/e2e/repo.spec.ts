/**
 * Repo hygiene. No browser: asks git which files are tracked and checks that
 * the personal ones are not (content/README.md lists them). Runs in the
 * `static` project, so CI and `npm run release` catch a tracked personal file.
 */
import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { ROOT } from './helpers'

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
}

test.describe('personal data stays out of git', () => {
  const tracked = trackedFiles()

  test('content/profile.json is not tracked, the example is', () => {
    expect(tracked).not.toContain('content/profile.json')
    expect(tracked).toContain('content/profile.example.json')
  })

  test('no avatar is tracked', () => {
    expect(tracked.filter(file => /^public\/avatar\./.test(file))).toEqual([])
  })

  test('public/blocks only ships the sample image', () => {
    expect(tracked.filter(file => file.startsWith('public/blocks/'))).toEqual(['public/blocks/sample.jpg'])
  })

  test('fetched favicons and thumbnails are not tracked', () => {
    const generated = tracked.filter(file => /^public\/(icons|thumbs)\//.test(file) && !file.endsWith('/.gitkeep'))
    expect(generated).toEqual([])
  })
})
