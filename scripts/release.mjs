#!/usr/bin/env node
/**
 * Local release script. Run with `npm run release`.
 *
 * 1. Preflight: on `main`, clean tree, in sync with origin/main.
 * 2. Checks: lint, typecheck, generate, Playwright (static).
 * 3. Version: commit-and-tag-version --dry-run tells the next version.
 * 4. Summary: a local AI CLI (claude, else grok) drafts a plain-words
 *    summary. You accept, edit, write your own, or skip.
 * 5. Apply: bump package.json + package-lock.json, update CHANGELOG.md,
 *    write releases/vX.Y.Z.md, commit "chore(release): vX.Y.Z", tag vX.Y.Z.
 *
 * Nothing is pushed. Publish with: git push --follow-tags origin main
 *
 * Flags:
 *   --release-as <ver>  force the version (e.g. 1.0.0)
 *   --first-release     no bump; tag the current package.json version
 *   --skip-tests        skip Playwright
 *   --skip-checks       skip the branch and origin sync checks (tree must still be clean)
 *   --summary "<text>"  use this summary, no AI draft
 *   --no-ai             never call an AI CLI
 *   --dry-run           print what would happen, change nothing
 *   --yes               accept the AI draft without asking
 */
import { spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { stdin, stdout } from 'node:process'

const REPO = 'https://github.com/ricardov03/tilebox'
const AI_TIMEOUT_MS = 90_000

const { values: opts } = parseArgs({
  options: {
    'release-as': { type: 'string' },
    'first-release': { type: 'boolean', default: false },
    'skip-tests': { type: 'boolean', default: false },
    'skip-checks': { type: 'boolean', default: false },
    'summary': { type: 'string' },
    'no-ai': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'yes': { type: 'boolean', default: false },
  },
  strict: true,
})

const dryRun = opts['dry-run']

// ---------------------------------------------------------------- helpers

function log(line) {
  stdout.write(`${line}\n`)
}

function step(line) {
  log(`\n==> ${line}`)
}

function fail(message) {
  log(`\nError: ${message}`)
  process.exit(1)
}

/**
 * Run a command, capture output. Returns { ok, out, err, timedOut }.
 * `out` is stdout only (safe to parse). `err` is stderr only (for error messages).
 */
function run(cmd, args, { timeout, input } = {}) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    input: input ?? '',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0' },
  })
  const out = res.stdout ?? ''
  const err = res.error && !res.stderr ? `${res.error.message}\n` : (res.stderr ?? '')
  return { ok: res.status === 0 && !res.error, out, err, timedOut: res.error?.code === 'ETIMEDOUT' }
}

/** stderr first, then stdout. For error messages only. */
function errorText(res) {
  return [res.err, res.out].map(t => t.trim()).filter(Boolean).join('\n')
}

function git(...args) {
  const res = run('git', args)
  return { ok: res.ok, out: res.out.trim(), err: res.err.trim() }
}

/** Run a check command. Print its tail and exit 1 on failure. */
function check(label, cmd, args) {
  const started = Date.now()
  stdout.write(`    ${label} ... `)
  const res = run(cmd, args)
  const secs = ((Date.now() - started) / 1000).toFixed(0)
  if (!res.ok) {
    log(`FAILED (${secs} s)`)
    log(errorText(res).split('\n').slice(-40).join('\n'))
    fail(`${label} failed`)
  }
  log(`ok (${secs} s)`)
}

function findOnPath(name) {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, name)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    }
    catch {
      // not here
    }
  }
  return null
}

function readPackageVersion() {
  return JSON.parse(readFileSync('package.json', 'utf8')).version
}

function versionHeadingRe(version) {
  const v = version.replaceAll('.', '\\.')
  return new RegExp(`^#{2,3} \\[?${v}\\]?[ (]`)
}

const anyVersionHeadingRe = /^#{2,3} \[?\d+\.\d+\.\d+[^ \]]*\]?[ (]/

