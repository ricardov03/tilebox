/**
 * Reads content/profile.json at build time and validates it once.
 * The parse runs at module scope, so every caller gets the same typed object.
 */
import profileJson from '~~/content/profile.json'
import { parseProfile, type Profile } from '~~/types/profile'

const profile: Profile = parseProfile(profileJson)

export function useProfile() {
  return { profile }
}
