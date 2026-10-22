# Splotch – Agent Instructions

> [!IMPORTANT]
> Every `CLAUDE.md` and `AGENTS.md` in this repo and nearly every package in `.claude/skills/` and
> `.agents/skills/` is **generated** by [ruler](https://github.com/intellectronica/ruler) — never
> edit generated files directly. Edit their `.ruler/` source, run `npm run ruler:apply`, and commit
> the output. Direct provider packages registered in `tools/ruler/lib/direct-provider-skills.mjs`
> are the exceptions (see "Agent instruction files" below). Edit only the registered provider
> package and note you intend to change; never manufacture a missing provider by copying another
> one.

Splotch is a drawing app for toddlers (2+). One Expo / React Native / React Strict DOM app ships
Android, iOS and a prerendered web export (ADR-0182).

* **Web** (`splotch.art`, Netlify): the static export, `/admin`, the PWA, and one Netlify Function
  serving `/api/*`.
* **Native** (Android + iOS): the React Native projects in `experiments/native-architecture`. Native
  apps call the hosted API. Every non-store build uses `art.splotch.app.dev`.

The app lives in `experiments/native-architecture`; framework-free shared modules remain under
`web/src/lib` until the root promotion in epic #3148. The root package and app share one pnpm lock
and hoisted dependency tree. Dependency changes require SDK alignment and native script provenance
review before installation (ADR-0119).

Metro resolves platform modules by file extension (`.web.ts`, `.native.ts`, and platform-specific
variants). Use that build-time boundary instead of adding runtime branches for code that only one
platform needs (ADR-0179).
