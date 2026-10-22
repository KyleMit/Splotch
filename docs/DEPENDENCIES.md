# Dependency Health

> Inventory and health assessment of Splotch's third-party dependencies, written by the
> `audit-dependency-health` skill (see `.claude/audit-conventions.md`). Refreshed in place — compare
> runs with `git log -p docs/DEPENDENCIES.md`. External facts are snapshots; each carries the date
> it was checked. This file records analysis only — upgrades are applied by
> `burn-down-outdated-dependencies`, and replacements are tracked as GitHub issues.

**Current local inventory:** RN cutover, 2026-10-22. The single root `package.json` declares 31
build/production dependencies and 34 local/CI dependencies. The inverted split follows ADR-0070:
Netlify's production install must contain everything its web build executes. `pnpm-lock.yaml` owns
resolved versions; the ranges below are manifest facts, not a new external health assessment.

Expo/React Native, React Strict DOM and native modules are one SDK/template-aligned graph
(ADR-0119). Review `pnpm-workspace.yaml`, patches, autolinking, native-script provenance and both
native builds before changing that graph. Ordinary dependency automation excludes the SDK set in
`.github/dependabot.yml`. SvelteKit, Svelte and Capacitor packages are absent.

| Direct package                   | Declared range | Build/prod or local/CI |
| -------------------------------- | -------------- | ---------------------- |
| `@babel/core`                    | `7.29.7`       | Build/prod             |
| `@expo-google-fonts/quicksand`   | `0.4.1`        | Build/prod             |
| `@fontsource-variable/quicksand` | `5.3.0`        | Build/prod             |
| `@netlify/blobs`                 | `^11.1.1`      | Build/prod             |
| `@shopify/react-native-skia`     | `2.14.0`       | Build/prod             |
| `babel-preset-expo`              | `58.0.17`      | Build/prod             |
| `expo`                           | `58.0.14`      | Build/prod             |
| `expo-asset`                     | `58.0.16`      | Build/prod             |
| `expo-audio`                     | `58.0.9`       | Build/prod             |
| `expo-file-system`               | `58.0.9`       | Build/prod             |
| `expo-font`                      | `58.0.8`       | Build/prod             |
| `expo-haptics`                   | `58.0.7`       | Build/prod             |
| `expo-keep-awake`                | `58.0.3`       | Build/prod             |
| `expo-media-library`             | `58.0.10`      | Build/prod             |
| `expo-network`                   | `58.0.3`       | Build/prod             |
| `expo-screen-orientation`        | `58.0.3`       | Build/prod             |
| `happy-dom`                      | `^20.14.5`     | Build/prod             |
| `openai`                         | `^7.23.0`      | Build/prod             |
| `postcss`                        | `8.5.28`       | Build/prod             |
| `react`                          | `19.3.0`       | Build/prod             |
| `react-dom`                      | `19.3.0`       | Build/prod             |
| `react-native`                   | `0.88.0`       | Build/prod             |
| `react-native-reanimated`        | `4.7.1`        | Build/prod             |
| `react-native-safe-area-context` | `5.10.1`       | Build/prod             |
| `react-native-svg`               | `15.16.0`      | Build/prod             |
| `react-native-web`               | `0.21.4`       | Build/prod             |
| `react-native-worklets`          | `0.13.0`       | Build/prod             |
| `react-strict-dom`               | `0.0.54`       | Build/prod             |
| `sharp`                          | `^0.35.5`      | Build/prod             |
| `vite`                           | `^8.3.3`       | Build/prod             |
| `workbox-build`                  | `^7.4.1`       | Build/prod             |
| `@axe-core/playwright`           | `^4.13.0`      | Local/CI               |
| `@dprint/json`                   | `^0.25.0`      | Local/CI               |
| `@dprint/markdown`               | `^0.24.0`      | Local/CI               |
| `@dprint/typescript`             | `^0.96.1`      | Local/CI               |
| `@eslint/js`                     | `^10.0.1`      | Local/CI               |
| `@fontsource-variable/quicksand` | `^5.3.0`       | Local/CI               |
| `@google/genai`                  | `^2.24.0`      | Local/CI               |
| `@intellectronica/ruler`         | `0.3.44`       | Local/CI               |
| `@playwright/test`               | `^1.63.0`      | Local/CI               |
| `@resvg/resvg-js`                | `^2.6.2`       | Local/CI               |
| `@types/node`                    | `^22.20.4`     | Local/CI               |
| `@types/react`                   | `19.3.0`       | Local/CI               |
| `@vitest/coverage-v8`            | `^5.0.2`       | Local/CI               |
| `@vitest/eslint-plugin`          | `^1.6.27`      | Local/CI               |
| `browserslist`                   | `4.29.2`       | Local/CI               |
| `dprint`                         | `^0.57.4`      | Local/CI               |
| `eslint`                         | `^10.11.0`     | Local/CI               |
| `eslint-config-prettier`         | `^10.1.8`      | Local/CI               |
| `eslint-plugin-playwright`       | `^2.12.0`      | Local/CI               |
| `eslint-plugin-react-hooks`      | `^7.1.1`       | Local/CI               |
| `expo-sharing`                   | `58.0.19`      | Local/CI               |
| `fit-curve`                      | `^0.2.0`       | Local/CI               |
| `globals`                        | `^17.12.0`     | Local/CI               |
| `knip`                           | `^6.38.0`      | Local/CI               |
| `lighthouse`                     | `13.5.0`       | Local/CI               |
| `prettier`                       | `^3.9.9`       | Local/CI               |
| `scripts-info`                   | `^1.0.5`       | Local/CI               |
| `stylelint`                      | `^17.15.0`     | Local/CI               |
| `svgo`                           | `^4.1.0`       | Local/CI               |
| `typescript`                     | `^6.0.3`       | Local/CI               |
| `typescript-eslint`              | `^8.71.0`      | Local/CI               |
| `vitest`                         | `^5.0.2`       | Local/CI               |
| `web-features`                   | `3.40.0`       | Local/CI               |
| `yaml`                           | `2.9.1`        | Local/CI               |

