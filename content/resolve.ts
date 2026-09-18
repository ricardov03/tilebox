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
 * Every entry point (nuxt, npm scripts, nitro, playwright) runs from the repo
 * root, so the paths anchor on `process.cwd()`. No Vue or Nuxt imports here:
 * `scripts/*.ts` run this file with tsx.
 */
import { copyFileSync, existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'

export const ROOT = process.cwd()

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

/** The file resolved when this module loaded. Use in build-time code (nuxt.config.ts, scripts, tests). */
export const PROFILE_PATH = resolveProfilePath()

/** True when `PROFILE_PATH` is `content/profile.json`. */
export const PROFILE_IS_PERSONAL = PROFILE_PATH === PERSONAL_PROFILE_PATH

/** Copies the example to `content/profile.json` when it is missing. Returns the personal path. */
export function ensureProfile(): string {
  if (!hasPersonalProfile()) copyFileSync(EXAMPLE_PROFILE_PATH, PERSONAL_PROFILE_PATH)
  return PERSONAL_PROFILE_PATH
}

/** `content/profile.json (personal)` or `content/profile.example.json (example)`. For log lines. */
export function describeProfile(path: string = resolveProfilePath()): string {
  const kind = path === PERSONAL_PROFILE_PATH ? 'personal' : 'example'
  return `${relative(ROOT, path).split('\\').join('/')} (${kind})`
}
