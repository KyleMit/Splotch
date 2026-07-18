# Dependency Health

> Inventory and health assessment of Splotch's third-party dependencies, written by the
> `dependency-health-audit` skill (see `.claude/audit-conventions.md`). Refreshed in place — compare
> runs with `git log -p docs/DEPENDENCIES.md`. External facts are snapshots; each carries the date
> it was checked. This file records analysis only — upgrades are applied by
> `/dependency-update-audit`, and replacements are tracked as GitHub issues.

**Last refresh:** 2026-07-17 at `e2812b3` · 18 prod + 30 dev direct · 1167 total installed
(package-lock entries) · plus dev-lifecycle deps outside `package.json` (GitHub Actions,
runtime-fetched CLIs, system toolchains — see the final section)

## Verdict summary

Non-`keep` rows first.

| Package                             | Prod/Dev | Verdict                            |
| ----------------------------------- | -------- | ---------------------------------- |
| capacitor-set-version               | dev      | **investigate replacement**        |
| @capacitor/assets                   | dev      | **monitor** (dormant + vuln chain) |
| idb                                 | prod     | **monitor** (single maintainer)    |
| scripts-info                        | dev      | **monitor** (bus factor)           |
| @aparajita/capacitor-secure-storage | prod     | keep                               |
| @capacitor-community/media          | prod     | keep                               |
| @capacitor/android                  | prod     | keep                               |
| @capacitor/cli                      | prod     | keep                               |
| @capacitor/core                     | prod     | keep                               |
| @capacitor/device                   | prod     | keep                               |
| @capacitor/filesystem               | prod     | keep                               |
| @capacitor/haptics                  | prod     | keep                               |
| @capacitor/ios                      | prod     | keep                               |
| @capacitor/network                  | prod     | keep                               |
| @capacitor/preferences              | prod     | keep                               |
| @capacitor/screen-orientation       | prod     | keep                               |
| @capacitor/status-bar               | prod     | keep                               |
| @fontsource-variable/quicksand      | prod     | keep                               |
| @google/genai                       | prod     | keep                               |
| @netlify/blobs                      | prod     | keep                               |
| @sveltejs/adapter-static            | prod     | keep                               |
| @dprint/json                        | dev      | keep                               |
| @dprint/markdown                    | dev      | keep                               |
| @dprint/typescript                  | dev      | keep                               |
| @eslint/js                          | dev      | keep                               |
| @intellectronica/ruler              | dev      | keep                               |
| @playwright/test                    | dev      | keep                               |
| @sveltejs/adapter-netlify           | dev      | keep                               |
| @sveltejs/kit                       | dev      | keep                               |
| @sveltejs/vite-plugin-svelte        | dev      | keep                               |
| dprint                              | dev      | keep                               |
| eslint                              | dev      | keep                               |
| eslint-config-prettier              | dev      | keep                               |
| eslint-plugin-svelte                | dev      | keep                               |
| globals                             | dev      | keep                               |
| happy-dom                           | dev      | keep                               |
| marked                              | dev      | keep                               |
| prettier                            | dev      | keep                               |
| prettier-plugin-svelte              | dev      | keep                               |
| sharp                               | dev      | keep                               |
| svelte                              | dev      | keep                               |
| svelte-check                        | dev      | keep                               |
| svgo                                | dev      | keep                               |
| typescript                          | dev      | keep                               |
| typescript-eslint                   | dev      | keep                               |
| vite                                | dev      | keep                               |
| vite-plugin-pwa                     | dev      | keep                               |
| vitest                              | dev      | keep                               |

**Backlog items filed:**

