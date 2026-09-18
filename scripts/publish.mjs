#!/usr/bin/env node
/**
 * Publish the page from your machine. Run with `npm run publish`.
 *
 * First run:  pick a provider (Cloudflare Pages or Netlify), log in with the
 *             browser, pick a site name, check the free subdomain is not taken,
 *             create the project, build, upload, print the live URL, and save
 *             the choices in .tilebox/publish.json.
 * Later runs: build, upload, print the live URL.
 *
 * No API key or token is ever stored by this script. The provider CLIs keep
 * their own login in your home folder.
 *
 * Flags:
 *   --provider cloudflare|netlify  skip the provider prompt
 *   --name <site-name>             skip the name prompt
 *   --account <id-or-slug>         Cloudflare account id or Netlify team slug (when you have more than one)
 *   --preview                      upload to a preview URL, not production
 *   --site-url <https://...>       NUXT_PUBLIC_SITE_URL for the build (default: the saved live URL)
 *   --no-build                     skip `npm run generate`, upload dist/ as it is
 *   --yes                          never ask; fail when an answer is needed
 *   --reset                        forget .tilebox/publish.json and set up again
 *   --help                         print this help
 *
 * Exit codes: 0 ok, 1 error, 2 usage.
 */
import { spawnSync } from 'node:child_process'
import { promises as dns } from 'node:dns'
import { accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { request as httpsRequest } from 'node:https'
import { basename, delimiter, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { stdin, stdout } from 'node:process'

const STATE_DIR = '.tilebox'
const STATE_FILE = join(STATE_DIR, 'publish.json')
const WRANGLER_OUT = join(STATE_DIR, 'wrangler-out.ndjson')
const DIST = 'dist'

// Same rule as content/resolve.ts: the personal file when it exists, else the
// example. Anchored on this file, not on the working directory, like the resolver.
const PERSONAL_PROFILE = fileURLToPath(new URL('../content/profile.json', import.meta.url))

const CHECK_TIMEOUT_MS = 30_000
const LOGIN_TIMEOUT_MS = 600_000
const BUILD_TIMEOUT_MS = 600_000
const DEPLOY_TIMEOUT_MS = 600_000

const MAX_FILES = 20_000
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_NAME_LENGTH = 37

/** The site URL of a build. https only: both providers serve https, and the canonical and OG tags use it. */
const HTTPS_URL = /^https:\/\/[^\s/]+\S*$/

const PROVIDERS = {
  cloudflare: { label: 'Cloudflare Pages', domain: 'pages.dev', cli: 'wrangler', dashboard: 'Cloudflare dashboard > Workers & Pages > your project > Custom domains' },
  netlify: { label: 'Netlify', domain: 'netlify.app', cli: 'netlify', dashboard: 'Netlify dashboard > your site > Domain management' },
}

const USAGE = `Usage: npm run publish [-- flags]

Publishes the page to Cloudflare Pages or Netlify from this machine.
The first run asks for the provider and a site name, logs you in with the
browser and creates the project. Later runs only build and upload.

Flags:
  --provider cloudflare|netlify  skip the provider prompt
  --name <site-name>             skip the name prompt (lowercase letters, digits, dashes; max ${MAX_NAME_LENGTH})
  --account <id-or-slug>         Cloudflare account id or Netlify team slug (when you have more than one)
  --preview                      upload to a preview URL, not production
  --site-url <https://...>       NUXT_PUBLIC_SITE_URL for the build (default: the saved live URL)
  --no-build                     skip \`npm run generate\`, upload dist/ as it is
  --yes                          never ask; fail when an answer is needed
  --reset                        forget ${STATE_FILE} and set up again
  --help                         print this help

Saved choices live in ${STATE_FILE}. No token or API key is ever stored there.
Exit codes: 0 ok, 1 error, 2 usage.`

// On Windows, npm and the CLI wrappers are .cmd files. Node refuses to spawn a
// .cmd file without a shell (EINVAL), so those run through the shell there.
const isWindows = process.platform === 'win32'

// ---------------------------------------------------------------- helpers

function log(line = '') {
  stdout.write(`${line}\n`)
}

function step(line) {
  log(`\n==> ${line}`)
}

class PublishError extends Error {
  constructor(message, code = 1) {
    super(message)
    this.code = code
  }
}

function fail(message, code = 1) {
  throw new PublishError(message, code)
}

function usageError(message) {
  fail(`${message}\nHelp: npm run publish -- --help`, 2)
}

const interactive = Boolean(stdin.isTTY)

/** Ask one line. Resolves to null when there is no terminal or stdin closes. */
async function askLine(question) {
  if (!interactive) {
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

function shellQuote(value) {
  return /^[\w./:=@-]+$/.test(value) ? value : `'${value.replaceAll('\'', '\'\\\'\'')}'`
}

/** Print the command as the user could type it. Every external command goes through here. */
function announce(cmd, args, env = {}) {
  const prefix = Object.entries(env).map(([k, v]) => `${k}=${shellQuote(v)}`)
  log(`    $ ${[...prefix, basename(cmd), ...args.map(shellQuote)].join(' ')}`)
}

/**
 * Run a command. Returns { ok, out, err, timedOut, status }.
 * `inherit: true` shows the child output live (out and err are then empty).
 * `stdio` overrides the whole stdio setting.
 */
function run(cmd, args, { timeout, env = {}, inherit = false, stdio } = {}) {
  announce(cmd, args, env)
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: stdio ?? (inherit ? 'inherit' : ['ignore', 'pipe', 'pipe']),
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...(inherit ? {} : { FORCE_COLOR: '0' }), ...env },
    shell: isWindows && cmd.endsWith('.cmd'),
  })
  const out = (res.stdout ?? '').replaceAll('\r\n', '\n')
  const err = res.error && !res.stderr ? `${res.error.message}\n` : (res.stderr ?? '').replaceAll('\r\n', '\n')
  return {
    ok: res.status === 0 && !res.error,
    out,
    err,
    status: res.status,
    timedOut: res.error?.code === 'ETIMEDOUT',
  }
}

/** stderr first, then stdout. For error messages only. */
function errorText(res) {
  return [res.err, res.out].map(t => t.trim()).filter(Boolean).join('\n')
}

function findOnPath(name) {
  const names = isWindows ? [`${name}.cmd`, `${name}.exe`, name] : [name]
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    for (const candidate of names.map(n => join(dir, n))) {
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

const cliCache = new Map()

/**
 * Path of a CLI binary. PATH first (so a wrapper can override), then the
 * version installed in node_modules/.bin.
 */
function cli(name) {
  if (cliCache.has(name)) return cliCache.get(name)
  const local = join('node_modules', '.bin', isWindows ? `${name}.cmd` : name)
  const found = findOnPath(name) ?? (existsSync(local) ? local : null)
  if (!found) fail(`${name} was not found. Run: npm install`)
  log(`    using ${found}`)
  cliCache.set(name, found)
  return found
}

function npmCli() {
  return isWindows ? 'npm.cmd' : 'npm'
}

/** Parse the first JSON value in a text. Returns null when there is none. */
function parseJson(text) {
  const start = Math.min(...['{', '['].map(c => text.indexOf(c)).filter(i => i !== -1))
  if (!Number.isFinite(start)) return null
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  try {
    return JSON.parse(text.slice(start, end + 1))
  }
  catch {
    return null
  }
}

/** Why a name is not allowed, or null when it is fine. */
function nameProblem(name) {
  if (!name) return 'the name is empty'
  if (name.length > MAX_NAME_LENGTH) return `the name has ${name.length} characters; the maximum is ${MAX_NAME_LENGTH}`
  if (/[A-Z]/.test(name)) return 'use lowercase letters only'
  if (!/^[a-z0-9-]+$/.test(name)) return 'use only lowercase letters, digits and dashes'
  if (name.startsWith('-') || name.endsWith('-')) return 'the name cannot start or end with a dash'
  return null
}

function nowIso() {
  return new Date().toISOString()
}

// ---------------------------------------------------------------- state

function loadState() {
  if (!existsSync(STATE_FILE)) return null
  const broken = why => fail(`${STATE_FILE} is broken: ${why}.\nFix the file, or start over with: npm run publish -- --reset`)
  const isText = value => typeof value === 'string' && value.trim() !== ''
  let state
  try {
    state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  }
  catch {
    broken('it is not valid JSON')
  }
  if (state === null || typeof state !== 'object' || Array.isArray(state)) broken('it is not a JSON object')
  if (!isText(state.provider) || !Object.hasOwn(PROVIDERS, state.provider)) broken('"provider" must be "cloudflare" or "netlify"')
  if (!isText(state.name)) broken('"name" is missing')
  if (!isText(state.url)) broken('"url" is missing')
  if (state.provider === 'cloudflare' && !isText(state.accountId)) broken('"accountId" is missing (a Cloudflare state needs it)')
  if (state.provider === 'netlify' && !isText(state.siteId)) broken('"siteId" is missing (a Netlify state needs it)')
  return state
}

function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`)
}

function resetState() {
  if (!existsSync(STATE_FILE)) {
    log(`    nothing to forget: ${STATE_FILE} does not exist`)
    return
  }
  rmSync(STATE_FILE)
  rmSync(WRANGLER_OUT, { force: true })
  log(`    removed ${STATE_FILE}`)
  log('    The project on the provider still exists. Delete it in the dashboard if you do not need it.')
}

// ---------------------------------------------------------------- prompts

async function askProvider() {
  if (opts.yes) usageError('--yes never asks. Pass --provider cloudflare|netlify.')
  log('')
  log('    Where do you want to host the page?')
  log('      1) Cloudflare Pages   https://<name>.pages.dev')
  log('      2) Netlify            https://<name>.netlify.app')
  for (;;) {
    const answer = await askLine('    Pick 1 or 2: ')
    if (answer === null) usageError('no terminal to ask. Pass --provider cloudflare or --provider netlify.')
    if (answer === '1' || answer.toLowerCase() === 'cloudflare') return 'cloudflare'
    if (answer === '2' || answer.toLowerCase() === 'netlify') return 'netlify'
    log('    Type 1 or 2.')
  }
}

async function askName(provider) {
  if (opts.yes) usageError('--yes never asks. Pass --name <site-name>.')
  const { domain } = PROVIDERS[provider]
  log('')
  log(`    Pick a site name. The page will be at https://<name>.${domain}`)
  log(`    Rules: lowercase letters, digits and dashes; no dash at the start or end; max ${MAX_NAME_LENGTH} characters.`)
  for (;;) {
    const answer = await askLine('    Site name: ')
    if (answer === null) usageError('no terminal to ask. Pass --name <site-name>.')
    const problem = nameProblem(answer)
    if (!problem) return answer
    log(`    Not allowed: ${problem}.`)
  }
}

async function pickFromList(title, items, labelOf) {
  log('')
  log(`    ${title}`)
  items.forEach((item, i) => log(`      ${i + 1}) ${labelOf(item)}`))
  for (;;) {
    const answer = await askLine(`    Pick 1-${items.length}: `)
    if (answer === null) return null
    const index = Number.parseInt(answer, 10)
    if (Number.isInteger(index) && index >= 1 && index <= items.length) return items[index - 1]
    log(`    Type a number from 1 to ${items.length}.`)
  }
}

// ---------------------------------------------------------------- cloudflare

const cloudflare = {
  /** { loggedIn, accounts: [{ id, name }] } */
  whoami() {
    const res = run(cli('wrangler'), ['whoami', '--json'], { timeout: CHECK_TIMEOUT_MS })
    if (res.timedOut) fail('wrangler whoami timed out after 30 s')
    const json = parseJson(res.out)
    if (!res.ok || !json || json.loggedIn !== true) return { loggedIn: false, accounts: [] }
    return { loggedIn: true, accounts: (json.accounts ?? []).map(a => ({ id: a.id, name: a.name })) }
  },

  login() {
    log('')
    log('    You are not logged in to Cloudflare.')
    log('    wrangler opens the browser. Log in there and allow the access. Then come back here.')
    const res = run(cli('wrangler'), ['login'], { inherit: true, timeout: LOGIN_TIMEOUT_MS })
    if (res.timedOut) fail('wrangler login timed out after 10 min')
  },

  async pickAccount(accounts, wanted) {
    if (wanted) {
      const match = accounts.find(a => a.id === wanted || a.name === wanted)
      if (!match) fail(`no Cloudflare account matches --account ${wanted}. Accounts: ${accounts.map(a => `${a.name} (${a.id})`).join(', ')}`)
      return match.id
    }
    if (accounts.length === 0) fail('your Cloudflare login has no account. Create one at https://dash.cloudflare.com first.')
    if (accounts.length === 1) return accounts[0].id
    const list = accounts.map(a => `${a.name}  (${a.id})`).join('\n      ')
    if (opts.yes) usageError(`you have ${accounts.length} Cloudflare accounts. Pass --account <id>:\n      ${list}`)
    const picked = await pickFromList('Which Cloudflare account?', accounts, a => `${a.name}  (${a.id})`)
    if (!picked) usageError(`no terminal to ask. Pass --account <id>:\n      ${list}`)
    return picked.id
  },

  /** true = free, false = taken, null = could not check */
  async isNameFree(name) {
    const host = `${name}.pages.dev`
    log(`    dns lookup ${host}`)
    try {
      await dns.resolve4(host)
      return false
    }
    catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') return true
      log(`    could not check the DNS (${error.code ?? error.message}). The create step will tell.`)
      return null
    }
  },

  /** { ok: true } | { taken: true } */
  create(name, accountId) {
    const res = run(cli('wrangler'), ['pages', 'project', 'create', name, '--production-branch', 'main'], {
      timeout: CHECK_TIMEOUT_MS,
      env: { CLOUDFLARE_ACCOUNT_ID: accountId },
    })
    if (res.timedOut) fail('wrangler pages project create timed out after 30 s')
    if (res.ok) return { ok: true }
    const text = errorText(res)
    if (/8000000|already exists|already taken|is taken|in use/i.test(text)) return { taken: true }
    log(text)
    fail(`wrangler could not create the project ${name}`)
  },

  siteUrl(name) {
    return `https://${name}.pages.dev`
  },

  /** Returns the URL of the deployment. */
  deploy(state, preview) {
    mkdirSync(STATE_DIR, { recursive: true })
    rmSync(WRANGLER_OUT, { force: true })
    const branch = preview ? 'preview' : 'main'
    const res = run(cli('wrangler'), ['pages', 'deploy', DIST, '--project-name', state.name, '--branch', branch, '--commit-dirty=true'], {
      inherit: true,
      timeout: DEPLOY_TIMEOUT_MS,
      env: { CLOUDFLARE_ACCOUNT_ID: state.accountId, WRANGLER_OUTPUT_FILE_PATH: WRANGLER_OUT },
    })
    if (res.timedOut) fail('wrangler pages deploy timed out after 10 min')
    if (!res.ok) {
      fail(`wrangler pages deploy failed. Not logged in? Run: npx wrangler login. Project gone? Run: npm run publish -- --reset`)
    }
    const detail = existsSync(WRANGLER_OUT)
      ? readFileSync(WRANGLER_OUT, 'utf8').split('\n').map(parseJson).find(j => j?.type === 'pages-deploy-detailed')
      : null
    if (!preview) return this.siteUrl(state.name)
    return detail?.alias || detail?.url || `https://preview.${state.name}.pages.dev`
  },
}

// ---------------------------------------------------------------- netlify

const netlify = {
  status() {
    const res = run(cli('netlify'), ['status', '--json'], { timeout: CHECK_TIMEOUT_MS })
    if (res.timedOut) fail('netlify status timed out after 30 s')
    const json = parseJson(res.out)
    // Exit code 1 also means "logged in, folder not linked", so read the JSON.
    return { loggedIn: Boolean(json && json.loggedIn === true && json.account) }
  },

  login() {
    log('')
    log('    You are not logged in to Netlify.')
    log('    netlify opens the browser. Authorize the CLI there. Then come back here.')
    const res = run(cli('netlify'), ['login'], { inherit: true, timeout: LOGIN_TIMEOUT_MS })
    if (res.timedOut) fail('netlify login timed out after 10 min')
  },

  /** [{ slug, name }] */
  accounts() {
    const res = run(cli('netlify'), ['api', 'listAccountsForUser'], { timeout: CHECK_TIMEOUT_MS })
    if (res.timedOut) fail('netlify api listAccountsForUser timed out after 30 s')
    const json = parseJson(res.out)
    if (!res.ok || !Array.isArray(json)) {
      log(errorText(res))
      fail('could not list your Netlify teams')
    }
    return json.map(a => ({ slug: a.slug, name: a.name ?? a.slug }))
  },

  async pickAccount(accounts, wanted) {
    if (wanted) {
      const match = accounts.find(a => a.slug === wanted || a.name === wanted)
      if (!match) fail(`no Netlify team matches --account ${wanted}. Teams: ${accounts.map(a => `${a.name} (${a.slug})`).join(', ')}`)
      return match.slug
    }
    if (accounts.length === 0) fail('your Netlify login has no team. Create one at https://app.netlify.com first.')
    if (accounts.length === 1) return accounts[0].slug
    const list = accounts.map(a => `${a.name}  (${a.slug})`).join('\n      ')
    if (opts.yes) usageError(`you have ${accounts.length} Netlify teams. Pass --account <slug>:\n      ${list}`)
    const picked = await pickFromList('Which Netlify team?', accounts, a => `${a.name}  (${a.slug})`)
    if (!picked) usageError(`no terminal to ask. Pass --account <slug>:\n      ${list}`)
    return picked.slug
  },

  /** true = free, false = taken, null = could not check. Netlify DNS is a wildcard, so ask HTTPS. */
  isNameFree(name) {
    const host = `${name}.netlify.app`
    log(`    https HEAD https://${host}/`)
    return new Promise((resolve) => {
      // agent: false = no keep-alive socket, so nothing holds the process open at the end.
      const req = httpsRequest({ host, method: 'HEAD', path: '/', agent: false, timeout: CHECK_TIMEOUT_MS }, (res) => {
        res.resume()
        resolve(res.statusCode === 404)
      })
      req.on('timeout', () => req.destroy(new Error('timed out')))
      req.on('error', (error) => {
        log(`    could not check https://${host} (${error.message}). The create step will tell.`)
        resolve(null)
      })
      req.end()
    })
  },

  /** { ok: true, site: { id, name, url } } | { taken: true } */
  create(name, accountSlug) {
    const res = run(cli('netlify'), ['sites:create', '--name', name, '--account-slug', accountSlug, '--json', '--disable-linking'], {
      timeout: CHECK_TIMEOUT_MS,
    })
    if (res.timedOut) fail('netlify sites:create timed out after 30 s')
    const site = res.ok ? parseJson(res.out) : null
    if (!res.ok || !site?.id || !site.name) {
      const text = errorText(res)
      if (/already taken|already exists|422/i.test(text)) return { taken: true }
      log(text)
      fail(`netlify could not create the site ${name}`)
    }
    return { ok: true, site: { id: site.id, name: site.name, url: site.ssl_url || site.url || `https://${site.name}.netlify.app` } }
  },

  siteUrl(name) {
    return `https://${name}.netlify.app`
  },

  /** Returns the URL of the deployment. */
  deploy(state, preview) {
    const args = ['deploy', ...(preview ? [] : ['--prod']), '--dir', DIST, '--no-build', '--site', state.siteId, '--json']
    // stdout carries the JSON result; stderr shows the upload progress live.
    const res = run(cli('netlify'), args, { timeout: DEPLOY_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'inherit'] })
    if (res.timedOut) fail('netlify deploy timed out after 10 min')
    const json = parseJson(res.out)
    if (!res.ok || !json) {
      if (res.out.trim()) log(res.out.trim())
      fail('netlify deploy failed. Not logged in? Run: npx netlify login. Site gone? Run: npm run publish -- --reset')
    }
    const url = preview ? json.deploy_url : (json.url || state.url)
    if (!url) fail('netlify deploy gave no URL back')
    return url
  },
}

