# Splotch – Agent Instructions

> [!IMPORTANT]
> Every `CLAUDE.md` and `AGENTS.md` in this repo, plus the `.claude/skills/` and `.agents/skills/`
> trees, is **generated** by [ruler](https://github.com/intellectronica/ruler) — never edit those
> files directly. Edit the sources in `.ruler/` (or the nested `<dir>/.ruler/`), then run
> `npm run ruler:apply` and commit the regenerated output. CI fails on drift
> (`npm run ruler:check`).

Splotch is a drawing app for toddlers (2+). One SvelteKit codebase ships two targets (ADR-0001):

* **Web** (`splotch.art`, Netlify): SSR + `/api/*` serverless functions + `/admin` console + PWA.
* **Native** (Capacitor; Android + iOS): fully static export, no server routes — the apps call the
  hosted API.

The SvelteKit app lives in **`web/`** (its `src/`, configs, `netlify.toml`, build output); the
Capacitor native trees (`android/`, `ios/`), `capacitor.config.json`, the single root
`package.json`/`node_modules`, and `scripts/` stay at the repo root. This keeps netlify-cli's file
watcher (run via `netlify dev --cwd web`) off the large native trees — see ADR-0024. The web
toolchain runs with `cwd = web/` through `scripts/web.mjs`.

The `CAPACITOR=true` env var at build time is the **single signal** for all web-vs-native branching
(`web/svelte.config.js`, `web/vite.config.ts`). Do not add runtime platform branches that could be
build-time branches instead.