/** Cut the section of one version out of a changelog text. Drops the heading line. */
function extractSection(changelog, version) {
  const lines = changelog.split('\n')
  const start = lines.findIndex(l => versionHeadingRe(version).test(l))
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (anyVersionHeadingRe.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start + 1, end).join('\n').replace(/^\n+/, '').replace(/\n+$/, '')
}

function releaseFileContent(version, summary, section) {
  const body = section && section.trim() ? section.trim() : '_No changes listed._'
  return [
    `# tilebox v${version}`,
    '',
    '## Summary',
    summary && summary.trim() ? summary.trim() : '_No summary._',
    '',
    '## Changes',
    body,
    '',
    `Full changelog: ${REPO}/blob/v${version}/CHANGELOG.md`,
    '',
  ].join('\n')
}

// ---------------------------------------------------------------- a. preflight

step(`Preflight${dryRun ? ' (dry run)' : ''}`)

const inRepo = git('rev-parse', '--is-inside-work-tree')
if (!inRepo.ok) fail('not inside a git repository')

const branch = git('rev-parse', '--abbrev-ref', 'HEAD').out
if (branch !== 'main') {
  if (opts['skip-checks']) log(`    branch is ${branch}, not main (skipped by --skip-checks)`)
  else fail(`releases start from main. You are on ${branch}.`)
}
else {
  log('    branch: main')
}

const status = git('status', '--porcelain').out
if (status) {
  log(status)
  fail('working tree is not clean. Commit or stash first.')
}
log('    working tree: clean')

if (opts['skip-checks']) {
  log('    origin sync: skipped (--skip-checks)')
}
else {
  stdout.write('    git fetch origin ... ')
  const fetch = git('fetch', 'origin')
  if (!fetch.ok) {
    log('FAILED')
    fail(`git fetch origin failed:\n${errorText(fetch)}`)
  }
  log('ok')
  const local = git('rev-parse', 'HEAD').out
  const remote = git('rev-parse', 'origin/main')
  if (!remote.ok) fail('origin/main not found. Push main first.')
  if (local !== remote.out) fail('local main and origin/main differ. Pull or push first.')
  log('    origin/main: in sync')
}

// ---------------------------------------------------------------- b. checks

step('Checks')
check('npm run lint', 'npm', ['run', 'lint'])
check('npm run typecheck', 'npm', ['run', 'typecheck'])
check('npm run generate', 'npm', ['run', 'generate'])
if (opts['skip-tests']) log('    playwright: skipped (--skip-tests)')
else check('npx playwright test --project=static', 'npx', ['playwright', 'test', '--project=static'])

const afterChecks = git('status', '--porcelain').out
if (afterChecks) {
  log(afterChecks)
  fail('the checks changed tracked files. Commit them first.')
}

// ---------------------------------------------------------------- c. version

step('Version')

const currentVersion = readPackageVersion()
const catvArgs = []
if (opts['first-release']) catvArgs.push('--first-release')
else if (opts['release-as']) catvArgs.push('--release-as', opts['release-as'])

const preview = run('npx', ['commit-and-tag-version', '--dry-run', ...catvArgs])
if (!preview.ok) {
  log(errorText(preview))
  fail('commit-and-tag-version --dry-run failed')
}

let nextVersion = null
const bumpMatch = preview.out.match(/bumping version in package\.json from (\S+) to (\S+)/)
if (opts['first-release']) {
  nextVersion = currentVersion
}
else if (bumpMatch) {
  nextVersion = bumpMatch[2]
}
else {
  const tagMatch = preview.out.match(/tagging release v?(\d+\.\d+\.\d+\S*)/)
  const headMatch = preview.out.split('\n').find(l => anyVersionHeadingRe.test(l))?.match(/\[?(\d+\.\d+\.\d+[^ \]]*)/)
  nextVersion = tagMatch?.[1] ?? headMatch?.[1] ?? null
}
if (!nextVersion) {
  log(errorText(preview))
  fail('could not read the next version from commit-and-tag-version')
}

log(`    Next version: v${nextVersion} (from v${currentVersion})`)

const tagExists = git('rev-parse', '-q', '--verify', `refs/tags/v${nextVersion}`).ok
if (tagExists) fail(`tag v${nextVersion} already exists`)

