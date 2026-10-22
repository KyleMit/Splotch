# Contributing to Splotch

## Where the backlog lives

Planned work — features, bugs, chores, tests — lives in
[GitHub Issues](https://github.com/kylemit/splotch/issues), the project's single backlog. To find
something to work on, filter open issues by label (`area:*`, `type:*`, `priority:*`). The issue
format, the full label glossary, and the triage/won't-do flow are documented in
[ISSUE-WORKFLOW.md](ISSUE-WORKFLOW.md). Reference the issue from your PR (`fixes #NN`) so it closes
on merge.

## Prerequisites

* **Node** satisfying `package.json`'s `engines` range, via nvm or another version manager.
  Development supports macOS and Linux (ADR-0062); iOS builds need macOS and full Xcode.
* **pnpm** at the version pinned by `package.json` (ADR-0119). Run `corepack enable pnpm` after
  selecting Node, and again after each `nvm install`: the shim belongs to the active Node. Use
  `pnpm install` or `pnpm install --frozen-lockfile`; use `pnpm add` for dependency changes.
* The native toolchains in `docs/MOBILE/native.md`. React Native iOS uses CocoaPods and the
  committed workspace, not the retired Capacitor Swift Package Manager setup.

Never run `npm install` or `npm ci` in this repo. They create an independent package-lock tree that
can drift silently from `pnpm-lock.yaml`. **pnpm installs; npm runs**: every documented `npm run`
command is valid against the pnpm-installed tree.

## Local setup

```sh
corepack enable pnpm
pnpm install
npm run info
npm run build:site
```

Splotch is the Expo / React Native / React Strict DOM app in `` (ADR-0182). Root promotion is a
later cutover step. Shared TypeScript and hosted assets still live under `web/`; that directory no
longer holds a runnable SvelteKit application.

For a local review of the production web export, select an unused port with
`npm --silent run show:free-port`, then run:

```sh
node --experimental-strip-types e2e/server/serve.ts --port <unused-port>
```

The server combines the export and the real `/api` function on one loopback origin. Its environment
comes from `e2e/server/serverEnv.ts`, with an unusable model key and issue submission disabled. This
permits repeatable local UI/API review without a live model call. The plain Node function host is
`tools/lib/netlify-function-host.mjs`; there is no Netlify Dev or Svelte dev server to start.

For native iteration, follow `DEVELOPMENT.md`. Debug uses Metro from that app directory
(`npx expo start --port <unused-port>`); Release embeds its bundle. `npm run android:apk` builds the
development-identity Release APK, and `npm run ios:simulator` builds the unsigned Release simulator
app. The mobile guide owns store identities and signing.

Use `npm run info` before guessing a script. The `scripts-info` block in `package.json` explains
each command, and new or renamed commands need a matching description (ADR-0019).

### Dependencies and generated assets

The root pnpm lock and hoisted linker cover the app and tools; there is no second install inside the
app. Review Expo SDK alignment and native script provenance before changing dependencies (ADR-0119).

The root `dependencies`/`devDependencies` split follows the Netlify build (ADR-0070): packages the
production export/function build executes belong in `dependencies`; local/CI-only tools belong in
`devDependencies`. Netlify installs with `--prod`; CI installs everything. Run
`npm run lint:deps:prod` to catch a package that a full local install would hide.

`npm run gen:releases` produces shared release data and store changelogs from `releases/*.md`. RSD
token/icon projections have their own generators under `tools/migration/`; do not edit their
generated output as the source of truth. The retired Svelte `prebuild` hook is not responsible for
keeping the RN export's generated artifacts current.

## Environment variables

Drawing works without model credentials. The hosted `/api` function reads secrets through
`netlify/server/privateEnv.ts` from its process environment. Production values come from Netlify.
The plain Node host does **not** implicitly load `web/.env`; its caller supplies the environment.
The E2E host deliberately ignores shell/dotenv secrets.

| Variable                        | Server owner under `src/lib/` | Purpose                                                                   |
| ------------------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| `ALLOWED_TOKENS_LIST`           | `server/tokens.ts`            | One-time managed-code seed into Blobs; `/admin` owns subsequent edits.    |
| `ADMIN_ACCESS_TOKEN`            | `server/admin.ts`             | Admin secret and derived bearer-session signing key.                      |
| `OPENAI_API_KEY`                | `server/config.ts`            | Hosted generation credential; unavailable grants fail closed when absent. |
| `USAGE_GRANT_ID_SECRET`         | `server/usage.ts`             | Opaque grant IDs for durable usage tallies.                               |
| `GITHUB_ISSUE_TOKEN`            | `server/config.ts`            | Private feedback issue submission.                                        |
| `GITHUB_ISSUE_REPO`             | `server/config.ts`            | Overrides the feedback repository.                                        |
| `REPORT_TOKEN_SECRET`           | `server/reportToken.ts`       | Credential-bound generation/refusal report authorization.                 |
| `GENERATE_DEADLINE_MS_OVERRIDE` | `server/generationStart.ts`   | Explicit manual red-team deadline override; not production configuration. |

`e2e/server/serverEnv.ts` declares every private name the test-hosted function reads.
`tools/tests/e2e-server-env.test.mjs` catches an omitted name when a new server variable is added.
The `api` skill documents endpoint authorization and failure behavior.

### Tooling variables

Tools own their own credential loading; a variable in a dotenv file is not automatically exported.
Read the tool's guide before running it. In particular:

* `GEMINI_API_KEY` serves the offline asset-generation tools, not application generation.
* `npm run vectorize` reads Vectorizer credentials from the shell, root `.env` and `web/.env`; its
  guide is `tools/vectorize/README.md`.
* `npm run gen:sound-effect` reads `ELEVENLABS_API_KEY` from the shell, root `.env.local`, root
  `.env` and `web/.env`; its guide is `tools/elevenlabs/README.md`.
* Red-team fixture loading is owned by `tools/redteam/lib/fixture-crypto.mjs`.
* `EXPO_PUBLIC_SPLOTCH_PERF_PROBE` is an opt-in native Release build flag; follow the probe
  instructions in `DEVELOPMENT.md`, not a generic dotenv recipe.
* `COREPACK_HOME`, `npm_config_cache` and `PLAYWRIGHT_CHROMIUM` are machine/tool settings. Cloud
  cache and browser overrides in `docs/CLOUD/Codex.md` should not be copied into a local profile.

In production, a managed invite can be supplied with the `ai_access_token` query parameter
(`src/lib/inviteLink.ts`). Never commit credentials, private drawings or decrypted report data.

## Build and deployment

| Target                      | Command                  | Output / serving                                |
| --------------------------- | ------------------------ | ----------------------------------------------- |
| Web                         | `npm run build:site`     | `dist/web`, served by Netlify.                  |
| Android development Release | `npm run android:apk`    | RN `.dev` APK, separate from the store install. |
| Android store               | `npm run android:bundle` | Upload-key-signed AAB; manual store upload.     |
| iOS simulator               | `npm run ios:simulator`  | Unsigned Release simulator app.                 |
| iOS store                   | `npm run ios:ipa`        | Signed archive/export; manual store upload.     |

Root `netlify.toml` publishes the export and routes `/api/*` to `netlify/functions/api.ts`. Platform
file extensions choose native versus browser integrations. There is no `CAPACITOR` build flag,
static Svelte adapter or Svelte route harness. The public `/design` document is the web styleguide;
it is not a development route.

## Type checking and testing

```sh
npm run check
npm run lint
npm run check:quality
npm run test:browserless
SPLOTCH_E2E_PORT=<unused-port> npm run test:e2e -- smoke.spec.ts --workers=1
```

`npm run check` covers shared TypeScript, Netlify, RN and E2E projects. `check:quality` and
`test:browserless` mirror their CI jobs. `npm test` adds the full browser suite; native Maestro
smokes require an emulator/simulator and run separately. `docs/TESTING.md` owns the tier table,
authoring rules and native prerequisites. Full browser suites and native-device work are
host-exclusive; do not run them alongside another session's captures.

## Code conventions

`docs/CODING-STANDARDS.md` records each rule, its incident and its enforcement. Read it before
adding, relaxing or re-proposing a rule.

* State has one owner; call its methods rather than copying its rules into a component or test. The
  RN app's settings/product owners live under its `src/`; shared Svelte rune stores are retired.
* Platform variants resolve at build time. Keep native integration out of a browser import graph.
* Keep live stroke activity in the drawing subtree. Unrelated chrome must not commit on each contact
  update; mounted guards enforce this boundary.
* Use closed unions for finite vocabularies and validate untrusted inputs at the boundary.
* Comment only a non-obvious constraint. Name tuning constants and include their units.
* Style shared controls with RSD's design projection and platform adapters. Read the `design` skill
  before adding visual treatments; do not reintroduce Svelte scoped-style instructions.
* Prettier formats source and dprint formats Markdown (ADR-0031/0057). Format edited files and run
  `npm run format:check` before committing.

**Agent instruction files are generated** (ADR-0058). Every `CLAUDE.md`/`AGENTS.md` and most of the
`.claude/skills/` + `.agents/skills/` trees are generated by
[ruler](https://github.com/intellectronica/ruler) from `.ruler/`; managed runner-specific forks live
in `.ruler/skill-forks/<runner>/`. Don't edit generated files — edit their `.ruler/**` source, run
`npm run ruler:apply`, and commit the output; CI fails on drift (`npm run ruler:check`).

The direct-maintained exceptions, and the providers each ships for, are registered in
`tools/ruler/lib/direct-provider-skills.mjs`. Each registered Claude package and note lives under
`.claude/`, each Codex package and note under `.agents/`. They are independent provider
implementations: edit only the registered provider packages directly and never synchronize one from
the other.

Claude Code's `Read(//tmp/**)` permission intentionally uses an absolute-path double slash so
sessions can read scratch files under `/tmp`. Do not change it to `Read(/tmp/**)`: that syntax is
project-relative, and the broad `/tmp` scope is deliberate for session scratch files.

## Images and icons

* Documentation images belong in `docs/assets/` as optimized WebP. The old Svelte-canvas README hero
  generator is retired; preserve committed captures until a deliberate RN capture replaces them.
* Shipped PNG assets under `assets/static/` get a WebP sibling through
  `node tools/asset-gen/convert-png-to-webp.mjs`.
* Committed proof sheets and measurement reports belong in `scrapbook/` (`scrapbook/README.md`).
* Icon SVG sources remain in `assets/icons/`, with deferred-only art under `deferred/`.
  `tools/migration/gen-native-icons.mjs` projects them into the app; its
  `src/rsdDrawing/iconRegistry.ts` owns startup versus lazy registration. Keep unused page/settings
  art out of the drawing startup closure and verify the built startup budgets.

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
