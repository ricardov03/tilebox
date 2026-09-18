#!/usr/bin/env node
/**
 * Local release script. Run with `npm run release`.
 *
 * 1. Preflight: on `main`, clean tree, no personal data tracked, in sync with origin/main.
 * 2. Checks: lint, typecheck, generate, Playwright (static).
 * 3. Version: commit-and-tag-version --dry-run tells the next version.
 * 4. Summary: a local AI CLI (claude, else grok) drafts a plain-words
 *    summary. You accept, edit, write your own, or skip.
 * 5. Apply: bump package.json + package-lock.json, update CHANGELOG.md,
 *    write releases/vX.Y.Z.md, commit "chore(release): vX.Y.Z", tag vX.Y.Z.
 * 6. Publish (optional): push main and the tag, then make the GitHub Release
 *    with the `gh` CLI (title + releases/vX.Y.Z.md as the body). In a terminal
 *    the script asks first. Without a terminal, or with --yes, it does not push.
 *
 * The zip and the checksum come from the pipeline only
 * (.github/workflows/release.yml). This script NEVER uploads a local build:
 * a local dist/ holds your personal profile (content/profile.json, your images).
 * The pipeline builds from the repo, which has the sample content only.
 *
 * Repair a release (the tag exists, but no GitHub Release, or the pipeline failed):
 *   npm run release:publish -- v0.1.0   (= node scripts/release.mjs --publish-only v0.1.0)
 *
 * Every external command (git, gh, npm, npx) is found through PATH. There is
 * no other hook. A test puts a fake `gh` first on PATH.
 *
 * Flags:
 *   --release-as <ver>  force the version (e.g. 1.0.0)
 *   --first-release     no bump; tag the current package.json version
 *   --skip-tests        skip Playwright
 *   --skip-checks       skip the branch and origin sync checks (tree must still be clean)
 *   --summary "<text>"  use this summary, no AI draft
 *   --no-ai             never call an AI CLI
 *   --dry-run           print what would happen, change nothing
 *   --yes               accept the AI draft without asking (does not push: add --push)
 *   --push              after the tag: push and make the GitHub Release, do not ask
 *   --no-push           never push, never ask. Print the manual commands.
 *                       With --publish-only: skip the push, do the gh steps only.
 *   --watch             after the publish: wait for the release pipeline (gh run watch)
 *   --publish-only <tag>  no version bump. The publish steps for a tag that exists locally.
 */
import { spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { stdin, stdout } from 'node:process'

const FALLBACK_REPO = 'https://github.com/ricardov03/tilebox'
const AI_TIMEOUT_MS = 90_000

/** parseArgs, but a wrong flag gives one clear line, not a stack trace. */
function parseCli(config) {
  try {
    return parseArgs(config)
  }
  catch (error) {
    stdout.write(`\nError: ${error.message}\n`)
    stdout.write('Usage: npm run release -- [flags]   or   npm run release:publish -- vX.Y.Z\n')
    process.exit(1)
  }
}

const { values: opts } = parseCli({
  options: {
    'release-as': { type: 'string' },
    'first-release': { type: 'boolean', default: false },
    'skip-tests': { type: 'boolean', default: false },
    'skip-checks': { type: 'boolean', default: false },
    'summary': { type: 'string' },
    'no-ai': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'yes': { type: 'boolean', default: false },
    'push': { type: 'boolean', default: false },
    'no-push': { type: 'boolean', default: false },
    'watch': { type: 'boolean', default: false },
    'publish-only': { type: 'string' },
  },
  strict: true,
})

const dryRun = opts['dry-run']
const VERSION_TAG_RE = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const PIPELINE_WAIT_MS = 30_000

// On Windows, npm and npx are .cmd files. Node refuses to spawn a .cmd file
// without a shell (EINVAL), so those two run through the shell there.
const isWindows = process.platform === 'win32'
const SHELL_COMMANDS = new Set(['npm', 'npx'])

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
    shell: isWindows && SHELL_COMMANDS.has(cmd),
  })
  const out = (res.stdout ?? '').replaceAll('\r\n', '\n')
  const err = res.error && !res.stderr ? `${res.error.message}\n` : (res.stderr ?? '').replaceAll('\r\n', '\n')
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

/**
 * Turn a git remote URL into a browser URL.
 * git@github.com:owner/repo.git and https://github.com/owner/repo.git
 * both become https://github.com/owner/repo. Returns null when unsure.
 */
