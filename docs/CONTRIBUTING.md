# Contributing to Splotch

## Where the backlog lives

Planned work — features, bugs, chores, tests — lives in
[GitHub Issues](https://github.com/kylemit/splotch/issues), the project's single backlog. To find
something to work on, filter open issues by label (`area:*`, `type:*`, `priority:*`). The issue
format, the full label glossary, and the triage/won't-do flow are documented in
[ISSUE-WORKFLOW.md](ISSUE-WORKFLOW.md). Reference the issue from your PR (`fixes #NN`) so it closes
on merge.

## Prerequisites

* **Node** via [nvm](https://github.com/nvm-sh/nvm) (or your version manager of choice) — any
  version satisfying the `engines` range in [`package.json`](../package.json); Capacitor 8 requires
  Node ≥ 22. Development is supported on macOS and Linux (ADR-0062).
  ```bash
  nvm use 22
  ```
* **pnpm** — the package manager (ADR-0119). Don't install it directly; `corepack enable pnpm` puts
  it on PATH at the exact version `package.json`'s `packageManager` field pins, and corepack is
  bundled with Node. `npm run <script>` still works against a pnpm-installed tree, so every
  `npm run …` in these docs is correct as written.
  ```bash
  corepack enable pnpm
  ```
  **Re-run that after every `nvm install`.** Corepack writes its shim into the *active* Node
  version's `bin/`, so a Node upgrade lands you in a shell where `pnpm: command not found` — the
  package manager is fine, the new Node just has no shim yet.

  **Never `npm install` or `npm ci` in this repo.** Neither errors — both give you a working flat
  `node_modules` — but both write a `package-lock.json` that resolves the tree independently of
  `pnpm-lock.yaml` and then drifts from it silently. Use `pnpm install`, or `pnpm add <pkg>` to add
  one. `package-lock.json` is gitignored so the mistake can't spread, and
  `tools/tests/package-manager.test.mjs` fails if any CI, hook, or bootstrap file starts installing
  with npm again.
* **Netlify CLI** (optional) — only needed to run the `/api/*` serverless functions locally via
  `npm run dev:netlify`. Install globally with `npm install -g netlify-cli`.
* For native Android/iOS work, see the full toolchain setup in the [mobile guide](MOBILE/native.md).
  (iOS needs macOS + full Xcode; no CocoaPods — the project uses Swift Package Manager.)

## Local setup

```bash
corepack enable pnpm   # once per machine
pnpm install
npm run dev       # http://localhost:5173
```

Two generators run automatically before every build (the `prebuild`/`prebuild:cap` hooks):

* `gen:icon-names` — generates `web/src/lib/components/icon-names.d.ts` from the SVG files in
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

**Where a variable goes is not a free choice** — it follows from who reads it, and the two groups
below load at different times. Getting this wrong fails silently: the variable is simply undefined
and the feature behaves as if you never set it.

### Server variables — Netlify env in production, `web/.env` locally

Read through `$env/dynamic/private` at request time, so `web/.env` works for all of them.
`web/.env.example` is the copy-to-`web/.env` template, with the one-time PAT setup steps.

| Variable                        | Read by                     | Purpose, and what breaks when unset                                                                                                  |
| ------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `ALLOWED_TOKENS_LIST`           | `server/tokens.ts`          | Comma-separated managed access tokens. A **one-time seed** into Blobs on first read, not the live list — `/admin` owns it after that |
| `ADMIN_ACCESS_TOKEN`            | `server/admin.ts`           | The `/admin` console secret, and the HMAC key for its derived session token                                                          |
| `OPENAI_API_KEY`                | `server/config.ts`          | The credential `/api/generate-image` bills hosted generation to. Unset ⇒ `/api/free-generation-grant` also 503s                      |
| `USAGE_GRANT_ID_SECRET`         | `server/usage.ts`           | HMAC key for opaque grant ids. Unset ⇒ generation works, but durable tallies and `/admin` usage stats are disabled                   |
| `GITHUB_ISSUE_TOKEN`            | `server/config.ts`          | Fine-grained PAT that files feedback as issues. Unset ⇒ `/api/report`, `/api/report-image`, and the `/feedback` form action all 503  |
| `GITHUB_ISSUE_REPO`             | `server/config.ts`          | Overrides the feedback repo (default `KyleMit/splotch-feedback`)                                                                     |
| `REPORT_TOKEN_SECRET`           | `server/reportToken.ts`     | Signs the report token bound to a generation. Unset ⇒ free-tier picture reports **and every refusal report** 503                     |
| `GENERATE_DEADLINE_MS_OVERRIDE` | `server/generationStart.ts` | Raises the synchronous generation deadline. The manual red-team suite is the only caller; production never sets it                   |

### Build and tooling variables — the shell only

These are read from `process.env` while the config module is evaluated, which happens **before Vite
loads any `.env` file**. An entry in `web/.env` or `web/.env.local` does nothing — set them inline
on the command (`PUBLIC_ENABLE_DEV_HARNESS=true npm run dev`) or export them.

| Variable                    | Read by                              | Purpose                                                                                                                          |
| --------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `CAPACITOR`                 | `svelte.config.js`, `vite.config.ts` | `true` switches to `adapter-static`, disables the PWA plugin, sets `__NATIVE_API_BASE__`                                         |
| `PUBLIC_ENABLE_DEV_HARNESS` | `vite.config.ts`                     | Compiles the `/dev/*` routes in, via the `__DEV_HARNESS__` literal                                                               |
| `PERF_MARKS`                | `vite.config.ts`                     | Compiles the engine's `performance.mark` instrumentation in, for `npm run perf:web`                                              |
| `TUNNEL_HOST`               | `vite.config.ts`                     | Adds the tunnel hostname to `server.allowedHosts` for cloud preview                                                              |
| `GEMINI_API_KEY`            | `tools/asset-gen/`, `model-eval`     | **Not read by the app.** These read `process.env` directly with no `.env` loading, so a `web/.env` entry needs `node --env-file` |

`REDTEAM_FIXTURE_KEY` is a third case: `tools/redteam/lib/fixture-crypto.mjs` calls
`process.loadEnvFile('.env')`, so it comes from a **repo-root** `.env` — not `web/.env`, not the
shell.

`web/playwright.shared.ts` declares the full private set the served app reads, with the
outbound-write credentials neutralised; it is the list to check against when adding a row here.

To test the AI flow locally, run `npm run dev:netlify` instead of `npm run dev` — this starts the
Netlify Dev server so the `/api/*` serverless functions are available. This requires the Netlify
CLI, which is installed globally (it is not a project dependency):

```bash
npm install -g netlify-cli
```

In production, AI access is granted per user: append one of the `ALLOWED_TOKENS_LIST` values to the
app URL as the `ai_access_token` query param (`AI_ACCESS_TOKEN_PARAM` in
`web/src/lib/inviteLink.ts`) — `https://splotch.art/?ai_access_token=YOUR_TOKEN`.

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
`package.json`/`node_modules`, and `tools/` stay at the repo root. `npm run dev:netlify` runs
`netlify dev --cwd web` so netlify-cli's file watcher is scoped to `web/` and never traverses the
large native trees (the cause of the `EMFILE` crash this layout fixes). All the npm scripts still
run from the repo root; the web toolchain is dispatched into `web/` by `tools/run-web-tool.mjs`.

> **Production deploy.** Netlify builds from the repo **root** (where `package.json` + the lockfile
> live). The root `netlify.toml` build command runs `npm run build` (which builds the app in `web/`)
> then `node tools/stage-netlify-functions.mjs`, which copies `web/.netlify → .netlify` so Netlify
> sees the SSR function in `.netlify/functions-internal`; static assets publish directly from
> `web/build`. Local `netlify dev` uses `web/netlify.toml` instead.

On native the AI button calls the **hosted** endpoint (`https://splotch.art/api/generate-image`) via
`__NATIVE_API_BASE__`. On web it uses a same-origin relative path.

To get the static build into the native projects (full toolchain setup, on-device testing, and the
store release flow live in the [mobile guide](MOBILE/native.md)):

```bash
npm run cap:sync       # static build + copy into the native projects
npm run cap:android    # also open the Android project in Android Studio
```

### Deployment

The web app deploys to Netlify, which builds automatically on push using the settings in
`netlify.toml` (see the production-deploy note above for how the root/`web/` layout is staged). A
manual deploy also works via the Netlify CLI: `netlify deploy --prod`.

## Type checking

```bash
npm run check          # svelte-check (one-shot)
npm run check:watch    # watch mode
npx tsc --noEmit       # TypeScript only
```

## Testing

```bash
npm test                   # unit + asset/store pipelines + repo-script + E2E (what CI runs on every push)
npm run test:unit:watch    # Vitest watch mode
npm run test:e2e:headed    # Playwright with browser visible (SLOWMO=500)
npm run test:e2e:ui        # Playwright UI mode
```

See the [testing guide](TESTING.md) for the full test strategy, including the native smoke tests
(`test:android`, `test:ios`).

## Dev routes

Run with `PUBLIC_ENABLE_DEV_HARNESS=true` in the environment (see above — a `.env` entry will not
work) to unlock:

| Route         | Purpose                                                         |
| ------------- | --------------------------------------------------------------- |
| `/dev`        | Index of the dev harnesses                                      |
| `/dev/engine` | Blank canvas with debug controls for testing the drawing engine |

The source of truth for this list is `web/src/routes/dev/`. The design-token styleguide is not a dev
harness — it ships as the public `/design` route (see the `design` skill).

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

**No framework overhead in `platform/index.ts`.** The platform detection module reads the Capacitor
global directly rather than importing `@capacitor/core`, so it evaluates safely during SSR without
pulling in native code.

**Formatting is enforced in CI** (ADR-0031, ADR-0057). Prettier formats source; dprint formats
markdown (asterisk bullets and emphasis, hard wrap at 100 — `dprint.json`). Run `npm run format`
before pushing, or install the recommended VS Code extensions (`.vscode/extensions.json`) to format
on save.

**Agent instruction files are generated** (ADR-0058). Every `CLAUDE.md`/`AGENTS.md` and most of the
`.claude/skills/` + `.agents/skills/` trees are generated by
[ruler](https://github.com/intellectronica/ruler) from `.ruler/`; managed runner-specific forks live
in `.ruler/skill-forks/<runner>/`. Don't edit generated files — edit their `.ruler/**` source, run
`npm run ruler:apply`, and commit the output; CI fails on drift (`npm run ruler:check`).

The direct-maintained exceptions are registered in `tools/ruler/lib/direct-provider-skills.mjs`
(`burn-down-audits`, `analyze-session-transcripts`, `run-rival-agent`, and the Codex-only
`implement-issue-stack`). Each registered Claude package and note lives under `.claude/`, each Codex
package and note under `.agents/`. They are independent provider implementations: edit only the
registered provider packages directly and never synchronize one from the other.

Claude Code's `Read(//tmp/**)` permission intentionally uses an absolute-path double slash so
sessions can read scratch files under `/tmp`. Do not change it to `Read(/tmp/**)`: that syntax is
project-relative, and the broad `/tmp` scope is deliberate for session scratch files.

## Images

* **Docs-only images** (README screenshots and the like) live in `docs/assets/`, committed as
  optimized `.webp` — never raw PNGs.
* **Shipped PNGs** under `web/static/` get a WebP sibling before committing:
  `node tools/asset-gen/convert-png-to-webp.mjs`.
* **Committed run outputs** (proof sheets, Lighthouse reports, model tests) belong in
  [`/scrapbook`](../scrapbook/README.md), not `docs/`.

## Adding a new icon

1. Drop an SVG into `web/src/lib/icons/`.
2. Run `npm run gen:icon-names` (it also runs automatically before every build).
3. Use `<Icon name="your-icon-name" />` — the `name` prop is type-checked against the generated
   union.

## Dependency updates

Dependabot opens weekly npm and github-actions PRs, and a workflow has Claude review each one and
post an approve-or-flag comment. That verdict is advisory — CI is still the gate, and a human still
merges. The setup requires one manual step (an OAuth token in the **Dependabot** secret store, not
the Actions one), and misconfigurations fail silently rather than loudly. See
[DEPENDABOT.md](DEPENDABOT.md).

## Release process

See [releases/README.md](../releases/README.md) for the authoritative procedure. Shipping has three
ordered phases:

1. The `cut-release` skill (`npm run release <version>`) creates the version bump, tag, notes, and
   an intentionally artifact-free GitHub Release.
2. The `build` skill (`npm run android:bundle` and `npm run ios:ipa`) produces the signed artifacts.
3. The `publish-artifacts` skill (`npm run release:publish`) verifies their embedded versions and
   attaches them to the GitHub Release.

The tag-triggered Android and iOS launch smoke workflows verify that the native apps start; they do
not build, upload, or deploy release artifacts.