## Dated external-health evidence

The retained assessments below were last refreshed on 2026-07-17 at `e2812b3`, with a scoped
centerline-tracing amendment on 2026-08-19. Their version, maintenance and advisory claims are dated
evidence, not current vulnerability clearance. Retired framework-package entries were removed; new
RN dependencies above have no external-health verdict in this report. A complete health refresh uses
`audit-dependency-health`; current security gating uses `pnpm audit`.

## Verdict summary

Non-`keep` rows first.

| Package                        | Prod/Dev | Verdict                  |
| ------------------------------ | -------- | ------------------------ |
| fit-curve                      | dev      | **monitor** (dormant)    |
| scripts-info                   | dev      | **monitor** (bus factor) |
| @fontsource-variable/quicksand | prod     | keep                     |
| @google/genai                  | dev      | keep                     |
| @netlify/blobs                 | prod     | keep                     |
| @dprint/json                   | dev      | keep                     |
| @dprint/markdown               | dev      | keep                     |
| @dprint/typescript             | dev      | keep                     |
| @eslint/js                     | dev      | keep                     |
| @intellectronica/ruler         | dev      | keep                     |
| @playwright/test               | dev      | keep                     |
| @resvg/resvg-js                | dev      | keep                     |
| dprint                         | dev      | keep                     |
| eslint                         | dev      | keep                     |
| eslint-config-prettier         | dev      | keep                     |
| globals                        | dev      | keep                     |
| happy-dom                      | dev      | keep                     |
| prettier                       | dev      | keep                     |
| sharp                          | prod     | keep                     |
| svgo                           | dev      | keep                     |
| typescript                     | dev      | keep                     |
| typescript-eslint              | dev      | keep                     |
| vite                           | dev      | keep                     |
| vitest                         | dev      | keep                     |

## Direct dependencies — production

### @fontsource-variable/quicksand