function repoUrlFromRemote(remote) {
  const m = remote.trim().match(/^(?:git@|ssh:\/\/git@|https?:\/\/)([^/:]+)[/:](.+?)(?:\.git)?\/?$/)
  if (!m) return null
  return `https://${m[1]}/${m[2]}`
}

/** Repository URL from remote.origin.url, else the hardcoded fallback. */
function repoUrl() {
  const remote = git('config', '--get', 'remote.origin.url')
  return (remote.ok && repoUrlFromRemote(remote.out)) || FALLBACK_REPO
}

const REPO = repoUrl()

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
  const names = isWindows ? [name, `${name}.exe`] : [name]
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    for (const file of names) {
      const candidate = join(dir, file)
      try {
        accessSync(candidate, constants.X_OK)
        return candidate
      }
      catch {
        // not here
      }
    }
  }
  return null
}

/** Run a command with the terminal attached, so the user sees its progress. */
function runLive(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: isWindows && SHELL_COMMANDS.has(cmd) })
  return { ok: res.status === 0 && !res.error }
}

/** A command line as the user would type it. For logs only. */
function shown(cmd, args) {
  return [cmd, ...args].map(arg => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `"${arg.replaceAll('"', '\\"')}"`)).join(' ')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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

/** Yes only on "y" or "yes". No terminal means no. */
async function askYesNo(question) {
  if (!stdin.isTTY) return false
  const answer = (await askLine(question))?.toLowerCase()
  return answer === 'y' || answer === 'yes'
}

