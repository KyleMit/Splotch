# Contributing to Splotch

## Where the backlog lives

Planned work — features, bugs, chores, tests — lives in
[GitHub Issues](https://github.com/kylemit/splotch/issues), the project's single backlog. To find
something to work on, filter open issues by label (`area:*`, `type:*`, `priority:*`). The issue
format, the full label glossary, and the triage/won't-do flow are documented in
[ISSUE-WORKFLOW.md](ISSUE-WORKFLOW.md). Reference the issue from your PR (`fixes #NN`) so it closes
on merge.

## Prerequisites

* **Node 22** via [nvm](https://github.com/nvm-sh/nvm) (or your version manager of choice).
  Capacitor 8 requires Node ≥ 22. Development is supported on macOS and Linux (ADR-0062).
  ```bash
  nvm use 22
  ```
* **npm** (bundled with Node)
* **Netlify CLI** (optional) — only needed to run the `/api/*` serverless functions locally via
  `npm run dev:netlify`. Install globally with `npm install -g netlify-cli`.
* For native Android/iOS work, see the full toolchain setup in the
  [mobile guide](../.claude/skills/mobile/SKILL.md). (iOS needs macOS + full Xcode; no CocoaPods —
  the project uses Swift Package Manager.)

## Local setup

```bash
npm install
npm run dev       # http://localhost:5173
```

Two generators run automatically before every build (the `prebuild`/`prebuild:cap` hooks):

* `gen:icons` — generates `web/src/lib/components/icon-names.d.ts` from the SVG files in
  `web/src/lib/icons/`
* `gen:releases` — generates `web/src/lib/releases.json` and the fastlane store changelogs from
  `releases/*.md`

To see every npm script with a one-line description, run:

```bash
npm run info
```

The descriptions live in the `scripts-info` section of `package.json`; script naming follows
ADR-0019.

> **Adding a dependency?** The `dependencies`/`devDependencies` split is repurposed (ADR-0070):
> `dependencies` holds what the **Netlify web build** needs (the app's runtime imports plus
> vite/SvelteKit/the adapter/`marked`), `devDependencies` holds local/CI-only tooling (Playwright,
> dprint, sharp, the Capacitor CLIs, …). Netlify installs with `--omit=dev`, so a build-needed
> package filed under `devDependencies` fails the deploy — CI won't catch it because GitHub Actions
> installs everything.

## Environment variables

None are required for local development. The app works fully offline without any API keys.

| Variable                    | Where set     | Purpose                                                                       |
| --------------------------- | ------------- | ----------------------------------------------------------------------------- |
| `CAPACITOR=true`            | build scripts | Switches to `adapter-static`, disables PWA plugin, sets `__NATIVE_API_BASE__` |
| `PUBLIC_ENABLE_DEV_HARNESS` | `.env.local`  | Unlocks the `/dev/*` test routes in the browser                               |
| `AI_ACCESS_TOKENS`          | Netlify env   | Comma-separated list of valid AI invite tokens (server-only)                  |
| `ADMIN_PASSWORD`            | Netlify env   | Password for the `/admin` token console (server-only)                         |
| `GOOGLE_API_KEY`            | Netlify env   | Gemini API key for the hosted image generation endpoint (server-only)         |

To test the AI flow locally, run `npm run dev:netlify` instead of `npm run dev` — this starts the
Netlify Dev server so the `/api/*` serverless functions are available. This requires the Netlify
CLI, which is installed globally (it is not a project dependency):

```bash
npm install -g netlify-cli
```

## The dual-build

Splotch ships as two distinct build targets from the same source:

| Target             | Command             | Adapter           | Server routes               |
| ------------------ | ------------------- | ----------------- | --------------------------- |
| Web (Netlify)      | `npm run build`     | `adapter-netlify` | `/api/*`, `/admin` included |
| Native (Capacitor) | `npm run build:cap` | `adapter-static`  | excluded (`strict: false`)  |

The switch is the `CAPACITOR` env var, read by both `web/svelte.config.js` (adapter selection) and
`web/vite.config.ts` (PWA plugin, `__NATIVE_API_BASE__`).

### Repository layout (ADR-0024)

The SvelteKit app lives in **`web/`** (`web/src/`, the Vite/SvelteKit/test configs,
`web/netlify.toml`, and the `web/build/` output). The Capacitor native projects (`android/`,
`ios/`), `capacitor.config.json` (`webDir: "web/build"`), the single root
`package.json`/`node_modules`, and `scripts/` stay at the repo root. `npm run dev:netlify` runs
`netlify dev --cwd web` so netlify-cli's file watcher is scoped to `web/` and never traverses the
large native trees (the cause of the `EMFILE` crash this layout fixes). All the npm scripts still
run from the repo root; the web toolchain is dispatched into `web/` by `scripts/web.mjs`.

> **Production deploy.** Netlify builds from the repo **root** (where `package.json` + the lockfile
> live). The root `netlify.toml` build command runs `npm run build` (which builds the app in `web/`)
> then `node scripts/stage-netlify.mjs`, which copies `web/build → build` and
> `web/.netlify → .netlify` so Netlify sees the standard root layout (`publish = "build"`, SSR
> function in `.netlify/functions-internal`). Local `netlify dev` uses `web/netlify.toml` instead.
> This is implemented but **must be confirmed green on a Netlify deploy preview before merging to
> `main`** — don't assume the live `splotch.art` deploy works until that preview passes.

On native the AI button calls the **hosted** endpoint (`https://splotch.art/api/generate-image`) via
`__NATIVE_API_BASE__`. On web it uses a same-origin relative path.

## Type checking

```bash
npm run check          # svelte-check (one-shot)
npm run check:watch    # watch mode
npx tsc --noEmit       # TypeScript only
```

## Testing

```bash
npm test                   # unit + asset-pipeline + E2E (what CI runs on every push)
npm run test:unit:watch    # Vitest watch mode
npm run test:e2e:headed    # Playwright with browser visible (SLOWMO=500)
npm run test:e2e:ui        # Playwright UI mode
```

See the [testing guide](../.claude/skills/testing/SKILL.md) for the full test strategy, including
the native smoke tests (`test:android`, `test:ios`).

## Dev routes

Set `PUBLIC_ENABLE_DEV_HARNESS=true` in `.env.local` to unlock:

| Route           | Purpose                                                              |
| --------------- | -------------------------------------------------------------------- |
| `/dev/engine`   | Blank canvas with debug controls for testing the drawing engine      |
| `/dev/ai-timer` | Full AI round-trip with timing display; used by Playwright E2E specs |

## Code conventions

**Svelte 5 runes only.** Use `$state`, `$derived`, `$effect`, `$props`. No legacy stores
(`writable`, `readable`).

**State lives in `web/src/lib/state/`**, not in components. Components read state and call setters;
they don't own shared state.

**The drawing engine is imperative.** `web/src/lib/drawing/engine.ts` is a plain TypeScript module
(not a Svelte store). Components wire into it via callbacks on mount and call its exported functions
directly (`setColor`, `clearCanvas`, etc.).

**Svelte actions for complex gestures.** Drag interactions (drag-to-clear) and dialog wiring live in
`web/src/lib/actions/`, not inline in components.

**No comments on obvious code.** Add a comment only when the *why* is non-obvious — a hidden
constraint, a workaround, a subtle invariant. Don't describe what the code does; the names do that.

**Scoped styles.** Component styles go in the component's `<style>` block. Avoid global CSS except
for genuine cross-component tokens. Use `:global()` sparingly and only when a class is set
imperatively (e.g. via `classList`).

**No framework overhead in `platform.ts`.** The platform detection module reads the Capacitor global
directly rather than importing `@capacitor/core`, so it evaluates safely during SSR without pulling
in native code.

**Formatting is enforced in CI** (ADR-0031, ADR-0057). Prettier formats source; dprint formats
markdown (asterisk bullets and emphasis, hard wrap at 100 — `dprint.json`). Run `npm run format`
before pushing, or install the recommended VS Code extensions (`.vscode/extensions.json`) to format
on save.

**Agent instruction files are generated** (ADR-0058). Every `CLAUDE.md`/`AGENTS.md` and the
`.claude/skills/` + `.agents/skills/` trees are generated by
[ruler](https://github.com/intellectronica/ruler) from the sources in `.ruler/` (and the nested
`<dir>/.ruler/` directories). Don't edit the generated files — edit the `.ruler/**` source, run
`npm run ruler:apply`, and commit the regenerated output; CI fails on drift (`npm run ruler:check`).

## Adding a new icon

1. Drop an SVG into `web/src/lib/icons/`.
2. Run `npm run gen:icons` (it also runs automatically before every build).
3. Use `<Icon name="your-icon-name" />` — the `name` prop is type-checked against the generated
   union.

## Release process

See the `/release` slash command in `.claude/skills/release/SKILL.md`. The short version:
`npm run release` bumps the version, tags, and pushes; the `android-deploy.yml` CI workflow fires on
the tag.
