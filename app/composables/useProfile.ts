/**
 * The public profile, validated once at module scope.
 * `#profile` is a Nuxt alias to `.nuxt/tilebox/public-profile.json`, the
 * SANITIZED copy that modules/public-profile.ts writes from content/profile.json
 * (or the example, see content/resolve.ts): no email unless `showEmail` is true,
 * avatar already resolved. The raw file never reaches the client bundle.
 * The editor does not use this. It loads the full file from `/api/profile`.
 */
import profileJson from '#profile'
import { PublicProfileShapeSchema, type PublicProfile } from '~~/types/profile'

/**
 * The SHAPE schema, never `PublicProfileSchema` (WP20). That one carries the mail-shield guard,
 * and `check:profile` prints the same guard as a WARNING: an address an owner typed into a bio
 * must not stop a build. Parsed here it did exactly that ("Exiting due to prerender errors").
 */
const profile: PublicProfile = PublicProfileShapeSchema.parse(profileJson)

export function useProfile() {
  return { profile }
}
