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

## What else is ignored

From `.gitignore`, block "Personal data":

```
content/profile.json
public/avatar.*
public/blocks/*        (except public/blocks/sample.jpg)
public/icons/*         (favicons fetched at build)
public/thumbs/*        (YouTube thumbnails fetched at build)
.tilebox/
.netlify/
```

## Back it up

Your page is one JSON file plus your images. Copy them somewhere safe:

```sh
cp content/profile.json ~/Backups/tilebox-profile.json
cp -R public/blocks ~/Backups/tilebox-blocks
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