function readPackageVersion() {
  return JSON.parse(readFileSync('package.json', 'utf8')).version
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function versionHeadingRe(version) {
  return new RegExp(`^#{2,3} \\[?${escapeRegExp(version)}\\]?[ (]`)
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

// ---------------------------------------------------------------- publish (push + GitHub Release)
//
// NEVER upload a locally built zip from here. A local dist/ is built from your
// content/profile.json and your images, so it holds personal data. The zip and
// the checksum come from the pipeline only: it builds from the repo (sample content).

function publishCommands(tag) {
  const notes = `releases/${tag}.md`
  const title = `tilebox ${tag}`
  const create = ['release', 'create', tag, '--title', title, '--notes-file', notes, '--verify-tag']
  // A version with "-" (1.0.0-beta.1) is a prerelease. Same rule as the pipeline.
  if (tag.includes('-')) create.push('--prerelease')
  return {
    push: ['push', '--follow-tags', 'origin', 'main'],
    auth: ['auth', 'status'],
    view: ['release', 'view', tag],
    edit: ['release', 'edit', tag, '--title', title, '--notes-file', notes],
    create,
    url: ['release', 'view', tag, '--json', 'url', '--jq', '.url'],
    runList: ['run', 'list', '--workflow=release.yml', '--branch', tag, '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId'],
  }
}

function logCommand(cmd, args) {
  log(`    $ ${shown(cmd, args)}`)
}

function printManualCommands(tag) {
  const cmds = publishCommands(tag)
  log('')
  log('Nothing was pushed. Publish with:')
  log(`  ${shown('git', cmds.push)}`)
  log(`  ${shown('gh', cmds.create)}`)
  log(`Or do both with: npm run release:publish -- ${tag}`)
  log('The tag push starts the pipeline. It adds the zip and the checksum to the release.')
  log('Without gh, the pipeline makes the release itself.')
}

function printGhHint(tag, reason) {
  const cmds = publishCommands(tag)
  log('')
  log(`    ${reason} The GitHub Release was not made from here.`)
  log('    Install and log in (one time):')
  log('      brew install gh        (other systems: https://cli.github.com)')
  log('      gh auth login')
  log('    Then make the release yourself:')
  log(`      ${shown('gh', cmds.create)}`)
  log(`    Or run: npm run release:publish -- ${tag} --no-push`)
  log('    This is not an error: the pipeline makes the release too when it is missing.')
}

/** Find the pipeline run of the tag, wait for it, and say what to do when it fails. */
async function watchPipeline(tag) {
  const cmds = publishCommands(tag)
  logCommand('gh', cmds.runList)
  const deadline = Date.now() + PIPELINE_WAIT_MS
  let runId = null
  for (;;) {
    const res = run('gh', cmds.runList)
    const out = res.out.trim()
    if (res.ok && /^\d+$/.test(out)) {
      runId = out
      break
    }
    if (Date.now() >= deadline) break
    await sleep(3000)
  }
  if (!runId) {
    log(`    no pipeline run for ${tag} after ${PIPELINE_WAIT_MS / 1000} s.`)
    log(`    Look later with: gh run list --workflow=release.yml`)
    log(`    Start it by hand with: gh workflow run release.yml -f tag=${tag}`)
    return
  }
  const watchArgs = ['run', 'watch', runId, '--exit-status']
  logCommand('gh', watchArgs)
  if (runLive('gh', watchArgs).ok) {
    log(`    pipeline: ok. tilebox-${tag}.zip and tilebox-${tag}.sha256 are on the release.`)
    return
  }
  log('')
  log('    pipeline: FAILED. The release has no zip yet. Next step:')
  log(`      gh run view ${runId} --log-failed`)
  log('    After the fix is on main, run the pipeline again for the same tag:')
  log(`      gh workflow run release.yml -f tag=${tag}`)
  process.exitCode = 1
}

/** Dry run: print every command of the publish steps. Run none. */
function printPublishPlan(tag, { push }) {
  const cmds = publishCommands(tag)
  if (push) log(`    1. would run: ${shown('git', cmds.push)}`)
  else log('    1. push: skipped (--no-push). The tag must be on GitHub already.')
  log(`    2. would run: ${shown('gh', cmds.auth)}  (gh missing or not logged in: print a hint, stop, exit 0)`)
  log(`    3. would run: ${shown('gh', cmds.view)}`)
  log(`         release exists:  ${shown('gh', cmds.edit)}`)
  log(`         no release yet:  ${shown('gh', cmds.create)}`)
  log(`    4. would run: ${shown('gh', cmds.url)}`)
  if (opts.watch) {
    log(`    5. would run: ${shown('gh', cmds.runList)}  (retry up to ${PIPELINE_WAIT_MS / 1000} s)`)
    log('       would run: gh run watch <id> --exit-status')
  }
  else {
    log('    5. would offer to watch the pipeline (--watch does it without asking)')
  }
  log('    never uploads a local zip: the pipeline builds and attaches it')
}

/**
 * The publish steps for a tag that exists locally. Each command is logged before it runs.
 * `push: false` skips step 1 (the tag is on GitHub already).
 */
async function publish(tag, { push }) {
  const cmds = publishCommands(tag)
  step(`Publish ${tag}${dryRun ? ' (dry run: no command runs)' : ''}`)
  if (dryRun) {
    printPublishPlan(tag, { push })
    return
  }

  // 1. push main and the tag. The tag push starts the pipeline.
  if (push) {
    logCommand('git', cmds.push)
    if (!runLive('git', cmds.push).ok) {
      fail(`git push failed. Nothing is on GitHub. Fix it, then run: npm run release:publish -- ${tag}`)
    }
  }
  else {
    log('    push: skipped (--no-push). The tag must be on GitHub already.')
  }

  // 2. gh is optional. Without it the pipeline still makes the release.
  if (!findOnPath('gh')) {
    printGhHint(tag, 'The gh CLI is not on PATH.')
    return
  }
  logCommand('gh', cmds.auth)
  const auth = run('gh', cmds.auth)
  if (!auth.ok) {
    log(errorText(auth).split('\n').slice(0, 5).map(l => `      ${l}`).join('\n'))
    printGhHint(tag, 'The gh CLI is not logged in.')
    return
  }

  // 3. update the release when it exists (an earlier run, or the pipeline), else create it.
  logCommand('gh', cmds.view)
  const exists = run('gh', cmds.view).ok
  const action = exists ? cmds.edit : cmds.create
  log(exists ? '    release exists: update the title and the body' : '    no release yet: create it')
  logCommand('gh', action)
  const made = run('gh', action)
  if (!made.ok) {
    log(errorText(made).split('\n').slice(-10).map(l => `      ${l}`).join('\n'))
    fail(`gh release ${exists ? 'edit' : 'create'} failed. The pipeline still makes the release when it is missing.\n`
      + `Try again with: npm run release:publish -- ${tag} --no-push`)
  }

  // 4. the URL
  logCommand('gh', cmds.url)
  const url = run('gh', cmds.url)
  log(`    GitHub Release: ${url.ok && url.out.trim() ? url.out.trim() : `${REPO}/releases/tag/${tag}`}`)

  // 5. the assets come later, from the pipeline
  log(`    The pipeline attaches tilebox-${tag}.zip and tilebox-${tag}.sha256 in a few minutes.`)
  const watch = opts.watch || (!opts.yes && await askYesNo('    Watch the pipeline now? [y/N] '))
  if (watch) await watchPipeline(tag)
  else log('    Watch it with: gh run watch   (or pass --watch next time)')
}

// ---------------------------------------------------------------- publish only (no version bump)

if (opts.push && opts['no-push']) fail('--push and --no-push do not go together.')

if (opts['publish-only'] !== undefined) {
  const raw = opts['publish-only'].trim()
  const tag = raw.startsWith('v') ? raw : `v${raw}`
  step(`Publish only: ${raw}`)
  if (!VERSION_TAG_RE.test(tag)) fail(`"${raw}" is not a version tag. Use the form v1.2.3 or v1.2.3-beta.1.`)
  if (!git('rev-parse', '--is-inside-work-tree').ok) fail('not inside a git repository')
  if (!git('rev-parse', '-q', '--verify', `refs/tags/${tag}`).ok) {
    fail(`tag ${tag} does not exist locally. Make it with "npm run release", or get it with "git fetch --tags origin".`)
  }
  log(`    tag ${tag}: exists locally`)
  if (!existsSync(join('releases', `${tag}.md`))) {
    fail(`releases/${tag}.md is missing. It is the body of the GitHub Release. Get it with: git checkout ${tag} -- releases/${tag}.md`)
  }
  log(`    releases/${tag}.md: found`)
  await publish(tag, { push: !opts['no-push'] })
  process.exit(process.exitCode ?? 0)
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

// Personal data never ships in a release. content/README.md lists these files.
// A tracked personal file means the ignore rules were bypassed (git add -f).
const personalTracked = git('ls-files', '--error-unmatch', 'content/profile.json')
if (personalTracked.ok) {
  fail('content/profile.json is tracked by git. It is your personal file and must stay out of the repo.\n'
    + 'Run: git rm --cached content/profile.json && git commit -m "chore(content): untrack the personal profile"')
}
const trackedImages = git('ls-files', 'public/blocks', 'public/avatar.*').out.split('\n').filter(Boolean)
const strayImages = trackedImages.filter(file => file !== 'public/blocks/sample.jpg')
if (strayImages.length > 0) {
  log(strayImages.map(file => `      ${file}`).join('\n'))
  fail('personal images are tracked by git (only public/blocks/sample.jpg may be). Run: git rm --cached <file>')
}
log('    personal data: not tracked')

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
if (opts['skip-tests']) {
  log('    playwright: skipped (--skip-tests)')
}
else {
  // Fast no-op when the browser is already installed. Saves a first local release.
  check('npx playwright install chromium', 'npx', ['playwright', 'install', 'chromium'])
  check('npx playwright test --project=static', 'npx', ['playwright', 'test', '--project=static'])
}

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

  const dryTag = `v${nextVersion}`
  if (opts['no-push']) {
    step(`Publish ${dryTag} (dry run)`)
    log('    would not push (--no-push). Would print the manual commands:')
    printManualCommands(dryTag)
  }
  else {
    if (opts.push) log('\n    --push: would publish without asking')
    else if (opts.yes || !stdin.isTTY) log('\n    no --push (and --yes or no terminal): would NOT push. With --push the steps are:')
    else log('\n    would ask: Push main and the tag, and create the GitHub Release now? [y/N]. On yes:')
    await publish(dryTag, { push: true })
  }
  process.exit(0)
}

step('Apply')

const existingTag = git('tag', '-l', `v${nextVersion}`)
if (!existingTag.ok) fail(`git tag -l failed:\n${errorText(existingTag)}`)
if (existingTag.out) fail(`tag v${nextVersion} already exists. Nothing was changed.`)

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
if (!tag.ok) {
  log(`git tag failed:\n${errorText(tag)}`)
  log('')
  log(`    The release commit "chore(release): v${nextVersion}" is in place but has no tag.`)
  log('    To undo the commit and keep the release files staged, run:')
  log('      git reset --soft HEAD~1')
  log(`    Or make the tag yourself: git tag -a v${nextVersion} -m "tilebox v${nextVersion}"`)
  fail(`tag v${nextVersion} was not created`)
}
log(`    tagged: v${nextVersion}`)

log('')
log('Done. The commit and the tag are local. Review with: git show --stat HEAD')

// ---------------------------------------------------------------- g. publish (optional)

const newTag = `v${nextVersion}`

/** --push: yes. --no-push: no. --yes or no terminal: no (safe default). Else ask. */
async function decidePush() {
  if (opts.push) return true
  if (opts['no-push']) return false
  if (opts.yes || !stdin.isTTY) {
    log(`\n${opts.yes ? '--yes' : 'No terminal'} without --push: not pushing.`)
    return false
  }
  log('')
  return askYesNo('Push main and the tag, and create the GitHub Release now? [y/N] ')
}

if (await decidePush()) await publish(newTag, { push: true })
else printManualCommands(newTag)
