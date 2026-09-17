/**
 * First version by WP0. WP1 owns this file and may extend it.
 * Reads content/profile.json at build time and validates it once.
 */
import profileJson from '~~/content/profile.json'
import { parseProfile, type Profile } from '~~/types/profile'

let cached: Profile | undefined

export function useProfile() {
  cached ??= parseProfile(profileJson)
  return { profile: cached }
}
