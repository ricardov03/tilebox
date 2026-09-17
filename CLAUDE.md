# tilebox

Bento-style personal portfolio. Nuxt 4, static output, local editor, hosted on Cloudflare Pages.

## Start here, every session
1. Read `PLAN.md` fully. It is the source of truth. Every decision is in section 11.
2. Status line at the top of `PLAN.md` says the next step. As of 2026-09-17 the next step is **WP0** (scaffold). No code exists yet.
3. Design canvas (Claude Design artifact, live): https://claude.ai/artifact/NxtZpWcB2B3JEwwL3kahzZ
   A local copy of its boards is in `design/canvas/` (board A = light, board B = dark; both CONDOMERA blue + Geist).
4. GitHub repo: `github.com/ricardov03/tilebox`. Ricardo created it empty. WP0 does `git init` + first push.

## How Ricardo wants to work
- Plan file is enforced. Agents follow `PLAN.md` section 0 rules and own only their WP files.
- WP1 to WP4 run as parallel Claude subagents. Fable stays architect, merges, runs reviews.
- Code review by **Grok** after every WP. Ricardo will provide the Grok tools. Not provided yet.
- Ask questions that improve quality. Max 2 options per decision. Say which one you would pick.
- Reply style: ELI5 output style, Simplified Technical English. Short sentences. Exact paths and commands.

## Key decisions (short form, details in PLAN.md)
- Stack: Nuxt 4.5 + Tailwind 4 via `@tailwindcss/vite` (not the nuxt tailwind module) + `@nuxt/fonts` + `@nuxt/icon`.
- Drag and drop in the editor: `vue-draggable-plus`. Fallback gridstack.
- Presets like PowerPoint: 3 color presets (`condomera` default, `lunchbox`, `night`), 3 font presets (`geist` default, `lunchbox`, `night`).
- Icons: Iconify, default set `line-md`, brand fallback `simple-icons`. Picker links to icones.js.org.
- Images: v1 local files. Later Pexels picker (decided over Unsplash). Later R2 uploads.
- Deploy: Cloudflare Pages, build `npm run generate`, output `dist`, `NODE_VERSION=24`.

## Still needed from Ricardo (not blocking WP0)
- Real links (GitHub, LinkedIn, X, email, CONDOMERA URL), city, avatar, one photo.
- The Grok review tools.