// ---------------------------------------------------------------- flow

// A bad flag gives `opts.usageFailed`. The script never calls process.exit():
// it sets process.exitCode and lets Node end, so a piped stdout is never cut.
const { values: opts } = (() => {
  try {
    return parseArgs({
      options: {
        'provider': { type: 'string' },
        'name': { type: 'string' },
        'account': { type: 'string' },
        'preview': { type: 'boolean', default: false },
        'site-url': { type: 'string' },
        'no-build': { type: 'boolean', default: false },
        'yes': { type: 'boolean', default: false },
        'reset': { type: 'boolean', default: false },
        'help': { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    })
  }
  catch (error) {
    log(`Error: ${error.message}\n\n${USAGE}`)
    return { values: { usageFailed: true } }
  }
})()

async function ensureLoggedIn(provider) {
  step(`Login (${PROVIDERS[provider].label})`)
  const api = provider === 'cloudflare' ? cloudflare : netlify
  const check = () => (provider === 'cloudflare' ? cloudflare.whoami() : netlify.status())
  let auth = check()
  if (!auth.loggedIn) {
    if (opts.yes && !interactive) {
      fail(`not logged in. Run: npx ${PROVIDERS[provider].cli} login`)
    }
    api.login()
    auth = check()
    if (!auth.loggedIn) fail(`still not logged in after ${PROVIDERS[provider].cli} login`)
  }
  log('    logged in')
  return auth
}

/** Steps 2 to 5. Returns the new state. Writes the state file only after a successful create. */
async function setup() {
  step('Setup (first run)')
  let provider = opts.provider
  if (provider && !PROVIDERS[provider]) usageError(`--provider must be cloudflare or netlify, not ${provider}`)
  provider ??= await askProvider()
  log(`    provider: ${PROVIDERS[provider].label}`)

  let name = opts.name
  if (name !== undefined) {
    const problem = nameProblem(name)
    if (problem) usageError(`--name ${name}: ${problem}`)
  }
  name ??= await askName(provider)
  log(`    name: ${name}`)

  const auth = await ensureLoggedIn(provider)

  step('Account')
  const account = provider === 'cloudflare'
    ? await cloudflare.pickAccount(auth.accounts, opts.account)
    : await netlify.pickAccount(netlify.accounts(), opts.account)
  log(`    ${provider === 'cloudflare' ? 'account id' : 'team'}: ${account}`)

  step('Create')
  const api = provider === 'cloudflare' ? cloudflare : netlify
  for (;;) {
    const free = await api.isNameFree(name)
    let result = null
    if (free !== false) {
      if (free === true) log(`    ${name}.${PROVIDERS[provider].domain} is free`)
      result = api.create(name, account)
    }
    if (free === false || result.taken) {
      log(`    ${name}.${PROVIDERS[provider].domain} is taken.`)
      if (opts.yes || !interactive) fail(`the name ${name} is taken. Pick another with --name.`)
      name = await askName(provider)
      continue
    }

    const createdAt = nowIso()
    let state
    if (provider === 'cloudflare') {
      state = { provider, name, accountId: account, url: cloudflare.siteUrl(name), createdAt, lastPublishedAt: null }
    }
    else {
      const { site } = result
      if (site.name !== name) {
        log(`    Netlify says ${name} is taken. It created ${site.name} instead.`)
        log(`    To use a different name: delete the site in the Netlify dashboard, run --reset, and try again.`)
      }
      state = { provider, name: site.name, accountSlug: account, siteId: site.id, url: site.url, createdAt, lastPublishedAt: null }
    }
    saveState(state)
    log(`    created ${state.name} on ${PROVIDERS[provider].label}`)
    log(`    saved ${STATE_FILE}`)
    log(`    Your page will be at ${state.url}`)
    return state
  }
}

function walkDist(dir, stats) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDist(path, stats)
      continue
    }
    if (!entry.isFile()) continue
    const { size } = statSync(path)
    stats.files += 1
    stats.bytes += size
    if (size > MAX_FILE_BYTES) stats.tooBig.push({ path, size })
  }
}

