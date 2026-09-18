/**
 * The public profile, validated once at module scope.
 * `#profile` is a Nuxt alias to `.nuxt/tilebox/public-profile.json`, the
 * SANITIZED copy that modules/public-profile.ts writes from content/profile.json
 * (or the example, see content/resolve.ts): no email unless `showEmail` is true,
 * avatar already resolved. The raw file never reaches the client bundle.
 * The editor does not use this. It loads the full file from `/api/profile`.
 */
import profileJson from '#profile'
import { PublicProfileSchema, type PublicProfile } from '~~/types/profile'

const profile: PublicProfile = PublicProfileSchema.parse(profileJson)

export function useProfile() {
  return { profile }
}
