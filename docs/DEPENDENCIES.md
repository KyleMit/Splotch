# Dependency Health

> Inventory and health assessment of Splotch’s third-party dependencies, written by the
> `dependency-health-audit` skill (see `.claude/audit-conventions.md`). Refreshed in place — compare
> runs with `git log -p docs/DEPENDENCIES.md`. External facts are snapshots; each carries the date
> it was checked. This file records analysis only — upgrades are applied by
> `/dependency-update-audit`, and replacements are tracked as GitHub issues.

**Last refresh:** 2026-07-17 at `741d514` · 18 prod + 32 dev direct · 1180 total installed

## Verdict summary

| Package                               | Prod/Dev | Verdict     |
| ------------------------------------- | -------- | ----------- |
| `@capacitor/cli`                      | prod     | **monitor** |
| `@netlify/blobs`                      | prod     | **monitor** |
| `@sveltejs/adapter-static`            | prod     | **monitor** |
| `@capacitor/assets`                   | dev      | **monitor** |
| `@sveltejs/adapter-netlify`           | dev      | **monitor** |
| `@sveltejs/kit`                       | dev      | **monitor** |
| `@aparajita/capacitor-secure-storage` | prod     | **keep**    |
| `@capacitor-community/media`          | prod     | **keep**    |
| `@capacitor/android`                  | prod     | **keep**    |
| `@capacitor/core`                     | prod     | **keep**    |
| `@capacitor/device`                   | prod     | **keep**    |
| `@capacitor/filesystem`               | prod     | **keep**    |
| `@capacitor/haptics`                  | prod     | **keep**    |
| `@capacitor/ios`                      | prod     | **keep**    |
| `@capacitor/network`                  | prod     | **keep**    |
| `@capacitor/preferences`              | prod     | **keep**    |
| `@capacitor/screen-orientation`       | prod     | **keep**    |
| `@capacitor/status-bar`               | prod     | **keep**    |
| `@fontsource-variable/quicksand`      | prod     | **keep**    |
| `@google/genai`                       | prod     | **keep**    |
| `idb`                                 | prod     | **keep**    |
| `@dprint/json`                        | dev      | **keep**    |
| `@dprint/markdown`                    | dev      | **keep**    |
| `@dprint/typescript`                  | dev      | **keep**    |
| `@eslint/js`                          | dev      | **keep**    |
| `@intellectronica/ruler`              | dev      | **keep**    |
| `@playwright/test`                    | dev      | **keep**    |
| `@sveltejs/vite-plugin-svelte`        | dev      | **keep**    |
| `capacitor-set-version`               | dev      | **keep**    |
| `cross-env`                           | dev      | **keep**    |
| `dprint`                              | dev      | **keep**    |
| `eslint`                              | dev      | **keep**    |
| `eslint-config-prettier`              | dev      | **keep**    |
| `eslint-plugin-svelte`                | dev      | **keep**    |
| `globals`                             | dev      | **keep**    |
| `happy-dom`                           | dev      | **keep**    |
| `marked`                              | dev      | **keep**    |
| `patch-package`                       | dev      | **keep**    |
| `prettier`                            | dev      | **keep**    |
| `prettier-plugin-svelte`              | dev      | **keep**    |
| `scripts-info`                        | dev      | **keep**    |
| `sharp`                               | dev      | **keep**    |
| `svelte`                              | dev      | **keep**    |
| `svelte-check`                        | dev      | **keep**    |
| `svgo`                                | dev      | **keep**    |
| `typescript`                          | dev      | **keep**    |
| `typescript-eslint`                   | dev      | **keep**    |
| `vite`                                | dev      | **keep**    |
| `vite-plugin-pwa`                     | dev      | **keep**    |
| `vitest`                              | dev      | **keep**    |

## Direct dependencies — production

### @aparajita/capacitor-secure-storage

