# Contributing to Splotch

## Prerequisites

- **Node 22** via [nvm-windows](https://github.com/coreybutler/nvm-windows) (or nvm on macOS/Linux). Capacitor 8 requires Node ≥ 22.
  ```bash
  nvm use 22
  ```
- **npm** (bundled with Node)
- **Netlify CLI** (optional) — only needed to run the `/api/*` serverless functions locally via `npm run dev:netlify`. Install globally with `npm install -g netlify-cli`.
- For native Android/iOS work, see the full toolchain setup in the [mobile guide](../.claude/skills/mobile/SKILL.md). (iOS needs macOS + full Xcode; no CocoaPods — the project uses Swift Package Manager.)

## Local setup

```bash
npm install
npm run dev       # http://localhost:5173
```

Two generators run automatically before every build (the `prebuild`/`prebuild:cap` hooks):

- `gen:icons` — generates `src/lib/components/icon-names.d.ts` from the SVG files in `src/lib/icons/`
- `gen:releases` — generates `src/lib/releases.json` and the fastlane store changelogs from `releases/*.md`

To see every npm script with a one-line description, run:

```bash
npm run info
```

The descriptions live in the `scripts-info` section of `package.json`; script naming follows ADR-0019.

## Environment variables

None are required for local development. The app works fully offline without any API keys.

| Variable | Where set | Purpose |
|---|---|---|
| `CAPACITOR=true` | build scripts | Switches to `adapter-static`, disables PWA plugin, sets `__NATIVE_API_BASE__` |
| `PUBLIC_ENABLE_DEV_HARNESS` | `.env.local` | Unlocks the `/dev/*` test routes in the browser |
| `AI_ACCESS_TOKENS` | Netlify env | Comma-separated list of valid AI invite tokens (server-only) |
| `ADMIN_PASSWORD` | Netlify env | Password for the `/admin` token console (server-only) |
| `GOOGLE_API_KEY` | Netlify env | Gemini API key for the hosted image generation endpoint (server-only) |

To test the AI flow locally, run `npm run dev:netlify` instead of `npm run dev` — this starts the Netlify Dev server so the `/api/*` serverless functions are available. This requires the Netlify CLI, which is installed globally (it is not a project dependency):

```bash
npm install -g netlify-cli
```

## The dual-build

Splotch ships as two distinct build targets from the same source:

| Target | Command | Adapter | Server routes |
|---|---|---|---|
| Web (Netlify) | `npm run build` | `adapter-netlify` | `/api/*`, `/admin` included |
| Native (Capacitor) | `npm run build:cap` | `adapter-static` | excluded (`strict: false`) |

The switch is the `CAPACITOR` env var, read by both `svelte.config.js` (adapter selection) and `vite.config.ts` (PWA plugin, `__NATIVE_API_BASE__`).

On native the AI button calls the **hosted** endpoint (`https://splotch.art/api/generate-image`) via `__NATIVE_API_BASE__`. On web it uses a same-origin relative path.

## Type checking

```bash
npm run check          # svelte-check (one-shot)
npm run check:watch    # watch mode
npx tsc --noEmit       # TypeScript only
```

## Testing

```bash
npm test                   # unit + E2E (what CI runs on every push)
npm run test:unit:watch    # Vitest watch mode
npm run test:e2e:headed    # Playwright with browser visible (SLOWMO=500)
npm run test:e2e:ui        # Playwright UI mode
```

See the [testing guide](../.claude/skills/testing/SKILL.md) for the full test strategy, including the native smoke tests (`test:android`, `test:ios`).

## Dev routes

Set `PUBLIC_ENABLE_DEV_HARNESS=true` in `.env.local` to unlock:

| Route | Purpose |
|---|---|
| `/dev/engine` | Blank canvas with debug controls for testing the drawing engine |
| `/dev/ai-timer` | Full AI round-trip with timing display; used by Playwright E2E specs |

## Code conventions

**Svelte 5 runes only.** Use `$state`, `$derived`, `$effect`, `$props`. No legacy stores (`writable`, `readable`).

**State lives in `src/lib/state/`**, not in components. Components read state and call setters; they don't own shared state.

**The drawing engine is imperative.** `src/lib/drawing/engine.ts` is a plain TypeScript module (not a Svelte store). Components wire into it via callbacks on mount and call its exported functions directly (`setColor`, `clearCanvas`, etc.).

**Svelte actions for complex gestures.** Drag interactions (drag-to-clear) and dialog wiring live in `src/lib/actions/`, not inline in components.

**No comments on obvious code.** Add a comment only when the *why* is non-obvious — a hidden constraint, a workaround, a subtle invariant. Don't describe what the code does; the names do that.

**Scoped styles.** Component styles go in the component's `<style>` block. Avoid global CSS except for genuine cross-component tokens. Use `:global()` sparingly and only when a class is set imperatively (e.g. via `classList`).

**No framework overhead in `platform.ts`.** The platform detection module reads the Capacitor global directly rather than importing `@capacitor/core`, so it evaluates safely during SSR without pulling in native code.

## Adding a new icon

1. Drop an SVG into `src/lib/icons/`.
2. Run `npm run gen:icons` (it also runs automatically before every build).
3. Use `<Icon name="your-icon-name" />` — the `name` prop is type-checked against the generated union.

## Release process

See the `/release` slash command in `.claude/commands/release.md`. The short version: `npm run release` bumps the version, tags, and pushes; the `android-deploy.yml` CI workflow fires on the tag.