const lastTag = git('describe', '--tags', '--abbrev=0')
const range = lastTag.ok && lastTag.out ? `${lastTag.out}..HEAD` : 'HEAD'
const commitList = git('log', range, '--format=%s').out.split('\n').filter(Boolean)
log(`    Commits since ${lastTag.ok && lastTag.out ? lastTag.out : 'the first commit'}: ${commitList.length}`)
for (const subject of commitList) log(`      - ${subject}`)
if (commitList.length === 0 && !opts['first-release'] && !opts['release-as']) {
  fail('no commits since the last tag. Nothing to release. Use --release-as to force a version.')
}

/** Changelog section as commit-and-tag-version prints it between --- lines. */
const previewSection = (() => {
  const m = preview.out.match(/\n---\n([\s\S]*?)\n---/)
  if (!m) return null
  return extractSection(m[1], nextVersion) ?? m[1].trim()
})()

// ---------------------------------------------------------------- d. summary

step('Summary')

const releasesDir = 'releases'
const releaseFile = join(releasesDir, `v${nextVersion}.md`)
let summary = null
let keepExistingReleaseFile = false

/** Ask one line. Resolves to null when there is no terminal or stdin closes. */
async function askLine(question) {
  if (!stdin.isTTY) {
    log(`${question}(no terminal)`)
    return null
  }
  const rl = createInterface({ input: stdin, output: stdout })
  const closed = new Promise(resolve => rl.once('close', () => resolve(null)))
  try {
    const answer = await Promise.race([rl.question(question), closed])
    return answer === null ? null : answer.trim()
  }
  finally {
    rl.close()
  }
}

async function readOwnSummary() {
  log('    Type your summary. Finish with an empty line.')
  const lines = []
  for (;;) {
    const line = await askLine('    > ')
    if (line === null || line === '') break
    lines.push(line)
  }
  return lines.join(' ').trim() || null
}

function editInEditor(text) {
  const editor = process.env.VISUAL || process.env.EDITOR || 'nano'
  const file = join(tmpdir(), `tilebox-release-${nextVersion}-${Date.now()}.md`)
  writeFileSync(file, `${text}\n`)
  const res = spawnSync(editor, [file], { stdio: 'inherit', shell: true })
  if (res.status !== 0) {
    log(`    editor exited with ${res.status}; keeping the draft as is`)
    unlinkSync(file)
    return text
  }
  const edited = readFileSync(file, 'utf8').trim()
  unlinkSync(file)
  return edited || null
}

function aiDraft() {
  const prompt = [
    'Write a plain-language summary of this software release for non-developers.',
    '2 to 4 short sentences. Present tense. No headings, no bullet points, no marketing words.',
    'Mention the user-visible changes only.',
    `Release v${nextVersion} of tilebox, a personal link page. Commits:`,
    commitList.map(s => `- ${s}`).join('\n'),
  ].join('\n')

  const claude = findOnPath('claude')
  const grok = claude ? null : findOnPath('grok')
  if (!claude && !grok) return { cli: null, text: null }

  const cli = claude ? 'claude' : 'grok'
  const args = claude
    ? ['-p', prompt, '--output-format', 'text']
    : ['-p', prompt, '--permission-mode', 'dontAsk', '--no-subagents', '--disable-web-search', '--max-turns', '1', '--output-format', 'plain']
  stdout.write(`    drafting with ${cli} (up to ${AI_TIMEOUT_MS / 1000} s) ... `)
  const res = run(claude ?? grok, args, { timeout: AI_TIMEOUT_MS })
  if (res.timedOut) {
    log('timed out')
    return { cli, text: null }
  }
  if (!res.ok) {
    log('failed')
    log(errorText(res).split('\n').slice(-5).map(l => `      ${l}`).join('\n'))
    return { cli, text: null }
  }
  log('ok')
  const text = res.out.trim()
  return { cli, text: text || null }
}

