/**
 * Which profile file the build, the scripts, the dev server and the tests use.
 * One resolver for every entry point, so they never disagree.
 *
 * - `content/profile.json`         your document. Ignored by git. Never shipped.
 * - `content/profile.example.json` the tracked sample. GitHub CI and releases build it.
 *
 * Rule: read the personal file when it exists, else the example.
 * The editor's save route always writes the personal file (see `PERSONAL_PROFILE_PATH`).
 *
 * The paths anchor on this file's location (`content/`), not on `process.cwd()`,
 * so every entry point (nuxt, npm scripts, nitro, playwright) resolves the same
 * files from any working directory. No Vue or Nuxt imports here:
 * `scripts/*.ts` run this file with tsx.
 */
import { copyFileSync, existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repo root: the parent of this file's folder. */
export const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

/** Your file. Created by `npm run dev` (predev) from the example when missing. */
export const PERSONAL_PROFILE_PATH = resolve(ROOT, 'content/profile.json')

/** The sample that ships with the repo. */
export const EXAMPLE_PROFILE_PATH = resolve(ROOT, 'content/profile.example.json')

export function hasPersonalProfile(): boolean {
  return existsSync(PERSONAL_PROFILE_PATH)
}

/** Personal file when present, else the example. Checked on every call. */
export function resolveProfilePath(): string {
  return hasPersonalProfile() ? PERSONAL_PROFILE_PATH : EXAMPLE_PROFILE_PATH
}

/**
 * The profile file to read right now. Same as `resolveProfilePath()`, named for
 * build-time code (nuxt.config.ts, scripts, tests). A function, not a constant:
 * a call after `ensureProfile()` sees the personal file.
 */
export function profilePath(): string {
  return resolveProfilePath()
}

/** True when `profilePath()` is `content/profile.json`. Checked on every call. */
export function profileIsPersonal(): boolean {
  return hasPersonalProfile()
}

/**
 * Copies the example to `content/profile.json` when it is missing. Returns the personal path.
 * Throws one clear line, with both paths, when the example is missing or the copy fails.
 */
export function ensureProfile(): string {
  if (hasPersonalProfile()) return PERSONAL_PROFILE_PATH
  if (!existsSync(EXAMPLE_PROFILE_PATH)) {
    throw new Error(`Cannot create ${PERSONAL_PROFILE_PATH}: the example ${EXAMPLE_PROFILE_PATH} does not exist.`)
  }
  try {
    copyFileSync(EXAMPLE_PROFILE_PATH, PERSONAL_PROFILE_PATH)
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Cannot copy ${EXAMPLE_PROFILE_PATH} to ${PERSONAL_PROFILE_PATH}: ${reason}`)
  }
  return PERSONAL_PROFILE_PATH
}

/** `content/profile.json (personal)` or `content/profile.example.json (example)`. For log lines. */
export function describeProfile(path: string = resolveProfilePath()): string {
  const kind = path === PERSONAL_PROFILE_PATH ? 'personal' : 'example'
  return `${relative(ROOT, path).split('\\').join('/')} (${kind})`
}
