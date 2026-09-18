# content/

## Which file is yours

| File | What it is | In git? |
|---|---|---|
| `content/profile.json` | **Your** page: name, bio, links, tiles, theme. The editor writes it. | No. Ignored. |
| `content/profile.example.json` | The sample page that ships with the repo. | Yes. |
| `content/resolve.ts` | Picks the file: `profile.json` when it exists, else the example. Used by the build, the scripts, the editor and the tests. | Yes. |

`npm run dev` creates `content/profile.json` from the example the first time.
It also upgrades an older file: it adds `email` (`you@example.com`), `showEmail` (`false`) and `highlights` (`[]`) when they are missing, and changes nothing else.

## Your email

`profile.email` is required. With `showEmail: false` (the default) the build removes it: the page imports a sanitized copy of your profile, so the email is in no file of `dist/`.
It is still used on your machine, at build time, to download your Gravatar picture to `public/avatar.gravatar.jpg` (ignored by git). The published page never calls gravatar.com.
A `git pull`, a release or a fresh clone never touches it, because git does not know it exists.

## Site metadata

The optional top-level `site` object holds the page title, description, site URL, language, `noindex`, X handle, job title, location and the paths of your own favicon and social image. Without it the build uses your name, handle and bio.
`npm run build:site-assets` (part of `predev` and `pregenerate`) writes the favicon set and the social image to `public/site/`. Details: README, "Site metadata".
`site.share` (`false` removes the share button) and `site.utm` (tags the build adds to outgoing links) live there too. Details: README, "Share button" and "UTM tags".

## Contact card

The optional top-level `contact` object is your PUBLIC contact card: `enabled`, `fullName`, `org`, `title`, `phone`, `email`, `url`, `note`. With `enabled: true` the build writes it to `public/site/contact.vcf`, a file anyone can download from your page. Everything in it is public. `profile.email` stays private and is never copied into the card. Details: README, "Save contact".

## Schedule

Every block takes `startsAt` and `endsAt` (ISO 8601 with an offset). The build leaves out a block that has not started or has ended. A block that starts later shows only after you publish again after that time. Details: README, "Scheduling".

## What else is ignored

From `.gitignore`, block "Personal data":

```
content/profile.json
public/avatar.*
public/blocks/*        (except public/blocks/sample.jpg; photos picked from Pexels land here as pexels-<id>.webp)
public/icons/*         (website icons of your link tiles, always PNG; unused ones are removed by fetch:links)
public/thumbs/*        (website images of your link tiles, YouTube thumbnails)
public/site/           (favicon set, manifest, social image, contact card and QR code, made at build from your profile)
public/site-uploads/   (your own favicon and social image, uploaded in /edit > Site)
.tilebox/              (publish state, link preview cache)
.netlify/
```

## Files fetched for your links

Link previews (README, "Link previews") save what a website says about itself as local files: `public/icons/<hash>.<ext>`, `public/thumbs/<hash>.webp` and the cache `.tilebox/unfurl-cache.json`.
They are personal: they show which sites you link to. So they are ignored by git, like your profile.
They are fetched by your machine only, in the editor or at build time. A visitor of your page never fetches anything from another host.
Safe to delete: `npm run generate` fetches them again for every link with `"enrich": true`.
Moving to another machine: copy `content/profile.json`. The files come back with the next build.

## Hidden blocks

A block with `"hidden": true` stays in `content/profile.json` and in the editor. The build removes it, with its id in both layouts, before the page sees the profile. So its text is in no file of `dist/`. `tests/e2e/privacy.spec.ts` checks that.

## Back it up

Your page is one JSON file plus your images. Copy them somewhere safe:

```sh
cp content/profile.json ~/Backups/tilebox-profile.json
cp -R public/blocks ~/Backups/tilebox-blocks
cp -R public/site-uploads ~/Backups/tilebox-site-uploads 2>/dev/null
cp public/avatar.* ~/Backups/ 2>/dev/null
```

Restore: copy them back to the same paths.

## Reset to the example

```sh
rm content/profile.json
npm run ensure:profile     # or just: npm run dev
```

## Which file a build uses

`npm run check:profile` (part of `predev` and `pregenerate`) prints one of:

```
profile: content/profile.json (personal)
profile: content/profile.example.json (example)
```

GitHub CI and the release zip have no `profile.json`, so they build the **sample** site.
Your real page leaves your Mac only with `npm run publish` or `npm run publish -- --preview` (`npm run deploy` and `npm run deploy:preview` are aliases).