/** Before step 6. Says which profile the build reads. Guards a production publish of the sample. */
async function checkProfile() {
  step('Profile')
  if (existsSync(PERSONAL_PROFILE)) {
    log('    profile: content/profile.json (personal)')
    return
  }
  log('    profile: content/profile.example.json (example)')
  log('    content/profile.json does not exist, so the build uses the sample profile.')
  log('    Make your own: npm run dev, open http://localhost:3000/edit, click Save.')
  if (opts.preview) return
  if (opts.yes) {
    log('    Warning: publishing the sample profile to production (--yes).')
    return
  }
  const answer = await askLine('    You are about to publish the sample profile. Continue? [y/N] ')
  if (answer === null) usageError('no terminal to ask. Pass --yes to publish the sample profile.')
  if (!/^y(es)?$/i.test(answer)) fail('stopped. Nothing was uploaded.')
}

/** Step 6. */
function build(state) {
  step(opts['no-build'] ? 'Build (skipped by --no-build)' : 'Build')
  const siteUrl = opts['site-url'] || process.env.NUXT_PUBLIC_SITE_URL || state.url
  if (!opts['no-build']) {
    if (!HTTPS_URL.test(siteUrl)) {
      const source = opts['site-url'] ? '--site-url' : process.env.NUXT_PUBLIC_SITE_URL ? 'NUXT_PUBLIC_SITE_URL' : `url in ${STATE_FILE}`
      usageError(`${source} must start with https:// (got ${siteUrl})`)
    }
    const res = run(npmCli(), ['run', 'generate'], { inherit: true, timeout: BUILD_TIMEOUT_MS, env: { NUXT_PUBLIC_SITE_URL: siteUrl } })
    if (res.timedOut) fail('npm run generate timed out after 10 min')
    if (!res.ok) fail('npm run generate failed')
  }
  if (!existsSync(join(DIST, 'index.html'))) {
    fail(`${DIST}/index.html does not exist.${opts['no-build'] ? ' Run without --no-build.' : ''}`)
  }
  const stats = { files: 0, bytes: 0, tooBig: [] }
  walkDist(DIST, stats)
  log(`    ${DIST}/: ${stats.files} files, ${(stats.bytes / 1024 / 1024).toFixed(1)} MiB`)
  if (stats.files > MAX_FILES) fail(`${DIST}/ has ${stats.files} files. The providers accept at most ${MAX_FILES}.`)
  if (stats.tooBig.length) {
    for (const f of stats.tooBig) log(`    too big: ${f.path} (${(f.size / 1024 / 1024).toFixed(1)} MiB)`)
    fail(`a file is bigger than ${MAX_FILE_BYTES / 1024 / 1024} MiB. The providers reject it.`)
  }
}

