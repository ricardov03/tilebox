/**
 * Reads the profile at build time and validates it once.
 * `#profile` is a Nuxt alias set in nuxt.config.ts: content/profile.json when
 * it exists, else content/profile.example.json (see content/resolve.ts).
 * The parse runs at module scope, so every caller gets the same typed object.
 */
import profileJson from '#profile'
import { parseProfile, type Profile } from '~~/types/profile'

const profile: Profile = parseProfile(profileJson)

export function useProfile() {
  return { profile }
}
