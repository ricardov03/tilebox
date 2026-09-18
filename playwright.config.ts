/**
 * Two projects:
 * - `static`: the prerendered site in `dist/` (run `npm run generate` first),
 *   served by scripts/serve-dist.mjs on :4173, plus repo.spec.ts, privacy.spec.ts, gravatar.spec.ts, links.spec.ts, unfurl.spec.ts, security.spec.ts (no browser, no internet) and site.spec.ts (head + asset builder). Runs in CI.
 * - `dev`: the editor on `nuxt dev` at :3111, plus security-dev.spec.ts (the dev routes and headers). Writes content/profile.json and
 *   public/blocks/, so it runs locally only.
 * Only the servers of the selected projects start.
 */
import { defineConfig, devices } from '@playwright/test'

/**
 * `E2E_STATIC_PORT` / `E2E_DEV_PORT` move a server when the default port is taken by another checkout.
 * `||`, not `??`: an empty or non-numeric value falls back to the default, never to port 0 or NaN.
 */
const STATIC_PORT = Number(process.env.E2E_STATIC_PORT) || 4173
const DEV_PORT = Number(process.env.E2E_DEV_PORT) || 3111
const STATIC_URL = `http://localhost:${STATIC_PORT}`
const DEV_URL = `http://localhost:${DEV_PORT}`

/** Project names passed as `--project=x` or `--project x`. Empty = all. */
const selected = process.argv.flatMap((arg, i, all) => {
  if (arg === '--project') return [all[i + 1] ?? '']
  if (arg.startsWith('--project=')) return [arg.slice('--project='.length)]
  return []
})
const wants = (name: string) => selected.length === 0 || selected.includes(name)

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'static',
      testMatch: ['public.spec.ts', 'a11y.spec.ts', 'repo.spec.ts', 'privacy.spec.ts', 'gravatar.spec.ts', 'links.spec.ts', 'unfurl.spec.ts', 'site.spec.ts', 'security.spec.ts'],
      use: { baseURL: STATIC_URL },
    },
    {
      name: 'dev',
      testMatch: ['editor.spec.ts', 'editor-inputs.spec.ts', 'site-editor.spec.ts', 'security-dev.spec.ts'],
      timeout: 90_000,
      use: { baseURL: DEV_URL },
    },
  ],
  webServer: [
    ...(wants('static')
      ? [{
          command: `node scripts/serve-dist.mjs ${STATIC_PORT}`,
          url: STATIC_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        }]
      : []),
    ...(wants('dev')
      ? [{
          command: `npm run dev -- --port ${DEV_PORT}`,
          url: DEV_URL,
          reuseExistingServer: false,
          timeout: 120_000,
        }]
      : []),
  ],
})
