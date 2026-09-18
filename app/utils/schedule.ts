/**
 * Block schedule (WP11). Pure: no Vue, no Node. Used by `toPublicProfile()`
 * (build time), `check:profile`, the editor and the tests.
 *
 * The page is static. So:
 * - a START in the future removes the block from the build. It shows after the
 *   next publish that runs after that time.
 * - an END in the past removes the block from the build. An END in the future
 *   stays on the page as `data-ends-at`; a tiny inline script hides the tile
 *   when the time has passed (`ENDS_AT_SCRIPT`). With JavaScript off the tile stays.
 */

export interface Scheduled {
  startsAt?: string
  endsAt?: string
}

export type ScheduleState = 'live' | 'scheduled' | 'ends' | 'expired'

/** ms since the epoch, or `null` for a missing or unreadable date. */
function timeOf(value: string | undefined): number | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

/**
 * - `scheduled`: `startsAt` is in the future (not on the page yet).
 * - `expired`: `endsAt` is now or in the past (not on the page any more).
 * - `ends`: on the page, with an end date in the future.
 * - `live`: on the page, no end date.
 */
export function scheduleState(block: Scheduled, now: Date): ScheduleState {
  const at = now.getTime()
  const end = timeOf(block.endsAt)
  if (end !== null && end <= at) return 'expired'
  const start = timeOf(block.startsAt)
  if (start !== null && start > at) return 'scheduled'
  return end !== null ? 'ends' : 'live'
}

/** True when the build keeps the block. */
export function isOnPage(block: Scheduled, now: Date): boolean {
  const state = scheduleState(block, now)
  return state === 'live' || state === 'ends'
}

/** True when `endsAt` is set and is not after `startsAt`. The schema refuses it. */
export function endsBeforeStart(block: Scheduled): boolean {
  const start = timeOf(block.startsAt)
  const end = timeOf(block.endsAt)
  return start !== null && end !== null && end <= start
}

/** `2026-09-18T14:30` (the value of a `datetime-local` input, this machine's time zone) -> ISO 8601 with this machine's offset. */
export function localInputToIso(value: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value)
  if (!match) return undefined
  const [year, month, day, hour, minute, second] = match.slice(1).map(part => (part === undefined ? 0 : Number(part)))
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, second ?? 0)
  if (Number.isNaN(date.getTime())) return undefined
  const offset = -date.getTimezoneOffset()
  const sign = offset < 0 ? '-' : '+'
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
  const zone = `${sign}${pad(Math.trunc(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  return `${localInputOf(date)}:${pad(date.getSeconds())}${zone}`
}

function localInputOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** ISO 8601 -> the value of a `datetime-local` input in this machine's time zone. '' when missing or unreadable. */
export function isoToLocalInput(iso: string | undefined): string {
  const time = timeOf(iso)
  return time === null ? '' : localInputOf(new Date(time))
}

/**
 * The inline script of the public page. No network. Hides every `[data-ends-at]`
 * tile whose time has passed, now and every 60 s. Keep under 400 bytes.
 */
export const ENDS_AT_SCRIPT = '!function(){function c(){var n=Date.now();document.querySelectorAll("[data-ends-at]").forEach(function(e){Date.parse(e.getAttribute("data-ends-at"))<=n&&(e.hidden=!0)})}c();setInterval(c,6e4)}()'