* [`#332`](https://github.com/KyleMit/Splotch/issues/332) — `type:chore` + `area:infra` — *Replace
  archived `capacitor-set-version` in the release script.* Upstream repo is archived (read-only,
  last commit 2023-09-27, single maintainer); the package only edits native version numbers in
  `scripts/release.mjs`. Investigation question: is a small in-repo helper (edit
  `android/app/build.gradle` `versionName`/`versionCode` + iOS `MARKETING_VERSION`/
  `CURRENT_PROJECT_VERSION`) cheaper to own than a dormant dependency?

## Direct dependencies — production

### @aparajita/capacitor-secure-storage

* **Version:** `^8.0.0` declared · 8.0.0 locked · prod
* **Used for:** Keystore/Keychain-backed secure storage on native; wraps the access-code secret.
  Used in `web/src/lib/secureStorage.ts` (+ test).
* **Source:** npm ·
  [github.com/aparajita/capacitor-secure-storage](https://github.com/aparajita/capacitor-secure-storage)
  · published by Aparajita Fishman (ckgaparajita)
* **License:** MIT
* **Health** (checked 2026-07-17):
  [167 stars](https://github.com/aparajita/capacitor-secure-storage) · latest 8.0.0 on 2026-02-10 ·
  last push 2026-02-12 · 4 open issues · Capacitor-8-current
* **Maintenance:** active — single dedicated maintainer, tracks Capacitor majors promptly
* **Concerns:** single-maintainer bus factor, but small surface and current
* **Alternatives:** `@capacitor/preferences` (not encrypted) if requirements soften; none needed now
* **Verdict:** keep — encrypted-at-rest storage the app relies on; healthy and current

### @capacitor-community/media

* **Version:** `^9.1.0` declared · 9.1.0 locked · prod
* **Used for:** Saving rendered drawings to the device photo gallery on native. Used in
  `web/src/lib/drawing/screenshot.ts`.
* **Source:** npm ·
  [github.com/capacitor-community/media](https://github.com/capacitor-community/media) · published
  by the Capacitor Community org
* **License:** MIT (npm metadata; GitHub reports no SPDX id)
* **Health** (checked 2026-07-17): [135 stars](https://github.com/capacitor-community/media) ·
  latest 9.1.0 on 2026-03-27 · last push 2026-03-27 · 6 open issues · tracks Capacitor 9 line
* **Maintenance:** active — community-org backed, broad maintainer list
* **Concerns:** community plugin (best-effort), but low open-issue count and current with Capacitor
* **Alternatives:** `@capacitor/filesystem` + share sheet (already a dep) if this stalls
* **Verdict:** keep — the standard gallery-save plugin; healthy

### @capacitor/android

* **Version:** `^8.4.1` declared · 8.4.1 locked (latest 8.4.2) · prod
* **Used for:** The Android native runtime for the Capacitor app (`android/` project).
* **Source:** npm · [github.com/ionic-team/capacitor](https://github.com/ionic-team/capacitor) ·
  published by Ionic / OutSystems
* **License:** MIT
* **Health** (checked 2026-07-17): [16.1k stars](https://github.com/ionic-team/capacitor) · latest
  8.4.2 on 2026-07-14 · last push 2026-07-14 · 108 open issues · frequent releases
* **Maintenance:** active — org-backed, moves as a set with the other `@capacitor/*` cores
* **Concerns:** none
* **Alternatives:** none needed (moving off Capacitor is an ADR-0001 architecture decision, not a
  dep swap)
* **Verdict:** keep — core native runtime; healthy

### @capacitor/cli

* **Version:** `^8.4.1` declared · 8.4.1 locked (latest 8.4.2) · prod
* **Used for:** `cap sync`/`cap open`/`cap run` — the native build/sync toolchain (`cap:*`,
  `android:*`, `ios:*` scripts).
* **Source:** npm · [github.com/ionic-team/capacitor](https://github.com/ionic-team/capacitor) ·
  published by Ionic / OutSystems
* **License:** MIT
* **Health** (checked 2026-07-17): [16.1k stars](https://github.com/ionic-team/capacitor) · latest
  8.4.2 on 2026-07-14 · last push 2026-07-14 · frequent releases
* **Maintenance:** active
* **Concerns:** Bundles `tar@7.5.17`, flagged high by `npm audit` (path-traversal advisories, no
  upstream fix); the CLI runs locally against trusted project files, so exposure is low. (The former
  Windows gradlew patch was dropped with Windows dev support — ADR-0062.)
* **Alternatives:** none needed
* **Verdict:** keep — required native toolchain

### @capacitor/core

* **Version:** `^8.4.1` declared · 8.4.1 locked (latest 8.4.2) · prod
* **Used for:** The Capacitor JS bridge every plugin imports (`Capacitor`, `registerPlugin`); the
  native-branch runtime backbone.
* **Source:** npm · [github.com/ionic-team/capacitor](https://github.com/ionic-team/capacitor) ·
  published by Ionic / OutSystems
* **License:** MIT
* **Health** (checked 2026-07-17): [16.1k stars](https://github.com/ionic-team/capacitor) · latest
  8.4.2 on 2026-07-14 · last push 2026-07-14
* **Maintenance:** active
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — core bridge; healthy

### @capacitor/device

* **Version:** `^8.0.3` declared · 8.0.3 locked · prod
* **Used for:** Device/platform info on native (model, OS) for platform-conditional behavior.
* **Source:** npm ·
  [github.com/ionic-team/capacitor-plugins](https://github.com/ionic-team/capacitor-plugins) ·
  published by Ionic / OutSystems
* **License:** MIT
* **Health** (checked 2026-07-17): monorepo
  [670 stars](https://github.com/ionic-team/capacitor-plugins) · latest 8.0.3 on 2026-07-15 · last
  push 2026-07-16 · official plugins monorepo
* **Maintenance:** active
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — official plugin; healthy

### @capacitor/filesystem

* **Version:** `^8.1.2` declared · 8.1.2 locked · prod
* **Used for:** Reading/writing files on native (drawing export/import). Used in
  `web/src/lib/drawing/folderSave.ts` and related.
* **Source:** npm ·
  [github.com/ionic-team/capacitor-filesystem](https://github.com/ionic-team/capacitor-filesystem) ·
  published by Ionic / OutSystems
* **License:** MIT
* **Health** (checked 2026-07-17): [6 stars](https://github.com/ionic-team/capacitor-filesystem)
  (its own split-out repo; org backing, not community traction) · latest 8.1.2 on 2026-02-13 · last
  push 2026-07-13 · 30 open issues
* **Maintenance:** active — org-backed official plugin
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — official plugin; healthy

### @capacitor/haptics

* **Version:** `^8.0.2` declared · 8.0.2 locked · prod
* **Used for:** Haptic feedback on native interactions.
* **Source:** npm ·
  [github.com/ionic-team/capacitor-haptics](https://github.com/ionic-team/capacitor-haptics) ·
  published by Ionic / OutSystems
* **License:** MIT (npm; GitHub reports NOASSERTION on the license file)
* **Health** (checked 2026-07-17): official split-out repo (0 stars — org-backed, not
  traction-driven) · latest 8.0.2 on 2026-03-27 · last push 2026-06-30 · 8 open issues
* **Maintenance:** active — org-backed official plugin
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — official plugin; healthy

### @capacitor/ios

* **Version:** `^8.4.1` declared · 8.4.1 locked (latest 8.4.2) · prod
* **Used for:** The iOS native runtime for the Capacitor app (`ios/` project).
* **Source:** npm · [github.com/ionic-team/capacitor](https://github.com/ionic-team/capacitor) ·
  published by Ionic / OutSystems
* **License:** MIT
* **Health** (checked 2026-07-17): [16.1k stars](https://github.com/ionic-team/capacitor) · latest
  8.4.2 on 2026-07-14 · last push 2026-07-14
* **Maintenance:** active
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — core native runtime; healthy

### @capacitor/network

* **Version:** `^8.0.1` declared · 8.0.1 locked · prod
* **Used for:** Online/offline status on native for network-aware UI.
* **Source:** npm ·
  [github.com/ionic-team/capacitor-plugins](https://github.com/ionic-team/capacitor-plugins) ·
  published by Ionic / OutSystems
* **License:** MIT
* **Health** (checked 2026-07-17): monorepo
  [670 stars](https://github.com/ionic-team/capacitor-plugins) · latest 8.0.1 on 2026-02-12 ·
  monorepo last push 2026-07-16
* **Maintenance:** active
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — official plugin; healthy

### @capacitor/preferences

* **Version:** `^8.0.1` declared · 8.0.1 locked · prod
* **Used for:** Small key/value persistence on native (non-secret settings).
* **Source:** npm ·
  [github.com/ionic-team/capacitor-plugins](https://github.com/ionic-team/capacitor-plugins) ·
  published by Ionic / OutSystems
* **License:** MIT
* **Health** (checked 2026-07-17): monorepo
  [670 stars](https://github.com/ionic-team/capacitor-plugins) · latest 8.0.1 on 2026-02-12 ·
  monorepo last push 2026-07-16
* **Maintenance:** active
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — official plugin; healthy

### @capacitor/screen-orientation

* **Version:** `^8.0.1` declared · 8.0.1 locked · prod
* **Used for:** Locking/reading orientation on native (the drawing surface is orientation-aware).
* **Source:** npm ·
  [github.com/ionic-team/capacitor-plugins](https://github.com/ionic-team/capacitor-plugins) ·
  published by Ionic / OutSystems
* **License:** MIT
* **Health** (checked 2026-07-17): monorepo
  [670 stars](https://github.com/ionic-team/capacitor-plugins) · latest 8.0.1 on 2026-02-12 ·
  monorepo last push 2026-07-16
* **Maintenance:** active
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — official plugin; healthy

### @capacitor/status-bar

* **Version:** `^8.0.2` declared · 8.0.2 locked (latest 8.0.3) · prod
* **Used for:** Status-bar styling/visibility on native (immersive drawing UI).
* **Source:** npm ·
  [github.com/ionic-team/capacitor-plugins](https://github.com/ionic-team/capacitor-plugins) ·
  published by Ionic / OutSystems
* **License:** MIT
* **Health** (checked 2026-07-17): monorepo
  [670 stars](https://github.com/ionic-team/capacitor-plugins) · latest 8.0.3 on 2026-07-15 ·
  monorepo last push 2026-07-16
* **Maintenance:** active
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — official plugin; healthy

### @fontsource-variable/quicksand

* **Version:** `^5.2.10` declared · 5.2.10 locked · prod
* **Used for:** Self-hosted Quicksand variable font (the app's UI typeface), imported in
  `web/src/routes/+layout.svelte`.
* **Source:** npm · [github.com/fontsource/font-files](https://github.com/fontsource/font-files) ·
  published by the Fontsource project
* **License:** OFL-1.1 (the font); packaging MIT
* **Health** (checked 2026-07-17): [475 stars](https://github.com/fontsource/font-files) · latest
  5.2.10 on 2025-09-17 · monorepo last push 2026-06-07 · 46 open issues
* **Maintenance:** active — large font monorepo; individual font packages update on font revisions
* **Concerns:** none — low churn is expected for a stable font (done, not dormant)
* **Alternatives:** vendoring the woff2 directly if the pipeline ever changes; none needed
* **Verdict:** keep — self-hosted font asset; healthy

### @google/genai

* **Version:** `^2.10.0` declared · 2.10.0 locked (latest 2.12.0) · prod
* **Used for:** Gemini image generation and safety checks — the `/api/generate-image` server path
  and the asset-gen/model-eval tooling. Used in `web/src/lib/server/ai/gemini.ts`,
  `geminiSafety.ts`, `scripts/model-eval-*.mjs`.
* **Source:** npm · [github.com/googleapis/js-genai](https://github.com/googleapis/js-genai) ·
  published by Google
* **License:** Apache-2.0
* **Health** (checked 2026-07-17): [1.6k stars](https://github.com/googleapis/js-genai) · latest
  2.12.0 on 2026-07-16 · last push 2026-07-17 · 178 open issues · very frequent releases
* **Maintenance:** active — official Google SDK, near-daily activity
* **Concerns:** fast-moving SDK (frequent minors) — pin and update deliberately; has an install
  script
* **Alternatives:** REST calls to the Gemini API directly; none needed
* **Verdict:** keep — the official SDK for a core feature; healthy

### @netlify/blobs

* **Version:** `^10.7.9` declared · 10.7.9 locked · prod
* **Used for:** Netlify Blobs persistence for access tokens and usage counters (server routes). Used
  in `web/src/lib/server/tokens.ts`, `usage.ts` (+ tests).
* **Source:** npm · [github.com/netlify/primitives](https://github.com/netlify/primitives) ·
  published by Netlify
* **License:** MIT
* **Health** (checked 2026-07-17): monorepo [24 stars](https://github.com/netlify/primitives)
  (platform SDK, not traction-driven) · latest 10.7.9 on 2026-05-29 · last push 2026-07-17
* **Maintenance:** active — official Netlify platform SDK
* **Concerns:** `npm audit` flags a **moderate** advisory via the bundled `@netlify/otel` →
  `@opentelemetry/core` (unbounded-memory W3C Baggage). npm's only offered fix is a semver-major
  *downgrade* to blobs 10.1.0 — not viable; wait for an upstream otel bump. Server-side, org-backed.
* **Alternatives:** none needed (tied to the Netlify hosting platform, ADR-0001)
* **Verdict:** keep — platform storage SDK; healthy, advisory is transitive and pending upstream fix

### @sveltejs/adapter-static

* **Version:** `^3.0.10` declared · 3.0.10 locked · prod
* **Used for:** Static export for the native build (`CAPACITOR=true`), swapped in
  `web/svelte.config.js`. Listed as a prod dep because the native build pulls it.
* **Source:** npm · [github.com/sveltejs/kit](https://github.com/sveltejs/kit) · published by the
  Svelte team
* **License:** MIT
* **Health** (checked 2026-07-17): kit monorepo [20.7k stars](https://github.com/sveltejs/kit) ·
  latest 3.0.10 on 2025-10-02 · monorepo last push 2026-07-17
* **Maintenance:** active — moves as a set with `@sveltejs/kit`
* **Concerns:** a **low** `npm audit` advisory inherited from kit's `cookie@0.6.0` (see kit entry);
  fix is a kit bump, tracked by `/dependency-update-audit`
* **Alternatives:** none needed
* **Verdict:** keep — required for the native static target; healthy

### idb

* **Version:** `^8.0.3` declared · 8.0.3 locked · prod
* **Used for:** Promise-wrapped IndexedDB — local drawing/folder persistence and the web
  secure-storage fallback. Used in `web/src/lib/idb.ts`, `drawing/folderSave.ts`,
  `lib/secureStorage.ts`.
* **Source:** npm · [github.com/jakearchibald/idb](https://github.com/jakearchibald/idb) · published
  by Jake Archibald (jaffathecake)
* **License:** ISC
* **Health** (checked 2026-07-17): [7.4k stars](https://github.com/jakearchibald/idb) · latest 8.0.3
  on 2025-05-07 · last push 2025-05-07 · 57 open issues
* **Maintenance:** done-not-dead — single maintainer, no release in ~14 months, but a small stable
  zero-dep IndexedDB wrapper with a mature API; low churn is expected, not a red flag
* **Concerns:** single-maintainer bus factor; watch for a bug backlog forming or an IndexedDB spec
  change the wrapper can't keep up with
* **Alternatives:** raw IndexedDB, or `dexie` (heavier) if it ever goes truly unmaintained
* **Verdict:** monitor — healthy today, but track release/issue activity given the single maintainer
  and long quiet stretch

## Direct dependencies — development

### @capacitor/assets

* **Version:** `^3.0.5` declared · 3.0.5 locked · dev
* **Used for:** Generating native app icons and splash screens (`@capacitor/assets` CLI, run
  occasionally when brand assets change).
* **Source:** npm ·
  [github.com/ionic-team/capacitor-assets](https://github.com/ionic-team/capacitor-assets) ·
  published by Ionic / OutSystems
* **License:** MIT
* **Health** (checked 2026-07-17): [583 stars](https://github.com/ionic-team/capacitor-assets) ·
  latest 3.0.5 on 2024-03-29 (no release in ~2.3 years) · last push 2026-01-22 · 84 open issues
* **Maintenance:** dormant — repo not archived and occasionally touched, but no published release
  since early 2024 while issues accumulate
* **Concerns:** **entangled** — `package.json` `overrides` pins its transitive `sharp` to the root
  `$sharp` (proxy-blocked libvips download in cloud sessions). It also bundles an ancient
  `@capacitor/cli@5.7.8` and `@trapezedev/project@7.1.4`, which drag in the **high-severity** vuln
  chain `npm audit` reports (`tar@6`, `minimatch@3/8`, `uuid@7`, `replace`, `xcode`) with **no
  upstream fix**. Exposure is low: dev-only, run locally by a trusted operator, not in the shipped
  app or CI runtime.
* **Alternatives:** hand-authoring the icon/splash set (they change rarely), or
  `@trapezedev/configure` (same org, same staleness). No clearly-better maintained successor exists.
* **Verdict:** monitor — keep for now (no viable replacement, low real risk), but watch for archival
  or a security advisory that reaches the runtime; the `sharp` override must survive any bump

### @dprint/json

* **Version:** `^0.23.0` declared · 0.23.0 locked · dev
* **Used for:** dprint's JSON formatting plugin (wasm), referenced by `dprint.json`.
* **Source:** npm ·
  [github.com/dprint/dprint-plugin-json](https://github.com/dprint/dprint-plugin-json) · published
  by David Sherret (dsherret)
* **License:** MIT
* **Health** (checked 2026-07-17): [28 stars](https://github.com/dprint/dprint-plugin-json) · latest
  0.23.0 on 2026-07-07 · last push 2026-07-07
* **Maintenance:** active — same author as dprint itself
* **Concerns:** single-maintainer ecosystem (all dprint plugins), but consistently maintained
* **Alternatives:** Prettier for JSON (already present) — but the split is deliberate (ADR-0057)
* **Verdict:** keep — part of the dprint formatting stack; healthy

### @dprint/markdown

* **Version:** `^0.22.1` declared · 0.22.1 locked · dev
* **Used for:** dprint's Markdown formatting plugin (wasm) — owns `*.md` formatting (ADR-0057).
* **Source:** npm ·
  [github.com/dprint/dprint-plugin-markdown](https://github.com/dprint/dprint-plugin-markdown) ·
  published by David Sherret (dsherret)
* **License:** MIT
* **Health** (checked 2026-07-17): [54 stars](https://github.com/dprint/dprint-plugin-markdown) ·
  latest 0.22.1 on 2026-05-22 · last push 2026-07-07 · 48 open issues
* **Maintenance:** active
* **Concerns:** single-maintainer ecosystem
* **Alternatives:** Prettier for Markdown (rejected in ADR-0057)
* **Verdict:** keep — the Markdown formatter of record; healthy

### @dprint/typescript

* **Version:** `^0.96.1` declared · 0.96.1 locked · dev
* **Used for:** dprint's TypeScript/JS plugin (wasm), referenced by `dprint.json`.
* **Source:** npm ·
  [github.com/dprint/dprint-plugin-typescript](https://github.com/dprint/dprint-plugin-typescript) ·
  published by David Sherret (dsherret)
* **License:** MIT
* **Health** (checked 2026-07-17): [283 stars](https://github.com/dprint/dprint-plugin-typescript) ·
  latest 0.96.1 on 2026-05-20 · last push 2026-07-07 · 244 open issues
* **Maintenance:** active
* **Concerns:** single-maintainer ecosystem
* **Alternatives:** Prettier (owns code formatting per ADR-0057 — this plugin is for dprint's own
  JSON/md config passes)
* **Verdict:** keep — part of the dprint stack; healthy

### @eslint/js

* **Version:** `^10.0.1` declared · 10.0.1 locked · dev
* **Used for:** ESLint's recommended JS config, imported in `eslint.config.js`.
* **Source:** npm · [github.com/eslint/eslint](https://github.com/eslint/eslint) · published by the
  OpenJS Foundation
* **License:** MIT
* **Health** (checked 2026-07-17): [27.4k stars](https://github.com/eslint/eslint) · latest 10.0.1
  on 2026-02-06 · last push 2026-07-17
* **Maintenance:** active — foundation-backed (versioned with eslint)
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — flat-config base; healthy

### @intellectronica/ruler

* **Version:** `0.3.44` declared (pinned, no caret) · 0.3.44 locked · dev
* **Used for:** Generating all agent instruction files (`CLAUDE.md`/`AGENTS.md`, skills) from
  `.ruler/` sources (ADR-0058) — `ruler:apply`/`ruler:check`.
* **Source:** npm · [github.com/intellectronica/ruler](https://github.com/intellectronica/ruler) ·
  published by Eleanor Berger (intellectronica)
* **License:** MIT
* **Health** (checked 2026-07-17): [2.8k stars](https://github.com/intellectronica/ruler) · latest
  0.3.44 on 2026-06-30 · last push 2026-07-16 · 6 open issues
* **Maintenance:** active — pre-1.0 but frequent releases and low issue backlog
* **Concerns:** pinned exactly (deliberate — pre-1.0 tool, avoid surprise regen churn). A
  **moderate** `npm audit` advisory (`js-yaml` quadratic-DoS) enters transitively through ruler;
  dev-only, runs on the repo's own trusted YAML.
* **Alternatives:** none needed (the repo's chosen instruction-generation tool)
* **Verdict:** keep — core to the agent-instruction workflow; healthy, keep the pin

### @playwright/test

* **Version:** `^1.61.1` declared · 1.61.1 locked · dev
* **Used for:** E2E tests and the perf/screenshot harnesses (`test:e2e`, `perf:*`, `gen:shots`).
* **Source:** npm · [github.com/microsoft/playwright](https://github.com/microsoft/playwright) ·
  published by Microsoft
* **License:** Apache-2.0
* **Health** (checked 2026-07-17): [93k stars](https://github.com/microsoft/playwright) · latest
  1.61.1 on 2026-06-23 · last push 2026-07-17 · 163 open issues
* **Maintenance:** active — Microsoft-backed, frequent releases
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — E2E and tooling backbone; healthy

### @sveltejs/adapter-netlify

* **Version:** `^6.0.4` declared · 6.0.4 locked · dev
* **Used for:** The web (SSR + `/api`) build target for splotch.art, swapped in
  `web/svelte.config.js`.
* **Source:** npm · [github.com/sveltejs/kit](https://github.com/sveltejs/kit) · published by the
  Svelte team
* **License:** MIT
* **Health** (checked 2026-07-17): kit monorepo [20.7k stars](https://github.com/sveltejs/kit) ·
  latest 6.0.4 on 2026-02-24 · monorepo last push 2026-07-17
* **Maintenance:** active — moves as a set with kit
* **Concerns:** inherits kit's **low** `cookie` advisory; bundles its own `esbuild` (install script)
* **Alternatives:** none needed
* **Verdict:** keep — required for the web target; healthy

### @sveltejs/kit

* **Version:** `^2.68.0` declared · 2.68.0 locked (latest 2.70.0) · dev
* **Used for:** The application framework (routing, SSR, endpoints) — the whole `web/` app.
* **Source:** npm · [github.com/sveltejs/kit](https://github.com/sveltejs/kit) · published by the
  Svelte team
* **License:** MIT
* **Health** (checked 2026-07-17): [20.7k stars](https://github.com/sveltejs/kit) · latest 2.70.0 on
  2026-07-17 · last push 2026-07-17 · 938 open issues (large active project)
* **Maintenance:** active — core Svelte framework, near-daily activity
* **Concerns:** a **low** `npm audit` advisory via `cookie@0.6.0` (OOB characters); fixed by a kit
  bump — hand to `/dependency-update-audit`. Part of the coordinated Svelte/Vite upgrade set.
* **Alternatives:** none needed (framework choice, ADR-0001)
* **Verdict:** keep — the framework; healthy, one pending minor bump clears the advisory

### @sveltejs/vite-plugin-svelte

* **Version:** `^7.1.2` declared · 7.1.2 locked (latest 7.2.0) · dev
* **Used for:** Svelte compilation inside Vite (`web/vite.config.ts` via kit).
* **Source:** npm ·
  [github.com/sveltejs/vite-plugin-svelte](https://github.com/sveltejs/vite-plugin-svelte) ·
  published by the Svelte team
* **License:** MIT
* **Health** (checked 2026-07-17): [1k stars](https://github.com/sveltejs/vite-plugin-svelte) ·
  latest 7.2.0 on 2026-07-07 · last push 2026-07-17 · 23 open issues
* **Maintenance:** active — moves with the Svelte/Vite set
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — required Svelte/Vite glue; healthy

### capacitor-set-version

* **Version:** `^2.2.0` declared · 2.2.0 locked · dev
* **Used for:** Bumping native app version numbers during release, in `scripts/release.mjs`.
* **Source:** npm ·
  [github.com/HausennTechnologies/capacitor-set-version](https://github.com/HausennTechnologies/capacitor-set-version)
  · published by David Krepsky (dkrepsky)
* **License:** MIT
* **Health** (checked 2026-07-17):
  [35 stars](https://github.com/HausennTechnologies/capacitor-set-version) · latest 2.2.0 on
  2023-09-27 (no release in ~2.8 years) · **repo archived (read-only)** · last commit 2023-09-27 ·
  30 open issues
* **Maintenance:** abandoned — upstream explicitly archived; issues frozen
* **Concerns:** archived single-maintainer package on the release path; no security advisories
  today, but no future fixes are possible, and it must keep parsing Capacitor's native project files
  as those evolve
* **Alternatives:** a small in-repo helper that edits `android/app/build.gradle`
  (`versionName`/`versionCode`) and the iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` — the same
  two edits this package makes. Low effort, removes an abandoned dependency from the
  release-critical path.
* **Verdict:** investigate replacement — upstream is archived; scope the in-repo helper (proposed
  backlog item above). Not urgent (release-only, not shipped), but the clearest replace candidate.

### dprint

* **Version:** `^0.55.1` declared · 0.55.1 locked (latest 0.55.2) · dev
* **Used for:** The Markdown/JSON formatter engine (`format:md`, ADR-0057); runs the `@dprint/*`
  plugins.
* **Source:** npm · [github.com/dprint/dprint](https://github.com/dprint/dprint) · published by
  David Sherret (dsherret)
* **License:** MIT
* **Health** (checked 2026-07-17): [4k stars](https://github.com/dprint/dprint) · latest 0.55.2 on
  2026-07-14 · last push 2026-07-14 · 91 open issues
* **Maintenance:** active
* **Concerns:** single maintainer, but steady multi-year cadence; has an install script (fetches the
  platform binary)
* **Alternatives:** Prettier-only (rejected, ADR-0057)
* **Verdict:** keep — the formatter engine; healthy

### eslint

* **Version:** `^10.5.0` declared · 10.5.0 locked (latest 10.7.0) · dev
* **Used for:** Linting the whole repo (flat config, runes-only enforcement) — `lint`/`lint:fix`.
* **Source:** npm · [github.com/eslint/eslint](https://github.com/eslint/eslint) · published by the
  OpenJS Foundation
* **License:** MIT
* **Health** (checked 2026-07-17): [27.4k stars](https://github.com/eslint/eslint) · latest 10.7.0
  on 2026-07-10 · last push 2026-07-17 · 110 open issues
* **Maintenance:** active — foundation-backed
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — linter; healthy

### eslint-config-prettier

* **Version:** `^10.1.8` declared · 10.1.8 locked · dev
* **Used for:** Disabling ESLint rules that conflict with Prettier, in `eslint.config.js`.
* **Source:** npm ·
  [github.com/prettier/eslint-config-prettier](https://github.com/prettier/eslint-config-prettier) ·
  published by the Prettier team
* **License:** MIT
* **Health** (checked 2026-07-17): [5.9k stars](https://github.com/prettier/eslint-config-prettier)
  · latest 10.1.8 on 2025-07-18 · last push 2026-03-01 · 21 open issues
* **Maintenance:** active — low churn is expected (it tracks Prettier's rule surface)
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — lint/format interop; healthy

### eslint-plugin-svelte

* **Version:** `^3.19.0` declared · 3.19.0 locked (latest 3.20.0) · dev
* **Used for:** Svelte-specific lint rules, imported in `eslint.config.js`.
* **Source:** npm ·
  [github.com/sveltejs/eslint-plugin-svelte](https://github.com/sveltejs/eslint-plugin-svelte) ·
  published by the Svelte team / ota-meshi
* **License:** MIT
* **Health** (checked 2026-07-17): [399 stars](https://github.com/sveltejs/eslint-plugin-svelte) ·
  latest 3.20.0 on 2026-06-26 · last push 2026-07-16 · 138 open issues
* **Maintenance:** active
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — Svelte linting; healthy

### globals

* **Version:** `^17.7.0` declared · 17.7.0 locked · dev
* **Used for:** Predefined global identifiers for the ESLint flat config (`globals.browser`,
  `globals.node`) in `eslint.config.js`.
* **Source:** npm · [github.com/sindresorhus/globals](https://github.com/sindresorhus/globals) ·
  published by Sindre Sorhus
* **License:** MIT
* **Health** (checked 2026-07-17): [597 stars](https://github.com/sindresorhus/globals) · latest
  17.7.0 on 2026-06-22 · last push 2026-07-01 · 11 open issues
* **Maintenance:** active — data package, updates as environments add globals
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — lint config data; healthy

### happy-dom

* **Version:** `^20.10.6` declared · 20.10.6 locked · dev
* **Used for:** The DOM environment for Vitest unit tests, configured in `web/vitest.config.ts`.
* **Source:** npm · [github.com/capricorn86/happy-dom](https://github.com/capricorn86/happy-dom) ·
  published by David Ortner (capricorn86)
* **License:** MIT
* **Health** (checked 2026-07-17): [4.6k stars](https://github.com/capricorn86/happy-dom) · latest
  20.10.6 on 2026-06-17 · last push 2026-06-23 · 351 open issues
* **Maintenance:** active — frequent releases, though a sizeable open-issue backlog for a
  primarily-single-maintainer project
* **Concerns:** high open-issue count relative to maintainer capacity; watch that test-relevant bugs
  get addressed
* **Alternatives:** `jsdom` (heavier, more complete) is the standard fallback if happy-dom stalls
* **Verdict:** keep — the test DOM; healthy, jsdom is a known escape hatch

### marked

* **Version:** `^18.0.5` declared · 18.0.5 locked (latest 18.0.6) · dev
* **Used for:** Rendering release-notes Markdown to HTML in `scripts/generate-releases.mjs`.
* **Source:** npm · [github.com/markedjs/marked](https://github.com/markedjs/marked) · published by
  the MarkedJS org
* **License:** MIT (GitHub reports NOASSERTION — non-SPDX-standard license file)
* **Health** (checked 2026-07-17): [37k stars](https://github.com/markedjs/marked) · latest 18.0.6
  on 2026-07-09 · last push 2026-07-15 · 14 open issues
* **Maintenance:** active — org-maintained, low issue backlog
* **Concerns:** none (build-time only, trusted input)
* **Alternatives:** `markdown-it` if features are ever needed; none needed
* **Verdict:** keep — build-time Markdown rendering; healthy

### prettier

* **Version:** `^3.8.4` declared · 3.8.4 locked (latest 3.9.5) · dev
* **Used for:** Formatting source (JS/TS/Svelte/CSS) — owns code formatting (ADR-0057);
  `format`/`format:check`.
* **Source:** npm · [github.com/prettier/prettier](https://github.com/prettier/prettier) · published
  by the Prettier team
* **License:** MIT
* **Health** (checked 2026-07-17): [52k stars](https://github.com/prettier/prettier) · latest 3.9.5
  on 2026-07-09 · last push 2026-07-17 · 1.4k open issues (large active project)
* **Maintenance:** active
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — code formatter of record; healthy

### prettier-plugin-svelte

* **Version:** `^4.1.1` declared · 4.1.1 locked · dev
* **Used for:** Prettier formatting for `.svelte` files.
* **Source:** npm ·
  [github.com/sveltejs/prettier-plugin-svelte](https://github.com/sveltejs/prettier-plugin-svelte) ·
  published by the Svelte team
* **License:** MIT
* **Health** (checked 2026-07-17): [814 stars](https://github.com/sveltejs/prettier-plugin-svelte) ·
  latest 4.1.1 on 2026-06-15 · last push 2026-06-15 · 54 open issues
* **Maintenance:** active
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — Svelte formatting; healthy

### scripts-info

* **Version:** `^1.0.5` declared · 1.0.5 locked · dev
* **Used for:** The `npm run info` script listing (reads the `scripts-info` block in
  `package.json`).
* **Source:** npm (no repository URL in metadata) · published by **kylemit** (the Splotch
  maintainer)
* **License:** MIT
* **Health** (checked 2026-07-17): latest 1.0.5 on 2026-06-12 · no linked repo, so upstream activity
  can't be tracked from GitHub
* **Maintenance:** self-published — the package is under the repo owner's own npm account, so its
  fate is in-house rather than dependent on an external maintainer
* **Concerns:** no public repo linked from npm (provenance/history opaque to outside review); bus
  factor of one, but that one is the project owner
* **Alternatives:** inline the script-listing logic (it's a thin reader of the `scripts-info`
  object) if the standalone package ever becomes a burden
* **Verdict:** monitor — effectively an in-house utility; low risk, but add a `repository` field
  upstream so the entry can be verified like any other dep

### sharp

* **Version:** `^0.35.2` declared · 0.35.2 locked (latest 0.35.3) · dev
* **Used for:** Image processing in the asset-gen pipeline, and the `$sharp` override target that
  pins `@capacitor/assets`' transitive sharp (proxy-blocked libvips download in cloud sessions).
* **Source:** npm · [github.com/lovell/sharp](https://github.com/lovell/sharp) · published by Lovell
  Fuller (lovell)
* **License:** Apache-2.0
* **Health** (checked 2026-07-17): [32.5k stars](https://github.com/lovell/sharp) · latest 0.35.3 on
  2026-07-01 · last push 2026-07-16 · 110 open issues
* **Maintenance:** active — long-standing, well-funded, frequent releases
* **Concerns:** **entangled** — the `overrides` `$sharp` pin (above) means bumping sharp also moves
  `@capacitor/assets`' copy; keep them coherent. Has an install script (prebuilt libvips binary).
* **Alternatives:** none needed
* **Verdict:** keep — core image processing and the override anchor; healthy

### svelte

* **Version:** `^5.56.4` declared · 5.56.4 locked (latest 5.56.6) · dev
* **Used for:** The UI framework/compiler (runes-only, per repo conventions) — the whole app.
* **Source:** npm · [github.com/sveltejs/svelte](https://github.com/sveltejs/svelte) · published by
  the Svelte team
* **License:** MIT
* **Health** (checked 2026-07-17): [87.6k stars](https://github.com/sveltejs/svelte) · latest 5.56.6
  on 2026-07-16 · last push 2026-07-16 · 1.1k open issues (large active project)
* **Maintenance:** active — flagship framework, near-daily activity
* **Concerns:** none — moves as a coordinated set with kit/vite-plugin-svelte
* **Alternatives:** none needed (framework choice, ADR-0001)
* **Verdict:** keep — the UI framework; healthy

### svelte-check

* **Version:** `^4.7.1` declared · 4.7.1 locked (latest 4.7.3) · dev
* **Used for:** Type/diagnostic checking of Svelte + TS (`check`/`check:watch`).
* **Source:** npm · [github.com/sveltejs/language-tools](https://github.com/sveltejs/language-tools)
  · published by the Svelte team
* **License:** MIT
* **Health** (checked 2026-07-17): [1.4k stars](https://github.com/sveltejs/language-tools) · latest
  4.7.3 on 2026-07-15 · last push 2026-07-15 · 278 open issues
* **Maintenance:** active
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — the type-check gate; healthy

### svgo

* **Version:** `^4.0.1` declared · 4.0.1 locked (latest 4.0.2) · dev
* **Used for:** Optimizing shipped/inlined SVGs (`img:audit`/`img:audit:check`).
* **Source:** npm · [github.com/svg/svgo](https://github.com/svg/svgo) · published by the SVGO team
* **License:** MIT
* **Health** (checked 2026-07-17): [22.6k stars](https://github.com/svg/svgo) · latest 4.0.2 on
  2026-07-11 · last push 2026-07-11 · 243 open issues
* **Maintenance:** active — recently shipped a 4.x major
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — SVG optimizer; healthy

### typescript

* **Version:** `^6.0.3` declared · 6.0.3 locked (latest 7.0.2) · dev
* **Used for:** The TypeScript compiler/type system across the repo (`check`, build type-strip).
* **Source:** npm · [github.com/microsoft/TypeScript](https://github.com/microsoft/TypeScript) ·
  published by Microsoft
* **License:** Apache-2.0
* **Health** (checked 2026-07-17): [109.9k stars](https://github.com/microsoft/TypeScript) · latest
  7.0.2 on 2026-07-08 · last push 2026-07-08 · 5k open issues (large active project)
* **Maintenance:** active — Microsoft-backed
* **Concerns:** none for health. **TS 7 (the native/Go compiler rewrite) is now latest** while the
  repo is on 6.x — a major-version update to evaluate, not a health risk. Hand to
  `/dependency-update-audit`; verify svelte-check / typescript-eslint compatibility before moving.
* **Alternatives:** none needed
* **Verdict:** keep — the type system; healthy (TS7 migration is an update decision, tracked
  elsewhere)

### typescript-eslint

* **Version:** `^8.62.0` declared · 8.62.0 locked (latest 8.64.0) · dev
* **Used for:** TypeScript ESLint integration (parser + rules), imported in `eslint.config.js`.
* **Source:** npm ·
  [github.com/typescript-eslint/typescript-eslint](https://github.com/typescript-eslint/typescript-eslint)
  · published by the typescript-eslint team
* **License:** MIT
* **Health** (checked 2026-07-17):
  [16.3k stars](https://github.com/typescript-eslint/typescript-eslint) · latest 8.64.0 on
  2026-07-13 · last push 2026-07-17 · 281 open issues
* **Maintenance:** active
* **Concerns:** couples TypeScript and ESLint majors — a TS7 move must check this package's support
  first
* **Alternatives:** none needed
* **Verdict:** keep — TS linting; healthy

### vite

* **Version:** `^8.1.0` declared · 8.1.0 locked (latest 8.1.5) · dev
* **Used for:** The build tool / dev server underpinning SvelteKit (`web/vite.config.ts`).
* **Source:** npm · [github.com/vitejs/vite](https://github.com/vitejs/vite) · published by the Vite
  team (VoidZero)
* **License:** MIT
* **Health** (checked 2026-07-17): [82k stars](https://github.com/vitejs/vite) · latest 8.1.5 on
  2026-07-16 · last push 2026-07-17 · 720 open issues
* **Maintenance:** active — VoidZero-backed, very frequent releases
* **Concerns:** none — part of the coordinated Svelte/Vite upgrade set
* **Alternatives:** none needed
* **Verdict:** keep — the build tool; healthy

### vite-plugin-pwa

* **Version:** `^1.3.0` declared · 1.3.0 locked · dev
* **Used for:** Service-worker / PWA manifest generation for the web target (`web/vite.config.ts`).
* **Source:** npm ·
  [github.com/vite-pwa/vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) · published by
  the vite-pwa team (antfu et al.)
* **License:** MIT
* **Health** (checked 2026-07-17): [4.2k stars](https://github.com/vite-pwa/vite-plugin-pwa) ·
  latest 1.3.0 on 2026-05-05 · last push 2026-05-05 · 184 open issues
* **Maintenance:** active — reached 1.0; steady cadence
* **Concerns:** none
* **Alternatives:** hand-rolled service worker; none needed
* **Verdict:** keep — PWA build support; healthy

### vitest

* **Version:** `^4.1.9` declared · 4.1.9 locked (latest 4.1.10) · dev
* **Used for:** The unit-test runner (app + asset-gen suites) — `test:unit`, `test:asset-gen`.
* **Source:** npm · [github.com/vitest-dev/vitest](https://github.com/vitest-dev/vitest) · published
  by the Vitest team
* **License:** MIT
* **Health** (checked 2026-07-17): [16.9k stars](https://github.com/vitest-dev/vitest) · latest
  4.1.10 on 2026-07-06 · last push 2026-07-17 · 423 open issues
* **Maintenance:** active — shares maintainers with Vite
* **Concerns:** none — versioned alongside Vite
* **Alternatives:** none needed
* **Verdict:** keep — the test runner; healthy

## Transitive dependencies

The lockfile installs **1179 package entries** total (including the root); ~50 are direct, the rest
transitive. Aggregate view (not per-package):

### `npm audit` summary (checked 2026-07-17)

19 advisories: **4 low, 9 moderate, 6 high, 0 critical**. Mapped transitive → direct parent:

| Advisory (severity)                         | Transitive chain                                                                | Direct parent                         | Fix status                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `tar` path traversal (**high**)             | `tar` ← `@capacitor/cli@8.4.1`; also `tar@6` ← bundled `@capacitor/cli@5.7.8`   | `@capacitor/cli`, `@capacitor/assets` | no upstream fix — dev/CLI-local, trusted files                                                 |
| `minimatch` ReDoS (**high**)                | `minimatch@3/8` ← `@trapezedev/project` / bundled old cli ← `@capacitor/assets` | `@capacitor/assets`                   | no upstream fix — dev-only, dormant tool                                                       |
| `replace` → `minimatch` (**high**)          | `replace` ← `@trapezedev/project` ← `@capacitor/assets`                         | `@capacitor/assets`                   | no upstream fix                                                                                |
| `@trapezedev/project` (**high**)            | ← `@capacitor/assets`                                                           | `@capacitor/assets`                   | no upstream fix                                                                                |
| `js-yaml` quadratic DoS (**moderate**)      | `js-yaml@3.14.2` ← `@intellectronica/ruler`                                     | `@intellectronica/ruler`              | fixable via ruler dep tree (dev-only, trusted YAML)                                            |
| `uuid` bounds check (**moderate**)          | `uuid@7` ← `xcode` ← `@trapezedev/project` ← `@capacitor/assets`                | `@capacitor/assets`                   | no upstream fix                                                                                |
| `xcode` → `uuid` (**moderate**)             | ← `@trapezedev/project` ← `@capacitor/assets`                                   | `@capacitor/assets`                   | no upstream fix                                                                                |
| `@opentelemetry/*` memory (**moderate** ×5) | `@opentelemetry/core` ← `@netlify/otel` ← `@netlify/blobs`                      | `@netlify/blobs`                      | only fix offered is a semver-major *downgrade* to blobs 10.1.0 — not viable; wait for upstream |
| `cookie` OOB chars (**low**)                | `cookie@0.6.0` ← `@sveltejs/kit`                                                | `@sveltejs/kit` (+ adapters)          | fixed by a kit minor bump → `/dependency-update-audit`                                         |

**Takeaway:** the six high-severity advisories all originate from **`@capacitor/assets`** (dev-only,
dormant, run locally) and **`@capacitor/cli`'s bundled `tar`** — none reach the shipped web/native
runtime, and none have an upstream fix. The only advisory clearable by a routine update is kit's
`cookie` (low). See `@capacitor/assets` and `@capacitor/cli` entries above.

### Deprecated transitives

None surfaced by install warnings or the direct-dep `npm view` spot checks (no `deprecated` flags on
any of the 50 direct packages).

### Packages with install scripts (`hasInstallScript`)

Supply-chain-relevant subset from the lockfile: `@google/genai` (direct prod), `dprint` (direct
dev), `sharp` (direct dev), `esbuild` (under `@sveltejs/adapter-netlify`), `protobufjs` (under
`@google/genai`), `fsevents` (macOS-only, under `vite`), and `yarn` (transitive tooling copy). All
are well-known, org- or foundation-backed packages; none are anomalous.

### Repo-entangled transitives

* **`sharp`** — pinned via `package.json` `overrides` (`@capacitor/assets` → `sharp: "$sharp"`) to
  the root direct `sharp`, because `@capacitor/assets`' own sharp tries a proxy-blocked libvips
  download in cloud sessions. Covered in the `sharp` and `@capacitor/assets` entries; keep the two
  coherent on any bump.

## Development lifecycle dependencies (outside `package.json`)

Not every dependency the project relies on is an npm package. CI workflows pull in **GitHub
Actions** (pinned by tag, resolved from the Actions marketplace, not the lockfile), several npm
scripts fetch **CLIs at runtime** (`npx …`, or a globally-installed tool), and the native builds
need **system toolchains** that no npm range governs. These carry the same provenance/health/pinning
questions as npm deps, so they're inventoried here — but versions come from workflow/script pins,
not `package-lock.json`.

### GitHub Actions (CI — `.github/workflows/`)

| Action                                   | Pin                             | Publisher                  | Health (checked 2026-07-17)                                                                                                                 | Verdict                                                                                                   |
| ---------------------------------------- | ------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `actions/checkout`                       | v7 · **v4** in `label-sync.yml` | GitHub (official)          | first-party, maintained                                                                                                                     | keep — **align the pin**: `label-sync.yml` is on `@v4` while every other workflow uses `@v7`              |
| `actions/setup-node`                     | v6                              | GitHub (official)          | first-party, maintained                                                                                                                     | keep                                                                                                      |
| `actions/setup-java`                     | v5                              | GitHub (official)          | first-party (used by `android-deploy.yml`, `distribution: temurin`, `java-version: 21`)                                                     | keep                                                                                                      |
| `actions/cache`                          | v6                              | GitHub (official)          | first-party, maintained                                                                                                                     | keep                                                                                                      |
| `actions/configure-pages`                | v5                              | GitHub (official)          | first-party (Pages deploy, `pages.yml`)                                                                                                     | keep                                                                                                      |
| `actions/upload-pages-artifact`          | v3                              | GitHub (official)          | first-party                                                                                                                                 | keep                                                                                                      |
| `actions/deploy-pages`                   | v4                              | GitHub (official)          | first-party                                                                                                                                 | keep                                                                                                      |
| `actions/upload-artifact`                | v7                              | GitHub (official)          | first-party                                                                                                                                 | keep                                                                                                      |
| `reactivecircus/android-emulator-runner` | v2                              | ReactiveCircus (3rd-party) | [1.3k stars](https://github.com/ReactiveCircus/android-emulator-runner) · last push 2026-07-05 · not archived · latest v2.38.0 · Apache-2.0 | keep — the de-facto standard emulator action; floating `@v2` tracks patches                               |
| `crazy-max/ghaction-github-labeler`      | v5                              | crazy-max (3rd-party)      | [166 stars](https://github.com/crazy-max/ghaction-github-labeler) · last push 2026-07-06 · not archived · **latest v6.0.0** · MIT           | monitor — well-maintained, but pinned `@v5` while `@v6` is out; evaluate the major bump (label-sync only) |

**Concerns:** the two third-party actions run with repo-write scope (emulator action executes build
steps; the labeler writes labels via `label-sync.yml`). Both are actively maintained and floated by
major tag. GitHub's own hardening advice is to pin third-party actions to a full commit SHA rather
than a moving tag — worth considering for `reactivecircus/*` and `crazy-max/*`, though the current
tag pins are conventional. No action pins to a SHA today.

### Runtime-fetched CLIs (npm scripts, not in `package.json`)

| Tool                           | Where                                                       | Source / provisioning                                                                                                                        | Verdict                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `netlify-cli`                  | `dev:netlify` (`netlify dev --cwd web`)                     | **global install** (`npm i -g netlify-cli`), deliberately not a project dep — `scripts/check-netlify-cli.mjs` guards its presence/login/link | keep — kept out of the tree on purpose (heavy CLI); the guard documents the requirement                                                               |
| `kill-port`                    | `dev:kill` (`npx kill-port 5173 8888`)                      | fetched on demand via `npx` (unpinned)                                                                                                       | monitor — unpinned `npx` fetch runs latest each time; a small dev-only convenience, but pin a version or vendor it if supply-chain strictness matters |
| `update-browserslist-db`       | `update:browserslist` (`npx update-browserslist-db@latest`) | fetched on demand via `npx`, explicitly `@latest`                                                                                            | keep — official browserslist maintenance tool; `@latest` is the documented invocation                                                                 |
| Playwright browsers (Chromium) | `test.yml` (`npx playwright install --with-deps chromium`)  | browser **binaries** downloaded by the `@playwright/test` package (in `package.json`); cached by lockfile version in CI                      | keep — versioned by the npm package; the binaries are a separate download, not a separate dep                                                         |

### System toolchains (native builds & tests — no npm range)

| Toolchain                    | Where                                              | Provisioning / pin                                                                                                                                      | Verdict                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js                      | all CI jobs, all local dev                         | `actions/setup-node@v6` pins **node-version: 24** in CI                                                                                                 | keep — pinned in CI; keep local dev aligned                                                                                                                                                                                                                            |
| JDK (Temurin)                | `android-deploy.yml`, Gradle builds                | `actions/setup-java@v5`, **temurin / java-version: 21**                                                                                                 | keep — Android build requirement, pinned                                                                                                                                                                                                                               |
| Gradle                       | `android:*` scripts, Android CI                    | the committed **Gradle wrapper** (`android/gradlew`), invoked via `scripts/gradle.mjs` (ADR-0017); patched into `@capacitor/cli` for Windows (ADR-0011) | keep — wrapper-pinned; version lives in the native project                                                                                                                                                                                                             |
| Android SDK / emulator / adb | `android:*`, `test:android`, `android-deploy.yml`  | `reactivecircus/android-emulator-runner@v2` (**api-level: 33, google_apis, x86_64**) in CI; local Android Studio SDK otherwise                          | keep — API 33 emulator target pinned in CI                                                                                                                                                                                                                             |
| Xcode / `xcodebuild`         | `ios:*` scripts, `ios-deploy.yml`                  | macOS runner's system Xcode (image-provided); no explicit version pin in the workflow                                                                   | monitor — iOS builds float on the runner's default Xcode; pin the Xcode version if a toolchain bump ever breaks a release build                                                                                                                                        |
| Maestro                      | `test:android:device`, `test:ios`, native smoke CI | installed via `curl -fsSL https://get.maestro.mobile.dev \| bash` in `android-deploy.yml` / `ios-deploy.yml` (unpinned — installs latest)               | monitor — [14.9k stars](https://github.com/mobile-dev-inc/Maestro) · active · Apache-2.0, healthy upstream, but the CI install is **unpinned** (`get.maestro.mobile.dev` → latest); pin a Maestro version for reproducible native smoke runs. See the `testing` skill. |

**Method note:** these live outside the lockfile, so refresh them by re-reading
`.github/workflows/`, the `package.json` scripts, and `scripts/*.mjs` — not `npm view`. Version
facts above are the pins as found in those files on the refresh date.

---

**Phase 3 note:** The one action-required verdict (`capacitor-set-version`, investigate replacement)
was filed as [`#332`](https://github.com/KyleMit/Splotch/issues/332) (`type:chore` + `area:infra`,
per `docs/ISSUE-WORKFLOW.md`). The `cookie` (low) advisory under `@sveltejs/kit` is an ordinary
version bump — hand it to `/dependency-update-audit` rather than the backlog.
