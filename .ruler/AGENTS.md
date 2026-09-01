# Splotch – Agent Instructions

> [!IMPORTANT]
> Every `CLAUDE.md` and `AGENTS.md` in this repo and nearly every package in `.claude/skills/` and
> `.agents/skills/` is **generated** by [ruler](https://github.com/intellectronica/ruler) — never
> edit generated files directly. Edit their `.ruler/` source, run `npm run ruler:apply`, and commit
> the output. Direct provider packages registered in `tools/ruler/lib/direct-provider-skills.mjs`
> are the exceptions: `burn-down-audits` and `analyze-session-transcripts` have independent Claude
> and Codex implementations, while `run-claude` and `implement-issue-stack` are intentionally
> Codex-only and `run-codex` is intentionally Claude-only. Edit only the registered provider package
> and note you intend to change; never manufacture a missing provider by copying another one.

Splotch is a drawing app for toddlers (2+). One SvelteKit codebase ships two targets (ADR-0001):

* **Web** (`splotch.art`, Netlify): SSR + `/api/*` serverless functions + `/admin` console + PWA.
* **Native** (Capacitor; Android + iOS): fully static export, no server routes — the apps call the
  hosted API.

The SvelteKit app lives in **`web/`** (its `src/`, configs, `netlify.toml`, build output); the
Capacitor native trees (`android/`, `ios/`), `capacitor.config.json`, the single root
`package.json`/`node_modules`, and `tools/` stay at the repo root. This keeps netlify-cli's file
watcher (run via `netlify dev --cwd web`) off the large native trees — see ADR-0024. The web
toolchain runs with `cwd = web/` through `tools/run-web-tool.mjs`.

The `CAPACITOR=true` env var at build time is the **single signal** for all web-vs-native branching
(`web/svelte.config.js`, `web/vite.config.ts`). Do not add runtime platform branches that could be
build-time branches instead.