* **Version:** `^8.0.0` declared · 8.0.0 locked (per `package-lock.json`) · prod
* **Used for:** native credential storage via `web/src/lib/secureStorage.ts`.
* **Source:** npm ·
  [github.com/aparajita/capacitor-secure-storage](https://github.com/aparajita/capacitor-secure-storage)
  · published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.0.0 published 2026-02-10](https://www.npmjs.com/package/@aparajita/capacitor-secure-storage)
  · npm metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @capacitor-community/media

* **Version:** `^9.1.0` declared · 9.1.0 locked (per `package-lock.json`) · prod
* **Used for:** native screenshot saving via `web/src/lib/drawing/screenshot.ts`.
* **Source:** npm ·
  [github.com/capacitor-community/media](https://github.com/capacitor-community/media) · published
  by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 9.1.0 published 2026-03-27](https://www.npmjs.com/package/@capacitor-community/media) ·
  npm metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @capacitor/android

* **Version:** `^8.4.1` declared · 8.4.1 locked (per `package-lock.json`) · prod
* **Used for:** the Android Capacitor platform project.
* **Source:** npm · [github.com/ionic-team/capacitor](https://github.com/ionic-team/capacitor) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.4.2 published 2026-07-14](https://www.npmjs.com/package/@capacitor/android) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @capacitor/cli

* **Version:** `^8.4.1` declared · 8.4.1 locked (per `package-lock.json`) · prod
* **Used for:** Capacitor sync/build tooling in npm scripts; patched by
  `patches/@capacitor+cli+8.4.1.patch`.
* **Source:** npm · [github.com/ionic-team/capacitor](https://github.com/ionic-team/capacitor) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.4.2 published 2026-07-14](https://www.npmjs.com/package/@capacitor/cli) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** `npm audit` reports high-severity transitive advisories through this package;
  resolve through `/dependency-update-audit`, not a replacement. Its version is coupled to the
  Capacitor family and the committed patch.
* **Alternatives:** none needed.
* **Verdict:** monitor — audit advisories require a coordinated update; the package remains
  load-bearing. Its version is coupled to the Capacitor family and the committed patch.

### @capacitor/core

* **Version:** `^8.4.1` declared · 8.4.1 locked (per `package-lock.json`) · prod
* **Used for:** the native bridge used by device and drawing plugins in `web/src/lib/`.
* **Source:** npm · [github.com/ionic-team/capacitor](https://github.com/ionic-team/capacitor) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.4.2 published 2026-07-14](https://www.npmjs.com/package/@capacitor/core) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @capacitor/device

* **Version:** `^8.0.3` declared · 8.0.3 locked (per `package-lock.json`) · prod
* **Used for:** native device information in `web/src/lib/deviceInfo.ts`.
* **Source:** npm ·
  [github.com/ionic-team/capacitor-plugins](https://github.com/ionic-team/capacitor-plugins) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.0.3 published 2026-07-15](https://www.npmjs.com/package/@capacitor/device) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @capacitor/filesystem

* **Version:** `^8.1.2` declared · 8.1.2 locked (per `package-lock.json`) · prod
* **Used for:** the registered native filesystem plugin.
* **Source:** npm ·
  [github.com/ionic-team/capacitor-filesystem](https://github.com/ionic-team/capacitor-filesystem) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.1.2 published 2026-02-13](https://www.npmjs.com/package/@capacitor/filesystem) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @capacitor/haptics

* **Version:** `^8.0.2` declared · 8.0.2 locked (per `package-lock.json`) · prod
* **Used for:** native feedback in `web/src/lib/haptics.ts`.
* **Source:** npm ·
  [github.com/ionic-team/capacitor-haptics](https://github.com/ionic-team/capacitor-haptics) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.0.2 published 2026-03-27](https://www.npmjs.com/package/@capacitor/haptics) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @capacitor/ios

* **Version:** `^8.4.1` declared · 8.4.1 locked (per `package-lock.json`) · prod
* **Used for:** the iOS Capacitor platform project.
* **Source:** npm · [github.com/ionic-team/capacitor](https://github.com/ionic-team/capacitor) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.4.2 published 2026-07-14](https://www.npmjs.com/package/@capacitor/ios) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @capacitor/network

* **Version:** `^8.0.1` declared · 8.0.1 locked (per `package-lock.json`) · prod
* **Used for:** connectivity state in `web/src/lib/state/network.svelte.ts`.
* **Source:** npm ·
  [github.com/ionic-team/capacitor-plugins](https://github.com/ionic-team/capacitor-plugins) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.0.1 published 2026-02-12](https://www.npmjs.com/package/@capacitor/network) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @capacitor/preferences

* **Version:** `^8.0.1` declared · 8.0.1 locked (per `package-lock.json`) · prod
* **Used for:** native persistence in `web/src/lib/storage.ts`.
* **Source:** npm ·
  [github.com/ionic-team/capacitor-plugins](https://github.com/ionic-team/capacitor-plugins) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.0.1 published 2026-02-12](https://www.npmjs.com/package/@capacitor/preferences) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @capacitor/screen-orientation

* **Version:** `^8.0.1` declared · 8.0.1 locked (per `package-lock.json`) · prod
* **Used for:** orientation locking in `web/src/lib/orientation.ts`.
* **Source:** npm ·
  [github.com/ionic-team/capacitor-plugins](https://github.com/ionic-team/capacitor-plugins) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.0.1 published 2026-02-12](https://www.npmjs.com/package/@capacitor/screen-orientation) ·
  npm metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @capacitor/status-bar

* **Version:** `^8.0.2` declared · 8.0.2 locked (per `package-lock.json`) · prod
* **Used for:** native notch/status-bar presentation in `web/src/lib/components/NotchBand.svelte`.
* **Source:** npm ·
  [github.com/ionic-team/capacitor-plugins](https://github.com/ionic-team/capacitor-plugins) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.0.3 published 2026-07-15](https://www.npmjs.com/package/@capacitor/status-bar) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @fontsource-variable/quicksand

* **Version:** `^5.2.10` declared · 5.2.10 locked (per `package-lock.json`) · prod
* **Used for:** the bundled Quicksand variable font in `web/src/routes/+layout.svelte`.
* **Source:** npm · [github.com/fontsource/font-files](https://github.com/fontsource/font-files) ·
  published by the npm package maintainers
* **License:** OFL-1.1
* **Health** (checked 2026-07-17):
  [latest 5.2.10 published 2025-09-17](https://www.npmjs.com/package/@fontsource-variable/quicksand)
  · npm metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @google/genai

* **Version:** `^2.10.0` declared · 2.10.0 locked (per `package-lock.json`) · prod
* **Used for:** Gemini generation clients in `web/src/lib/server/` and asset/model-evaluation
  scripts.
* **Source:** npm · [github.com/googleapis/js-genai](https://github.com/googleapis/js-genai) ·
  published by the npm package maintainers
* **License:** Apache-2.0
* **Health** (checked 2026-07-17):
  [latest 2.12.0 published 2026-07-16](https://www.npmjs.com/package/@google/genai) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @netlify/blobs

* **Version:** `^10.7.9` declared · 10.7.9 locked (per `package-lock.json`) · prod
* **Used for:** server-side token and usage persistence in `web/src/lib/server/`.
* **Source:** npm · [github.com/netlify/primitives](https://github.com/netlify/primitives) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 10.7.9 published 2026-05-29](https://www.npmjs.com/package/@netlify/blobs) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** `npm audit` reports moderate-severity transitive advisories through this package;
  resolve through `/dependency-update-audit`, not a replacement.
* **Alternatives:** none needed.
* **Verdict:** monitor — audit advisories require a coordinated update; the package remains
  load-bearing.

### @sveltejs/adapter-static

* **Version:** `^3.0.10` declared · 3.0.10 locked (per `package-lock.json`) · prod
* **Used for:** the Capacitor static SvelteKit target in `web/svelte.config.js`.
* **Source:** npm · [github.com/sveltejs/kit](https://github.com/sveltejs/kit) · published by the
  npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 3.0.10 published 2025-10-02](https://www.npmjs.com/package/@sveltejs/adapter-static) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** `npm audit` reports low-severity transitive advisories through this package; resolve
  through `/dependency-update-audit`, not a replacement.
* **Alternatives:** none needed.
* **Verdict:** monitor — audit advisories require a coordinated update; the package remains
  load-bearing.

### idb

* **Version:** `^8.0.3` declared · 8.0.3 locked (per `package-lock.json`) · prod
* **Used for:** typed IndexedDB helpers in `web/src/lib/idb.ts` and drawing persistence.
* **Source:** npm · [github.com/jakearchibald/idb](https://github.com/jakearchibald/idb) · published
  by the npm package maintainers
* **License:** ISC
* **Health** (checked 2026-07-17):
  [latest 8.0.3 published 2025-05-07](https://www.npmjs.com/package/idb) · npm metadata reports not
  deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

## Direct dependencies — development

### @capacitor/assets

* **Version:** `^3.0.5` declared · 3.0.5 locked (per `package-lock.json`) · dev
* **Used for:** Capacitor icon/splash generation invoked by native tooling.
* **Source:** npm ·
  [github.com/ionic-team/capacitor-assets](https://github.com/ionic-team/capacitor-assets) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 3.0.5 published 2024-03-29](https://www.npmjs.com/package/@capacitor/assets) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** `npm audit` reports high-severity transitive advisories through this package;
  resolve through `/dependency-update-audit`, not a replacement. Its transitive `sharp` is pinned to
  root `sharp` via `overrides`.
* **Alternatives:** none needed.
* **Verdict:** monitor — audit advisories require a coordinated update; the package remains
  load-bearing. Its transitive `sharp` is pinned to root `sharp` via `overrides`.

### @dprint/json

* **Version:** `^0.23.0` declared · 0.23.0 locked (per `package-lock.json`) · dev
* **Used for:** the dprint JSON formatter plugin.
* **Source:** npm ·
  [github.com/dprint/dprint-plugin-json](https://github.com/dprint/dprint-plugin-json) · published
  by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 0.23.0 published 2026-07-07](https://www.npmjs.com/package/@dprint/json) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @dprint/markdown

* **Version:** `^0.22.1` declared · 0.22.1 locked (per `package-lock.json`) · dev
* **Used for:** the dprint Markdown formatter plugin.
* **Source:** npm ·
  [github.com/dprint/dprint-plugin-markdown](https://github.com/dprint/dprint-plugin-markdown) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 0.22.1 published 2026-05-22](https://www.npmjs.com/package/@dprint/markdown) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @dprint/typescript

* **Version:** `^0.96.1` declared · 0.96.1 locked (per `package-lock.json`) · dev
* **Used for:** the dprint TypeScript formatter plugin.
* **Source:** npm ·
  [github.com/dprint/dprint-plugin-typescript](https://github.com/dprint/dprint-plugin-typescript) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 0.96.1 published 2026-05-20](https://www.npmjs.com/package/@dprint/typescript) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @eslint/js

* **Version:** `^10.0.1` declared · 10.0.1 locked (per `package-lock.json`) · dev
* **Used for:** ESLint’s JavaScript recommended config.
* **Source:** npm · [github.com/eslint/eslint](https://github.com/eslint/eslint) · published by the
  npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 10.0.1 published 2026-02-06](https://www.npmjs.com/package/@eslint/js) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @intellectronica/ruler

* **Version:** `0.3.44` declared · 0.3.44 locked (per `package-lock.json`) · dev
* **Used for:** generation of the repo’s agent instructions and skills.
* **Source:** npm · [github.com/intellectronica/ruler](https://github.com/intellectronica/ruler) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 0.3.44 published 2026-06-30](https://www.npmjs.com/package/@intellectronica/ruler) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @playwright/test

* **Version:** `^1.61.1` declared · 1.61.1 locked (per `package-lock.json`) · dev
* **Used for:** browser E2E tests under `web/tests/`.
* **Source:** npm · [github.com/microsoft/playwright](https://github.com/microsoft/playwright) ·
  published by the npm package maintainers
* **License:** Apache-2.0
* **Health** (checked 2026-07-17):
  [latest 1.61.1 published 2026-06-23](https://www.npmjs.com/package/@playwright/test) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### @sveltejs/adapter-netlify

* **Version:** `^6.0.4` declared · 6.0.4 locked (per `package-lock.json`) · dev
* **Used for:** the web/serverless SvelteKit target in `web/svelte.config.js`.
* **Source:** npm · [github.com/sveltejs/kit](https://github.com/sveltejs/kit) · published by the
  npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 6.0.4 published 2026-02-24](https://www.npmjs.com/package/@sveltejs/adapter-netlify) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** `npm audit` reports low-severity transitive advisories through this package; resolve
  through `/dependency-update-audit`, not a replacement.
* **Alternatives:** none needed.
* **Verdict:** monitor — audit advisories require a coordinated update; the package remains
  load-bearing.

### @sveltejs/kit

* **Version:** `^2.68.0` declared · 2.68.0 locked (per `package-lock.json`) · dev
* **Used for:** the SvelteKit framework and server hooks/configuration.
* **Source:** npm · [github.com/sveltejs/kit](https://github.com/sveltejs/kit) · published by the
  npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 2.70.0 published 2026-07-17](https://www.npmjs.com/package/@sveltejs/kit) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** `npm audit` reports low-severity transitive advisories through this package; resolve
  through `/dependency-update-audit`, not a replacement.
* **Alternatives:** none needed.
* **Verdict:** monitor — audit advisories require a coordinated update; the package remains
  load-bearing.

### @sveltejs/vite-plugin-svelte

* **Version:** `^7.1.2` declared · 7.1.2 locked (per `package-lock.json`) · dev
* **Used for:** Svelte’s Vite integration.
* **Source:** npm ·
  [github.com/sveltejs/vite-plugin-svelte](https://github.com/sveltejs/vite-plugin-svelte) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 7.2.0 published 2026-07-07](https://www.npmjs.com/package/@sveltejs/vite-plugin-svelte) ·
  npm metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### capacitor-set-version

* **Version:** `^2.2.0` declared · 2.2.0 locked (per `package-lock.json`) · dev
* **Used for:** native version synchronization in `scripts/release.mjs`.
* **Source:** npm ·
  [github.com/HausennTechnologies/capacitor-set-version](https://github.com/HausennTechnologies/capacitor-set-version)
  · published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 2.2.0 published 2023-09-27](https://www.npmjs.com/package/capacitor-set-version) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### cross-env

* **Version:** `^10.1.0` declared · 10.1.0 locked (per `package-lock.json`) · dev
* **Used for:** cross-platform environment variables in npm scripts.
* **Source:** npm · [github.com/kentcdodds/cross-env](https://github.com/kentcdodds/cross-env) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 10.1.0 published 2025-09-29](https://www.npmjs.com/package/cross-env) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### dprint

* **Version:** `^0.55.1` declared · 0.55.1 locked (per `package-lock.json`) · dev
* **Used for:** the repository formatter CLI.
* **Source:** npm · [github.com/dprint/dprint](https://github.com/dprint/dprint) · published by the
  npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 0.55.2 published 2026-07-14](https://www.npmjs.com/package/dprint) · npm metadata reports
  not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### eslint

* **Version:** `^10.5.0` declared · 10.5.0 locked (per `package-lock.json`) · dev
* **Used for:** repository linting.
* **Source:** npm · [github.com/eslint/eslint](https://github.com/eslint/eslint) · published by the
  npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 10.7.0 published 2026-07-10](https://www.npmjs.com/package/eslint) · npm metadata reports
  not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### eslint-config-prettier

* **Version:** `^10.1.8` declared · 10.1.8 locked (per `package-lock.json`) · dev
* **Used for:** Prettier compatibility for ESLint.
* **Source:** npm ·
  [github.com/prettier/eslint-config-prettier](https://github.com/prettier/eslint-config-prettier) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 10.1.8 published 2025-07-18](https://www.npmjs.com/package/eslint-config-prettier) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### eslint-plugin-svelte

* **Version:** `^3.19.0` declared · 3.19.0 locked (per `package-lock.json`) · dev
* **Used for:** Svelte lint rules.
* **Source:** npm ·
  [github.com/sveltejs/eslint-plugin-svelte](https://github.com/sveltejs/eslint-plugin-svelte) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 3.20.0 published 2026-06-26](https://www.npmjs.com/package/eslint-plugin-svelte) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### globals

* **Version:** `^17.7.0` declared · 17.7.0 locked (per `package-lock.json`) · dev
* **Used for:** browser/node global definitions in ESLint config.
* **Source:** npm · [github.com/sindresorhus/globals](https://github.com/sindresorhus/globals) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 17.7.0 published 2026-06-22](https://www.npmjs.com/package/globals) · npm metadata reports
  not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### happy-dom

* **Version:** `^20.10.6` declared · 20.10.6 locked (per `package-lock.json`) · dev
* **Used for:** the DOM environment for Vitest.
* **Source:** npm · [github.com/capricorn86/happy-dom](https://github.com/capricorn86/happy-dom) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 20.10.6 published 2026-06-17](https://www.npmjs.com/package/happy-dom) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### marked

* **Version:** `^18.0.5` declared · 18.0.5 locked (per `package-lock.json`) · dev
* **Used for:** release-note HTML generation in `scripts/generate-releases.mjs`.
* **Source:** npm · [github.com/markedjs/marked](https://github.com/markedjs/marked) · published by
  the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 18.0.6 published 2026-07-09](https://www.npmjs.com/package/marked) · npm metadata reports
  not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### patch-package

* **Version:** `^8.0.1` declared · 8.0.1 locked (per `package-lock.json`) · dev
* **Used for:** application of the Capacitor CLI patch after install.
* **Source:** npm · [github.com/ds300/patch-package](https://github.com/ds300/patch-package) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.0.1 published 2025-09-29](https://www.npmjs.com/package/patch-package) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### prettier

* **Version:** `^3.8.4` declared · 3.8.4 locked (per `package-lock.json`) · dev
* **Used for:** source formatting.
* **Source:** npm · [github.com/prettier/prettier](https://github.com/prettier/prettier) · published
  by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 3.9.5 published 2026-07-09](https://www.npmjs.com/package/prettier) · npm metadata reports
  not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### prettier-plugin-svelte

* **Version:** `^4.1.1` declared · 4.1.1 locked (per `package-lock.json`) · dev
* **Used for:** Svelte formatting support.
* **Source:** npm ·
  [github.com/sveltejs/prettier-plugin-svelte](https://github.com/sveltejs/prettier-plugin-svelte) ·
  published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 4.1.1 published 2026-06-15](https://www.npmjs.com/package/prettier-plugin-svelte) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### scripts-info

* **Version:** `^1.0.5` declared · 1.0.5 locked (per `package-lock.json`) · dev
* **Used for:** validation/documentation of npm scripts.
* **Source:** npm · repository unavailable from npm metadata (checked 2026-07-17) · published by the
  npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 1.0.5 published 2026-06-12](https://www.npmjs.com/package/scripts-info) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### sharp

* **Version:** `^0.35.2` declared · 0.35.2 locked (per `package-lock.json`) · dev
* **Used for:** asset processing and image analysis in `tools/asset-gen/` and scripts.
* **Source:** npm · [github.com/lovell/sharp](https://github.com/lovell/sharp) · published by the
  npm package maintainers
* **License:** Apache-2.0
* **Health** (checked 2026-07-17):
  [latest 0.35.3 published 2026-07-01](https://www.npmjs.com/package/sharp) · npm metadata reports
  not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none It is the target of the `@capacitor/assets` override.
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use. It is the
  target of the `@capacitor/assets` override.

### svelte

* **Version:** `^5.56.4` declared · 5.56.4 locked (per `package-lock.json`) · dev
* **Used for:** the Svelte component runtime/compiler.
* **Source:** npm · [github.com/sveltejs/svelte](https://github.com/sveltejs/svelte) · published by
  the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 5.56.6 published 2026-07-16](https://www.npmjs.com/package/svelte) · npm metadata reports
  not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### svelte-check

* **Version:** `^4.7.1` declared · 4.7.1 locked (per `package-lock.json`) · dev
* **Used for:** Svelte type checking via `scripts/web.mjs`.
* **Source:** npm · [github.com/sveltejs/language-tools](https://github.com/sveltejs/language-tools)
  · published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 4.7.3 published 2026-07-15](https://www.npmjs.com/package/svelte-check) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### svgo

* **Version:** `^4.0.1` declared · 4.0.1 locked (per `package-lock.json`) · dev
* **Used for:** SVG optimization in `scripts/image-audit.mjs`.
* **Source:** npm · [github.com/svg/svgo](https://github.com/svg/svgo) · published by the npm
  package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 4.0.2 published 2026-07-11](https://www.npmjs.com/package/svgo) · npm metadata reports not
  deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### typescript

* **Version:** `^6.0.3` declared · 6.0.3 locked (per `package-lock.json`) · dev
* **Used for:** TypeScript language tooling.
* **Source:** npm · [github.com/microsoft/TypeScript](https://github.com/microsoft/TypeScript) ·
  published by the npm package maintainers
* **License:** Apache-2.0
* **Health** (checked 2026-07-17):
  [latest 7.0.2 published 2026-07-08](https://www.npmjs.com/package/typescript) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### typescript-eslint

* **Version:** `^8.62.0` declared · 8.62.0 locked (per `package-lock.json`) · dev
* **Used for:** TypeScript parsing/rules for ESLint.
* **Source:** npm ·
  [github.com/typescript-eslint/typescript-eslint](https://github.com/typescript-eslint/typescript-eslint)
  · published by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.64.0 published 2026-07-13](https://www.npmjs.com/package/typescript-eslint) · npm
  metadata reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### vite

* **Version:** `^8.1.0` declared · 8.1.0 locked (per `package-lock.json`) · dev
* **Used for:** the web dev server and production build tool.
* **Source:** npm · [github.com/vitejs/vite](https://github.com/vitejs/vite) · published by the npm
  package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 8.1.5 published 2026-07-16](https://www.npmjs.com/package/vite) · npm metadata reports not
  deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### vite-plugin-pwa

* **Version:** `^1.3.0` declared · 1.3.0 locked (per `package-lock.json`) · dev
* **Used for:** PWA manifest and service worker configuration.
* **Source:** npm ·
  [github.com/vite-pwa/vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) · published by
  the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 1.3.0 published 2026-05-05](https://www.npmjs.com/package/vite-plugin-pwa) · npm metadata
  reports not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

### vitest

* **Version:** `^4.1.9` declared · 4.1.9 locked (per `package-lock.json`) · dev
* **Used for:** unit testing in `web/` and `tools/asset-gen/`.
* **Source:** npm · [github.com/vitest-dev/vitest](https://github.com/vitest-dev/vitest) · published
  by the npm package maintainers
* **License:** MIT
* **Health** (checked 2026-07-17):
  [latest 4.1.10 published 2026-07-06](https://www.npmjs.com/package/vitest) · npm metadata reports
  not deprecated.
* **Maintenance:** active — current npm publication metadata was verified; upstream repository
  activity was not separately sampled in this run.
* **Concerns:** none
* **Alternatives:** none needed.
* **Verdict:** keep — healthy upstream package with a concrete, current repository use.

## Transitive dependencies

* **Footprint:** 1,180 lockfile packages; 50 direct and 1130 transitive.
* **Audit (checked 2026-07-17):** `npm audit --json` found 4 low, 9 moderate, 6 high, and 0 critical
  advisories. Direct owners are `@capacitor/assets` → `@capacitor/cli`/`@trapezedev/project` →
  `tar`/`replace`/`minimatch`/`xcode`/`uuid`/`js-yaml`; `@netlify/blobs` → `@netlify/otel` →
  OpenTelemetry packages; and SvelteKit/adapters → `cookie`.
* **Install scripts:** `@1.3.0`, `@google/genai@2.10.0`,
  `@sveltejs/adapter-netlify/node_modules/esbuild@0.25.12`, `dprint@0.55.1`, `fsevents@2.3.2`,
  `protobufjs@7.6.4`, `vite/node_modules/fsevents@2.3.3`, `yarn@1.22.22`.
* **Override:** `@capacitor/assets` resolves transitive `sharp` to root `sharp` via `package.json`
  overrides, avoiding the cloud-session libvips download problem.
* **Deprecated transitives:** no direct package was marked deprecated by the npm metadata checks;
  this run did not find a deprecated transitive in the audit output.