/** Step 7. */
function deploy(state) {
  const preview = opts.preview
  step(`Upload to ${PROVIDERS[state.provider].label} (${preview ? 'preview' : 'production'})`)
  const api = state.provider === 'cloudflare' ? cloudflare : netlify
  const url = api.deploy(state, preview)
  state.lastPublishedAt = nowIso()
  if (!preview) state.url = url
  saveState(state)
  log('')
  log(`${preview ? 'Preview' : 'Live'}: ${url}`)
  log(`Custom domain: ${PROVIDERS[state.provider].dashboard}.`)
}

async function main() {
  if (opts.help) {
    log(USAGE)
    return
  }
  if (opts.provider && !PROVIDERS[opts.provider]) usageError(`--provider must be cloudflare or netlify, not ${opts.provider}`)
  if (opts.name !== undefined && nameProblem(opts.name)) usageError(`--name ${opts.name}: ${nameProblem(opts.name)}`)
  if (opts['site-url'] !== undefined && !HTTPS_URL.test(opts['site-url'])) {
    usageError(`--site-url must start with https:// (got ${opts['site-url']})`)
  }

  if (opts.reset) {
    step('Reset')
    resetState()
  }

  let state = loadState()
  if (state) {
    if (opts.provider && opts.provider !== state.provider) {
      usageError(`${STATE_FILE} says ${state.provider}, but you passed --provider ${opts.provider}. Drop the flag, or run --reset to start over.`)
    }
    if (opts.name && opts.name !== state.name) {
      usageError(`${STATE_FILE} says ${state.name}, but you passed --name ${opts.name}. Drop the flag, or run --reset to start over.`)
    }
    step(`Publish ${state.name} on ${PROVIDERS[state.provider].label}`)
    log(`    saved in ${STATE_FILE}. Forget it with --reset.`)
    await ensureLoggedIn(state.provider)
  }
  else {
    state = await setup()
  }

  await checkProfile()
  build(state)
  deploy(state)
}

if (opts.usageFailed) {
  process.exitCode = 2
}
else {
  main().then(
    () => {
      process.exitCode = 0
    },
    (error) => {
      if (error instanceof PublishError) {
        log(`\nError: ${error.message}`)
        process.exitCode = error.code
        return
      }
      log(`\nError: ${error?.stack ?? error}`)
      process.exitCode = 1
    },
  )
}