* **Version:** `^5.2.10` declared · 5.2.10 locked · prod
* **Used for:** Self-hosted Quicksand variable font (the app's UI typeface), imported in
  `src/platform/shippingFont.web.tsx`.
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

* **Version:** `^2.24.0` declared · 2.24.0 locked · dev
* **Used for:** Gemini image generation and safety classification in the asset-gen and model-eval
  tooling; the app's `/api/generate-image` path moved to OpenAI (ADR-0113). Used in
  `tools/asset-gen/lib/gemini.mjs`, `tools/asset-gen/lib/gemini-response.ts`,
  `tools/model-eval/lib/image-providers.mjs`.
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
  in `netlify/server/tokens.ts`, `usage.ts` (+ tests).
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

## Direct dependencies — development

### @dprint/json

* **Version:** `^0.23.0` declared · 0.23.0 locked · dev
* **Used for:** dprint's JSON formatting plugin (wasm), referenced by `dprint.json` for fenced JSON
  blocks in Markdown; real JSON files remain Prettier-owned.
* **Source:** npm ·
  [github.com/dprint/dprint-plugin-json](https://github.com/dprint/dprint-plugin-json) · published
  by David Sherret (dsherret)
* **License:** MIT
* **Health** (checked 2026-07-17): [28 stars](https://github.com/dprint/dprint-plugin-json) · latest
  0.23.0 on 2026-07-07 · last push 2026-07-07
* **Maintenance:** active — same author as dprint itself
* **Concerns:** single-maintainer ecosystem (all dprint plugins), but consistently maintained
* **Alternatives:** leave fenced JSON blocks unformatted during dprint's Markdown pass
* **Verdict:** keep — formats fenced JSON without taking ownership of real JSON files

### @dprint/markdown

* **Version:** `^0.24.0` declared · 0.24.0 locked · dev
* **Used for:** dprint's Markdown formatting plugin (wasm) — owns `*.md` formatting (ADR-0057).
* **Source:** npm ·
  [github.com/dprint/dprint-plugin-markdown](https://github.com/dprint/dprint-plugin-markdown) ·
  published by David Sherret (dsherret)
* **License:** MIT
* **Health** (checked 2026-09-11): [58 stars](https://github.com/dprint/dprint-plugin-markdown) ·
  latest 0.24.0 on 2026-09-10 · last push 2026-09-10 · 4 open issues
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
* **Used for:** Generating `CLAUDE.md`/`AGENTS.md` and most skills from `.ruler/` sources (ADR-0058)
  — `ruler:apply`/`ruler:check`. The provider-specific `burn-down-audits` packages are maintained
  directly.
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
* **Used for:** E2E tests and the perf/screenshot harnesses (`test:e2e`, `perf:*`,
  `gen:store-assets`).
* **Source:** npm · [github.com/microsoft/playwright](https://github.com/microsoft/playwright) ·
  published by Microsoft
* **License:** Apache-2.0
* **Health** (checked 2026-07-17): [93k stars](https://github.com/microsoft/playwright) · latest
  1.61.1 on 2026-06-23 · last push 2026-07-17 · 163 open issues
* **Maintenance:** active — Microsoft-backed, frequent releases
* **Concerns:** none
* **Alternatives:** none needed
* **Verdict:** keep — E2E and tooling backbone; healthy

### @resvg/resvg-js

* **Version:** `^2.6.2` declared · 2.6.2 locked · dev
* **Used for:** Rendering filled and centerline SVGs to deterministic RGBA pixels in the opt-in
  `tools/centerline-tracing/` pipeline and its raster-agreement metrics.
* **Source:** npm · [github.com/thx/resvg-js](https://github.com/thx/resvg-js) · powered by the Rust
  `resvg` renderer and `napi-rs`
* **License:** MPL-2.0
* **Health** (checked 2026-08-19): latest 2.6.2; upstream remains active and publishes prebuilt
  native packages for supported Node platforms
* **Maintenance:** active — mature native binding with continuing upstream work
* **Concerns:** brings platform-specific optional packages into the development install; it is
  excluded from the Netlify production dependency set and runs only through the path-filtered tracer
  workflow or explicit local commands
* **Alternatives:** browser screenshot rasterization is much heavier and less deterministic; calling
  a Python renderer would duplicate the bridge that already consumes Node-native resvg
* **Verdict:** keep — deterministic SVG rasterization is a core boundary of the tracer's metric
  contract

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

### fit-curve

* **Version:** `^0.2.0` declared · 0.2.0 locked · dev
* **Used for:** Fitting cubic Bézier paths to skeleton point sequences through the small
  `tools/centerline-tracing/fit-curve-bridge.mjs` boundary.
* **Source:** npm · [github.com/soswow/fit-curve](https://github.com/soswow/fit-curve) · Philip J.
  Schneider's Graphics Gems algorithm
* **License:** MIT
* **Health** (checked 2026-08-19): latest 0.2.0, published 2022-06-18; no release in more than four
  years
* **Maintenance:** dormant — stable, narrow algorithm package with no current release cadence
* **Concerns:** aging CommonJS implementation and inactive release line; risk is bounded because it
  is dev-only, receives trusted numeric arrays, and sits behind one roughly 100-line bridge
* **Alternatives:** vendor the compact Schneider implementation behind the same bridge or replace it
  with a maintained curve fitter if compatibility or security ever changes
* **Verdict:** monitor — retain the proven implementation while the boundary makes replacement cheap

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
* **Used for:** The DOM environment for Vitest unit tests, configured in `vitest.config.ts`.
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

### openai

* **Version:** `^7.4.0` declared · 7.4.0 locked (latest 7.4.0) · prod
* **Used for:** OpenAI image generation via the Responses API image-generation tool — the
  `/api/generate-image` server path and the model-eval tooling. Used in
  `tools/model-eval/lib/image-providers.mjs`.
* **Source:** npm · [github.com/openai/openai-node](https://github.com/openai/openai-node) ·
  published by OpenAI
* **License:** Apache-2.0
* **Health** (checked 2026-08-14): [11.1k stars](https://github.com/openai/openai-node) · latest
  7.4.0 · last push 2026-08-14 · 31 open issues · frequent releases
* **Maintenance:** active — official OpenAI SDK, largely code-generated from the API spec, small
  issue backlog
* **Concerns:** fast-moving SDK (frequent majors track API changes) — pin and update deliberately.
  Zero runtime dependencies and no install script, which is a smaller supply-chain surface than the
  Gemini SDK it replaces.
* **Alternatives:** REST calls to the OpenAI API directly; none needed
* **Verdict:** keep — the official SDK for a core feature; healthy

### prettier

* **Version:** `^3.8.4` declared · 3.8.4 locked (latest 3.9.5) · dev
* **Used for:** Formatting source (JS/TS/TSX/CSS) — owns code formatting (ADR-0057);
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

* **Version:** `^0.35.4` declared · 0.35.4 locked · prod
* **Used for:** Sticker chroma-key processing in the hosted AI endpoints and asset-gen pipeline.
* **Source:** npm · [github.com/lovell/sharp](https://github.com/lovell/sharp) · published by Lovell
  Fuller (lovell)
* **License:** Apache-2.0
* **Health** (checked 2026-07-17): [32.5k stars](https://github.com/lovell/sharp) · latest 0.35.3 on
  2026-07-01 · last push 2026-07-16 · 110 open issues
* **Maintenance:** active — long-standing, well-funded, frequent releases
* **Concerns:** has an install script (prebuilt libvips binary).
* **Alternatives:** none needed
* **Verdict:** keep — core image processing and the override anchor; healthy

### svgo

* **Version:** `^4.0.1` declared · 4.0.1 locked (latest 4.0.2) · dev
* **Used for:** Optimizing shipped/inlined SVGs (`optimize:svg-assets`/`check:svg-assets`).
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
  `burn-down-outdated-dependencies`; verify typescript-eslint and Expo toolchain compatibility
  before moving.
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
* **Used for:** The config-free TypeScript loader for Netlify Functions in
  `tools/lib/netlify-function-host.mjs`, plus Vitest tooling.
* **Source:** npm · [github.com/vitejs/vite](https://github.com/vitejs/vite) · published by the Vite
  team (VoidZero)
* **License:** MIT
* **Health** (checked 2026-07-17): [82k stars](https://github.com/vitejs/vite) · latest 8.1.5 on
  2026-07-16 · last push 2026-07-17 · 720 open issues
* **Maintenance:** active — VoidZero-backed, very frequent releases
* **Concerns:** none — retained tooling dependency; verify the actual Vite/Vitest peer ranges
* **Alternatives:** none needed
* **Verdict:** keep — the build tool; healthy

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

### Active dependency-audit status and exceptions (checked 2026-10-06)

The published dependency graph contains the high `braces` and `node-forge` advisories below.
`pnpm audit --audit-level=high` skips those exact IDs under these active records; its configured
result is not a clean unpatched graph. The `node-forge` record relies on a local pnpm patch.

An exception requires an exact GHSA entry in `pnpm-workspace.yaml`'s `auditConfig.ignoreGhsas` and a
record in this subsection in the same change. Each record must name the affected locked package
paths and link upstream evidence that no patched resolution exists. Its basis is either evidence
that the paths are not exploitable here, or a reviewed exact-version local patch proved by a named
Quality guard over source, lock reachability, every installed copy and actual consumer controls. The
local-patch basis states remaining reachability and forbids unsupported consumers; it does not claim
a published fix or generic non-exploitability. Identify the approver and approval date, set a
review-by date no more than 90 days later, and state the concrete removal trigger. The focused
quality-policy test must require exact agreement between the configured GHSA set and the unexpired
records. Expiry, availability of a patched resolution, or a changed reachability analysis removes
the exception; severity-wide and dependency-class exclusions are never recorded here.

Each record is a `#### GHSA-…` heading followed by the field bullets below; the quality-policy test
in `tools/ci-mirror/tests/run-quality-checks.test.mjs` parses them.

#### GHSA-vfj7-8cjw-p6xm

* **Advisory:** `braces` <=3.0.3, stack-exhaustion denial of service through deeply nested brace
  patterns (high). <https://github.com/advisories/GHSA-vfj7-8cjw-p6xm>
* **Locked paths:** `braces@3.0.3`, reached only as `stylelint > globby > micromatch > braces`
  (`pnpm why braces` lists four such development paths).
* **Upstream evidence:** the advisory's patched range is `>=3.0.4`, and `npm view braces versions`
  ends at 3.0.3 (published 2024-05-21), so no patched resolution exists to override to.
  <https://www.npmjs.com/package/braces?activeTab=versions>
* **Reachability:** `pnpm why braces --prod` is empty, so the Netlify production install never
  contains it. The development paths expand only glob patterns written in this repository's own lint
  configuration; no untrusted input reaches `braces`.
* **Approved:** KyleMit, 2026-10-04
* **Review by:** 2027-01-02
* **Removal trigger:** a `braces` release `>=3.0.4` is published; resolve it and delete this record
  with its `ignoreGhsas` entry. Tracked by issue 2648.

#### GHSA-86w9-cpqp-85rv

* **Advisory:** `node-forge` <=1.4.0, RSA PKCS#1 v1.5 signature forgery through insufficient
  DigestInfo validation (high). <https://github.com/advisories/GHSA-86w9-cpqp-85rv>
* **Locked paths:** `node-forge@1.4.0`, reached only from the private native candidate through
  `expo > @expo/cli > node-forge`,
  `expo > @expo/cli > @expo/code-signing-certificates > node-forge`, and the same two paths beneath
  `babel-preset-expo > expo`. Both parents declare `^1.3.3`.
* **Upstream evidence:** the advisory lists no patched version; the registry ends at 1.4.0 and
  `node-forge@1.4.1` does not exist. Open, unmerged contributor
  [PR1152](https://github.com/digitalbazaar/forge/pull/1152) and
  [PR1157](https://github.com/digitalbazaar/forge/pull/1157) supply the reviewed nested-count and
  empty-NULL checks. Exact PR1157 lib/rsa.js source at 683ab3344899cc08a581e4d5675a33e87aff7b04 has
  SHA256 `22cdfb3220439533211cf00ff7c7e6605607761d77a2c3c263411d4c70798c4f`. Contributor code has no
  maintainer approval; the accepted risk requires the short review below.
* **Reachability:** excluded from the shipping production closure, but actual Expo helpers verify
  externally supplied certificates/CSRs, so development placement does not prove non-exploitability.
  The exact-version pnpm patch changes only `node-forge: lib/rsa.js`, rejecting the two observed
  malformed classes; it does not enforce strict DER. `dist/forge.min.js` and `dist/forge.all.min.js`
  remain unpatched and must stay unreachable. pnpm applies `patches/node-forge@1.4.0.patch` at
  install and fails the install if the patch no longer applies.
* **Approved:** Codex (delegated owner), Claude (independent review), 2026-10-06
* **Review by:** 2026-11-05
* **Removal trigger:** review an official published fix or changed publisher guidance immediately;
  replace the local mitigation only after source/installed/regression validation, then remove its
  patch, guard-specific policy and this exact ignore/record. Also review at the deadline. Tracked by
  [issue 2696](https://github.com/KyleMit/Splotch/issues/2696).

### Audit summary (checked 2026-07-17)

> Produced by `npm audit` before the pnpm migration (ADR-0119); re-run it as `pnpm audit`, which
> reports the same advisories keyed by dependency path.

19 advisories: **4 low, 9 moderate, 6 high, 0 critical**. Mapped transitive → direct parent:

| Advisory (severity)                         | Transitive chain                                           | Direct parent            | Fix status                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `js-yaml` quadratic DoS (**moderate**)      | `js-yaml@3.14.2` ← `@intellectronica/ruler`                | `@intellectronica/ruler` | fixable via ruler dep tree (dev-only, trusted YAML)                                            |
| `@opentelemetry/*` memory (**moderate** ×5) | `@opentelemetry/core` ← `@netlify/otel` ← `@netlify/blobs` | `@netlify/blobs`         | only fix offered is a semver-major *downgrade* to blobs 10.1.0 — not viable; wait for upstream |

The original total included retired Capacitor and SvelteKit dependency chains. It is not a current
advisory count for the RN graph; run `pnpm audit` against the lockfile for current exposure.

### Deprecated transitives

None surfaced by install warnings or the direct-dep `npm view` spot checks (no `deprecated` flags on
any of the 50 direct packages).

### Packages with install scripts (`hasInstallScript`)

Supply-chain-relevant subset from the lockfile: `@google/genai` (direct dev), `dprint` (direct dev),
`sharp` (direct prod), `esbuild` (tooling), `protobufjs` (under `@google/genai`), `fsevents`
(macOS-only, under `vite`), and `yarn` (transitive tooling copy). All are well-known, org- or
foundation-backed packages; none are anomalous.

## Development lifecycle dependencies (outside `package.json`)

Not every dependency the project relies on is an npm package. CI workflows pull in **GitHub
Actions** (SHA-pinned with version comments, resolved outside the lockfile), several npm scripts
fetch **CLIs at runtime** (`npx …`, or a globally-installed tool), and the native builds need
**system toolchains** that no npm range governs. These carry the same provenance/health/pinning
questions as npm deps, so they're inventoried here — but versions come from workflow/script pins,
not `pnpm-lock.yaml`.

### GitHub Actions (CI — `.github/workflows/`)

| Action                                   | Pin     | Publisher                  | Health (checked 2026-07-17)                                                                                                                 | Verdict                                      |
| ---------------------------------------- | ------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `actions/checkout`                       | v7.0.1  | GitHub (official)          | first-party, maintained                                                                                                                     | keep                                         |
| `pnpm/setup`                             | v2.0.2  | pnpm                       | official pnpm action and the supported path for pnpm 11+ (checked 2026-08-16)                                                               | keep                                         |
| `actions/setup-python`                   | v7.0.0  | GitHub (official)          | first-party; pins Python 3.11 for the isolated centerline-tracing workflow (checked 2026-08-19)                                             | keep                                         |
| `astral-sh/setup-uv`                     | v10.0.1 | Astral                     | official uv action; lock-aware cache and immutable release pin (checked 2026-08-19)                                                         | keep                                         |
| `actions/setup-java`                     | v5.7.0  | GitHub (official)          | first-party (used by `android-deploy.yml`, `distribution: temurin`, `java-version: 21`)                                                     | keep                                         |
| `actions/cache`                          | v6.1.0  | GitHub (official)          | first-party, maintained                                                                                                                     | keep                                         |
| `actions/configure-pages`                | v6.0.0  | GitHub (official)          | first-party (Pages deploy, `pages.yml`)                                                                                                     | keep                                         |
| `actions/upload-pages-artifact`          | v5.0.0  | GitHub (official)          | first-party                                                                                                                                 | keep                                         |
| `actions/deploy-pages`                   | v5.0.0  | GitHub (official)          | first-party                                                                                                                                 | keep                                         |
| `actions/upload-artifact`                | v7.0.1  | GitHub (official)          | first-party                                                                                                                                 | keep                                         |
| `actions/download-artifact`              | v8.0.1  | GitHub (official)          | first-party                                                                                                                                 | keep                                         |
| `reactivecircus/android-emulator-runner` | v2.38.0 | ReactiveCircus (3rd-party) | [1.3k stars](https://github.com/ReactiveCircus/android-emulator-runner) · last push 2026-07-05 · not archived · latest v2.38.0 · Apache-2.0 | keep — the de-facto standard emulator action |
| `crazy-max/ghaction-github-labeler`      | v6.0.0  | crazy-max (3rd-party)      | [166 stars](https://github.com/crazy-max/ghaction-github-labeler) · last push 2026-07-06 · not archived · **latest v6.0.0** · MIT           | keep — label-sync only                       |

**Concerns:** the two third-party actions run with repo-write scope (emulator action executes build
steps; the labeler writes labels via `label-sync.yml`). Both are actively maintained. GitHub's own
hardening advice is to pin third-party actions to a full commit SHA rather than a moving tag; every
action in the table is SHA-pinned with a `# vX.Y.Z` comment, which `npm run check:github-actions`
verifies (and `-- --check-latest` compares against upstream).

### Runtime-provisioned CLIs and local helpers (npm scripts, not in `package.json`)

| Tool                           | Where                                           | Source / provisioning                                                                                                   | Verdict                                                                                       |
| ------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Playwright browsers (Chromium) | `test.yml` (`.github/actions/setup-playwright`) | browser **binaries** downloaded by the `@playwright/test` package (in `package.json`); cached by lockfile version in CI | keep — versioned by the npm package; the binaries are a separate download, not a separate dep |

### System toolchains (native builds & tests — no npm range)

| Toolchain                    | Where                                              | Provisioning / pin                                                                                                                                      | Verdict                                                                                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js                      | dependency-backed CI jobs, all local dev           | `pnpm/setup@v2` pins **runtime: node@22** in the shared CI composite                                                                                    | keep — pinned to the `engines.node` floor major and drift-guarded                                                                                                                                                                    |
| Python                       | `tools/centerline-tracing/` only                   | **3.11** pinned by the capability's `.python-version`, `pyproject.toml`, and dedicated workflow; uv may download it lazily for local use                | keep — the first Python toolchain remains isolated from the app and default npm lifecycle                                                                                                                                            |
| uv                           | centerline-tracing commands and dedicated CI       | local system CLI; CI uses SHA-pinned `astral-sh/setup-uv@v10.0.1` to install **uv 0.12.5**; `uv.lock` fixes the complete Python graph                   | keep — fast locked environments without a root requirements file or always-on virtualenv                                                                                                                                             |
| JDK (Temurin)                | `android-deploy.yml`, Gradle builds                | `actions/setup-java@v5`, **temurin / java-version: 21**                                                                                                 | keep — Android build requirement, pinned                                                                                                                                                                                             |
| Gradle                       | `android:*` scripts, Android CI                    | the committed **Gradle wrapper** (`android/gradlew`), invoked by `tools/release/build-native-release.mjs`                                               | keep — wrapper-pinned; version lives in the native project                                                                                                                                                                           |
| Android SDK / emulator / adb | `android:*`, `test:android`, `android-deploy.yml`  | `reactivecircus/android-emulator-runner@v2` (**current API 33 + declared API 24 floor, google_apis, x86_64**) in CI; local Android Studio SDK otherwise | keep — current and minimum-supported Android runtimes pinned in release CI                                                                                                                                                           |
| Xcode / `xcodebuild`         | `ios:*` scripts, `ios-deploy.yml`                  | macOS runner's system Xcode (image-provided); no explicit version pin in the workflow                                                                   | monitor — iOS builds float on the runner's default Xcode; pin the Xcode version if a toolchain bump ever breaks a release build                                                                                                      |
| Maestro                      | `test:android:device`, `test:ios`, native smoke CI | installed by `.github/actions/install-maestro` via `curl -fsSL https://get.maestro.mobile.dev \| bash`, pinned to `MAESTRO_VERSION=2.4.0`               | keep — [14.9k stars](https://github.com/mobile-dev-inc/Maestro) · active · Apache-2.0, healthy upstream; CI uses the installer’s documented `MAESTRO_VERSION` interface for reproducible native smoke runs. See the `testing` skill. |

**Method note:** these live outside the lockfile, so refresh them by re-reading
`.github/workflows/`, the `package.json` scripts, and `tools/*.mjs` — not `npm view`. Version facts
above are the pins as found in those files on the refresh date.

---

**Historical follow-up:** the earlier `capacitor-set-version` replacement question was filed as
[issue 332](https://github.com/KyleMit/Splotch/issues/332). The package and SvelteKit's `cookie`
chain retired with the cutover; neither is an upgrade instruction for the RN graph.