async function chooseSummary(draft) {
  let current = draft
  for (;;) {
    if (current) {
      log('')
      log('    Draft:')
      log(current.split('\n').map(l => `      ${l}`).join('\n'))
      log('')
    }
    if (opts.yes && current) return current
    const answer = (await askLine(current
      ? '    [a]ccept, [e]dit, [w]rite my own, [s]kip summary: '
      : '    [w]rite my own, [s]kip summary: '))?.toLowerCase()
    if (answer === null || answer === undefined) {
      log('    no terminal input. Summary skipped. Use --summary or --yes next time.')
      return current && opts.yes ? current : null
    }
    if (answer === 'a' && current) return current
    if (answer === 's') return null
    if (answer === 'w') {
      current = await readOwnSummary()
      if (current) continue
      return null
    }
    if (answer === 'e' && current) {
      current = editInEditor(current)
      if (current) continue
      return null
    }
  }
}

if (opts['first-release'] && existsSync(releaseFile)) {
  keepExistingReleaseFile = true
  log(`    ${releaseFile} exists. Keeping it. No draft.`)
}
else if (opts.summary !== undefined) {
  summary = opts.summary.trim() || null
  log('    using --summary')
}
else {
  let draft = null
  if (opts['no-ai']) {
    log('    AI draft: off (--no-ai)')
  }
  else {
    const result = aiDraft()
    if (!result.cli) log('    no AI CLI found (claude or grok). Write your own.')
    draft = result.text
  }
  summary = await chooseSummary(draft)
}

if (!keepExistingReleaseFile) log(summary ? '    summary: set' : '    summary: none')

// ---------------------------------------------------------------- e/f. apply or preview

if (dryRun) {
  step('Dry run: nothing changes')
  if (opts['first-release']) log(`    no bump (first release): version stays ${nextVersion}`)
  else log(`    would bump ${currentVersion} -> ${nextVersion} in package.json, package-lock.json`)
  log('    would update CHANGELOG.md')
  if (keepExistingReleaseFile) {
    log(`    would keep ${releaseFile}:`)
    log('')
    log(readFileSync(releaseFile, 'utf8').split('\n').map(l => `    | ${l}`).join('\n'))
  }
  else {
    log(`    would write ${releaseFile}:`)
    log('')
    log(releaseFileContent(nextVersion, summary, previewSection).split('\n').map(l => `    | ${l}`).join('\n'))
  }
  log(`    would commit "chore(release): v${nextVersion}" and tag v${nextVersion}`)
  const dirty = git('status', '--porcelain').out
  if (dirty) {
    log(dirty)
    fail('dry run left changes behind. This is a bug in scripts/release.mjs.')
  }
  log('    working tree: still clean')
  process.exit(0)
}

step('Apply')

stdout.write('    commit-and-tag-version ... ')
const apply = run('npx', ['commit-and-tag-version', ...catvArgs])
if (!apply.ok) {
  log('FAILED')
  log(errorText(apply))
  fail('commit-and-tag-version failed')
}
log('ok')

if (readPackageVersion() !== nextVersion) fail(`package.json says ${readPackageVersion()}, expected ${nextVersion}`)

const changelog = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8') : ''
const section = extractSection(changelog, nextVersion) ?? previewSection

if (keepExistingReleaseFile) {
  log(`    kept ${releaseFile}`)
}
else {
  mkdirSync(releasesDir, { recursive: true })
  writeFileSync(releaseFile, releaseFileContent(nextVersion, summary, section))
  log(`    wrote ${releaseFile}`)
}

const add = git('add', '-A')
if (!add.ok) fail(`git add failed:\n${errorText(add)}`)
const commit = git('commit', '-m', `chore(release): v${nextVersion}`)
if (!commit.ok) fail(`git commit failed:\n${errorText(commit)}`)
log(`    committed: chore(release): v${nextVersion}`)
const tag = git('tag', '-a', `v${nextVersion}`, '-m', `tilebox v${nextVersion}`)
if (!tag.ok) fail(`git tag failed:\n${errorText(tag)}`)
log(`    tagged: v${nextVersion}`)

log('')
log('Done. Review with: git show --stat HEAD. Publish with: git push --follow-tags origin main')
