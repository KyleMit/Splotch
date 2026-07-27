# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

## Source: Code audit — scripts · root build/dev drivers

## Source: Code audit — scripts · perf profiling harness

## Source: Code audit — scripts · lib shared helpers

## Source: Code audit — web/tests · E2E + integration specs

## Source: Code audit — web · build/test configuration

### [P2][consistency] Production origin `https://splotch.art` and the Capacitor origins are hardcoded string literals scattered across configs

**File(s):** `web/vite.config.ts:55` (`NATIVE_API_BASE`) and `web/svelte.config.js:40`
(`csrf.trustedOrigins`) — pinned at SHA f934d43

#### Problem

The app's own origin and the two native WebView origins appear as bare literals in separate files:

```ts
// vite.config.ts:55
const NATIVE_API_BASE = isCapacitor ? 'https://splotch.art' : '';
```

```js
// svelte.config.js:40
csrf: { trustedOrigins: ['https://localhost', 'capacitor://localhost'] },
```

`https://splotch.art` also recurs in the root `netlify.toml` HSTS/CSP commentary and (per the `api`
skill) in the server CORS allow-list. There is no named constant, so a domain change or an added
native origin requires finding every literal by memory. A newcomer searching "where is the API
origin configured" finds several disconnected spots.

#### Proposed solution

Define these as named constants in one shared module (e.g. `web/build/origins.ts`: `PROD_ORIGIN`,
`CAPACITOR_ORIGINS`) and import them into both configs. Reference the same constants from the server
CORS code so the allow-list and the native base URL cannot disagree.

#### Verification

`git grep -n "splotch.art\|capacitor://localhost"` under `web/` should collapse to a single
definition site plus imports. Build both web and `CAPACITOR=true` targets and confirm
`__NATIVE_API_BASE__` and CSRF origins are unchanged.

---

### [P3][duplication] `playwright.config.ts` and `playwright.webkit-scratch.config.ts` duplicate the whole webServer/PORT/env setup

**File(s):** `web/playwright.webkit-scratch.config.ts:6-27` vs `web/playwright.config.ts:5-6,93-109`
(shared config) — pinned at SHA f934d43

#### Problem

The scratch config copy-pastes `PORT = 4173`, `baseURL`, `testDir`, `globalSetup`, the
`vite build && vite preview` command, `timeout: 180_000`, and the
`{ PUBLIC_ENABLE_DEV_HARNESS, ADMIN_ACCESS_TOKEN: 'test-admin-secret' }` env verbatim from the main
config:

```ts
// webkit-scratch:22-26
command: `npx vite build && npx vite preview --port ${PORT}`,
...
env: { PUBLIC_ENABLE_DEV_HARNESS: 'true', ADMIN_ACCESS_TOKEN: 'test-admin-secret' },
```

If the port, the secret, the harness flag, or the webServer command changes in the main config, the
scratch config silently rots. The magic secret `'test-admin-secret'` is duplicated in two files (and
is coupled to `.claude/rules/testing.md`).

#### Proposed solution

Extract the shared pieces (PORT, baseURL, globalSetup, webServer command/env/timeout) into a small
`web/playwright.shared.ts` and have both configs import and spread them, overriding only what
differs (the scratch config's `projects` and `reuseExistingServer`). Define `ADMIN_ACCESS_TOKEN`
test value and the harness env as named exports there.

#### Verification

Change PORT in the shared module and confirm both configs pick it up. Run
`node scripts/web.mjs playwright test -c playwright.webkit-scratch.config.ts` and the normal
`npm run test:e2e` and confirm both still boot the server.

---

### [P3][consistency] `vite.config.ts` exports an untyped plain object instead of using `defineConfig`

**File(s):** `web/vite.config.ts:57` (`export default { ... }`) — pinned at SHA f934d43

#### Problem

`vitest.config.ts:9` and both Playwright configs use `defineConfig(...)`, but `vite.config.ts`
exports a bare object literal:

```ts
export default {
  server: { ... },
  build: { ... },
  ...
};
```

Only one nested plugin is typed (`satisfies import('vite').Plugin`, line 96); the top-level object
has no `UserConfig` type, so typos in keys (`buld`, `plugin`), invalid option values, or a mistyped
`build.target` entry are not caught by `svelte-check`. This is an inconsistency across sibling
configs and loses the editor autocomplete every other config file here enjoys.

#### Proposed solution

Import `defineConfig` from `vite` and wrap the export: `export default defineConfig({ ... })`. This
types the whole object and lets the inline `satisfies` on the plugin be dropped.

#### Verification

Introduce a deliberately invalid option (e.g. `build: { targett: [...] }`) and confirm
`npm run check` now flags it. Confirm `npm run build` output is byte-identical.

---

### [P3][maintainability] Git-based version derivation is ~35 lines of imperative logic embedded in `vite.config.ts` and is untestable there

**File(s):** `web/vite.config.ts:16-49` (`git`, `webVersion`, `PKG_VERSION`) — pinned at SHA f934d43

#### Problem

The config file carries non-trivial branching logic — `git describe` parsing with a regex, a
two-level try/catch fallback chain, and version-string assembly:

```ts
function webVersion(pkg: string): string {
  const [major, minor] = pkg.split('.');
  try {
    const match = git('describe --tags --long --match "v*"').match(/-(\d+)-g[0-9a-f]+$/);
    if (match) return `${major}.${minor}.${match[1]}`;
  } catch { ... }
  try { return `${major}.${minor}.0+${git('rev-parse --short HEAD')}`; }
  catch { return pkg; }
}
```

This encodes the ADR-0030 versioning contract but lives inside a config module, so it cannot be
unit-tested and mixes "what the build is" with "how versions are computed." The regex and fallback
semantics are exactly the kind of logic that should have tests.

#### Proposed solution

Move `git`, `webVersion`, and the `PKG_VERSION`/`BUILD_TIME` derivation to a `scripts/` helper (e.g.
`scripts/web-version.mjs` or `web/build/version.ts`) exporting pure functions (take the
`git describe` output as an argument so it's mockable). `vite.config.ts` imports and calls it. Add a
Vitest spec covering the tag-present, no-tag, and no-git branches.

#### Verification

New unit test passes for all three branches. `npm run build` on a checkout with tags still yields
`major.minor.<n>`; on a shallow/tagless checkout yields `major.minor.0+<sha>`.

---

### [P3][consistency] The `CAPACITOR` "single signal" is re-derived independently in every config with a repeated literal comparison

**File(s):** `web/vite.config.ts:8`, `web/svelte.config.js:10`, `web/vitest.config.ts:18`
(isCapacitor) — pinned at SHA f934d43

#### Problem

`CLAUDE.md` calls `CAPACITOR=true` "the single signal," yet each config recomputes it:

```ts
const isCapacitor = process.env.CAPACITOR === 'true'; // vite.config.ts:8
const isCapacitor = process.env.CAPACITOR === 'true'; // svelte.config.js:10
```

and `vitest.config.ts:18` hardcodes the opposite (`__IS_CAPACITOR__: JSON.stringify(true)`) with its
own inline rationale. The `=== 'true'` comparison (easy to get wrong, e.g.
`Boolean(process.env.CAPACITOR)` which is truthy for `"false"`) is duplicated. There's no single
named export representing the platform signal, so "the single signal" is really three call sites.

#### Proposed solution

Add a tiny shared module (`web/build/platform.ts` / `.mjs`) exporting
`export const isCapacitor = process.env.CAPACITOR === 'true'` and import it into `vite.config.ts`
and `svelte.config.js`. This makes the "single signal" literally single and removes the risk of one
file using a laxer comparison.

#### Verification

`git grep -n "CAPACITOR === 'true'"` should return one hit. Build both targets and confirm adapter
selection and PWA inclusion are unchanged.

---

### [P3][documentation] Stale/incorrect comment: `vitest-setup.ts` says "jsdom" but the environment is happy-dom

**File(s):** `web/vitest-setup.ts:3-5` (comment) — pinned at SHA f934d43

#### Problem

```ts
// The storage + state layers gate browser-only work behind `browser` from
// `$app/environment`. Under vitest (jsdom) we always want the browser code
```

The Vitest environment is `happy-dom` (`vitest.config.ts:21`), and both `.claude/rules/testing.md`
and ADR-0009 explicitly state the suite uses happy-dom, "not jsdom." A newcomer reading this setup
file is told the wrong DOM implementation — exactly the sort of detail (happy-dom vs jsdom API gaps)
that matters when debugging a test-only DOM failure.

#### Proposed solution

Replace "(jsdom)" with "(happy-dom)". Optionally cite ADR-0009 for why.

#### Verification

`git grep -in jsdom web/` returns nothing after the fix (confirm no other stale references).

---

### [P4][documentation] Undocumented magic values in the PWA/webServer config (networkTimeoutSeconds, timeout, BUILD_TIME slice)

**File(s):** `web/vite.config.ts:27,137` and `web/playwright.config.ts:104` — pinned at SHA f934d43

#### Problem

Several load-bearing numbers have no WHY comment, which is exactly the case the project convention
says warrants one:

* `web/vite.config.ts:137` `networkTimeoutSeconds: 5` — the NetworkFirst fallback window for
  navigation requests; nothing explains why 5s (vs the child waiting on a stalled network).
* `web/vite.config.ts:27` `new Date().toISOString().slice(0, 16)` — `16` is the magic length that
  trims to `YYYY-MM-DDTHH:MM`; the comment above explains BUILD_TIME's purpose but not the slice.
* `web/playwright.config.ts:104` `timeout: 180_000` — the webServer boot budget (build + preview);
  no rationale for 3 minutes, and it's duplicated in the scratch config.

#### Proposed solution

Add one-line rationale comments (or named constants like `NAV_NETWORK_TIMEOUT_SECONDS`,
`WEBSERVER_BOOT_TIMEOUT_MS`). For the BUILD_TIME slice, a named helper or a comment
`// slice(0,16) → "YYYY-MM-DD HH:MM"` suffices.

#### Verification

Review confirms each magic number now carries either a name or a WHY. No behavior change.

---

### [P4][consistency] `.env.example` mixes placeholder conventions and has a redundant/misleading entry

**File(s):** `web/.env.example:11-13,41` — pinned at SHA f934d43

#### Problem

The file uses three different conventions for "fill this in":

```
# GEMINI_API_KEY=        (commented, empty)
GEMINI_API_KEY=replace   (uncommented, "replace")
ADMIN_ACCESS_TOKEN=replace
...
REDTEAM_FIXTURE_KEY=replace
```

`ALLOWED_TOKENS_LIST` gets a real working value (`"abc,daycare-club"`), others get `replace`, and
`GEMINI_API_KEY` is both commented-out (line 12 as documented-optional) *and* set to `replace` on
the next line — contradictory. Worse, `ADMIN_ACCESS_TOKEN=replace` implies it's consumed, but the
E2E web server hardcodes `ADMIN_ACCESS_TOKEN: 'test-admin-secret'` (`playwright.config.ts:108`),
overriding anything in `.env` — so copying this file with `replace` is silently ineffective for the
admin specs, which is confusing.

#### Proposed solution

Pick one placeholder convention (e.g. `KEY=` empty, or `KEY=<your-token>`), remove the duplicate
commented `# GEMINI_API_KEY=` above the active line, and add a note that `ADMIN_ACCESS_TOKEN` is
only used by `npm run dev:netlify` (the E2E suite injects its own).

#### Verification

`cp web/.env.example web/.env` then run `npm run dev:netlify` and `npm run test:e2e`; confirm the
doc comments now match which var each command actually reads.

---

### [P4][maintainability] Port `5173` is coupled across `vite.config.ts` and `web/netlify.toml` as bare literals

**File(s):** `web/vite.config.ts:59` (`port: 5173`) and `web/netlify.toml:25` (`targetPort = 5173`)
— pinned at SHA f934d43

#### Problem

The dev proxy target and the Vite dev port must match, but both are unnamed literals in different
files/formats:

```ts
server: { port: 5173, strictPort: true, ... }   // vite.config.ts:59
```

```toml
targetPort = 5173                                 // web/netlify.toml:25
```

`5173` is also hardcoded in several root `package.json` scripts (`dev:kill`, `adb:reverse`,
`android:live`). With `strictPort: true`, a change to one side without the other makes
`npm run dev:netlify` fail to proxy. Nothing links them; grepping `5173` returns many disconnected
hits.

#### Proposed solution

This is inherently cross-format (TOML can't import a TS constant), so the pragmatic fix is a
cross-reference comment on each (`# must match vite server.port (web/vite.config.ts)` /
`// dev port; mirrored in web/netlify.toml targetPort and dev:* scripts`). If stronger coupling is
wanted, drive the Vite port from an env var that `scripts/web.mjs` and netlify.toml share.

#### Verification

Change the Vite port and confirm the added comments point a maintainer to every mirror.
`npm run dev:netlify` proxies correctly when both match.

---

### [P4][readability] `playwright.config.ts` browser-fallback logic uses a bare magic index and three silent empty catches

**File(s):** `web/playwright.config.ts:15-49` (`chromiumExecutablePath`, `webkitAvailable`) — pinned
at SHA f934d43

#### Problem

```ts
.filter((d) => /^chromium-\d+$/.test(d))
.sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));   // line 23
```

`9` is the unexplained length of the `"chromium-"` prefix (a classic off-by-one hazard if the prefix
ever changes). The function also has three bare `} catch {}` blocks (lines 19, 31, 44) that swallow
all errors with no comment on why silence is correct — a reader can't tell intentional-fallback from
accidental error-hiding. This is dense environment-probing logic sitting in a config file.

#### Proposed solution

Replace `slice(9)` with a captured regex group (`d.match(/^chromium-(\d+)$/)?.[1]`) or a named
`const PREFIX = 'chromium-'` so intent is explicit. Add a short comment on each empty catch
("missing/unreadable path → fall through to next candidate"). Consider extracting both helpers to a
`scripts/` module so they can be unit-tested independently of Playwright.

#### Verification

Run E2E on a checkout where `chromium.executablePath()` is missing but a `chromium-<rev>` dir
exists; confirm the resolved path still selects the highest revision.

---

### [P4][documentation] Temporal wording in config comments will age ("now", "is now TypeScript")

**File(s):** `web/tsconfig.json:5-6` and `web/vite.config.ts:16` — pinned at SHA f934d43

#### Problem

```jsonc
// All of src/ is now TypeScript. Config files ... are unaffected by this.  (tsconfig.json:5)
```

Comments phrased as "now" / "is now" describe a transition rather than a stable state; a year on,
"now" is meaningless and the reader can't tell whether it still holds. The tsconfig comment's real
intent is "`allowJs: false` — src is TS-only." Similar transitional phrasing appears in the version
comment block.

#### Proposed solution

Reword to timeless statements of the invariant:
`// src/ is TypeScript-only; allowJs:false enforces it. Root config/build scripts live outside src/ and are exempt.`
Prefer describing the rule, not the migration.

#### Verification

Review; no behavior change. `npm run check` still passes.

---

### [P5][documentation] Misleading "matching PORT above" comment on the Playwright webServer

**File(s):** `web/playwright.config.ts:93-101` (webServer command) — pinned at SHA f934d43

#### Problem

```ts
// ... `vite preview` defaults to 4173, matching PORT above.
...
: `npx vite build && npx vite preview --port ${PORT}`,
```

The comment leans on `vite preview`'s *default* being 4173 "matching PORT above," but the command
actually passes `--port ${PORT}` explicitly — so the default is irrelevant and the note misleads a
reader into thinking the port coincidence is load-bearing (it isn't; the explicit flag governs). It
plants a false coupling to Vite's default that a Vite upgrade changing the default would appear to
threaten but wouldn't.

#### Proposed solution

Drop the "defaults to 4173, matching PORT above" clause; the `--port ${PORT}` flag is
self-documenting. If keeping context, say "served on PORT via the explicit `--port` flag."

#### Verification

Read-through; run `npm run test:e2e` to confirm the server still binds 4173.

---

### [P5][consistency] `PORT`/`baseURL` naming and `defineConfig` usage differ between the two Playwright configs and the reporter shape is inconsistent

**File(s):** `web/playwright.config.ts:64` vs `web/playwright.webkit-scratch.config.ts:13`
(reporter) — pinned at SHA f934d43

#### Problem

The two Playwright configs, which are otherwise near-identical, differ in small unexplained ways
beyond their intended purpose: the main config's `reporter: [['list'], ['html', { open: 'never' }]]`
vs the scratch config's `reporter: [['list']]` (reasonable, but undocumented), and
`reuseExistingServer: !process.env.CI` vs a flat `true`. Combined with the duplication flagged
above, a maintainer can't quickly tell which differences are intentional (scratch = local-only, no
HTML report) versus accidental drift.

#### Proposed solution

Once the shared base is extracted (see the P3 duplication finding), the scratch config should
express only its *intentional* deltas (webkit-only project, list-only reporter, always reuse server)
as explicit overrides on top of the shared config, making every difference a deliberate, visible
line.

#### Verification

Diff the two effective resolved configs after refactor; every difference should map to a documented
scratch-mode override.

---

### [P5][dead-config] `vitest.config.ts` omits `__PERF_MARKS__`, silently relying on a `typeof` guard in source

**File(s):** `web/vitest.config.ts:11-19` (define) — pinned at SHA f934d43; consumer
`web/src/lib/drawing/perf.ts:5`

#### Problem

Unlike the four other `__*__` defines, `__PERF_MARKS__` is absent from the Vitest `define`. It only
avoids a `ReferenceError` under test because `perf.ts:5` reads it as
`typeof __PERF_MARKS__ !== 'undefined' && __PERF_MARKS__`. So the config relies on a defensive guard
in application source rather than declaring the constant — an implicit coupling that will bite the
moment any test imports a module referencing `__PERF_MARKS__` bare. (Overlaps the P2 define-drift
finding; called out separately because the fix is a one-liner even if the broader refactor is
deferred.)

#### Proposed solution

Add `__PERF_MARKS__: JSON.stringify(false)` to the Vitest `define` block so all five compile-time
globals are declared in every config, and the `typeof` guard in `perf.ts` becomes
belt-and-suspenders rather than required.

#### Verification

Add a test importing a module that references `__PERF_MARKS__` directly; it should pass without the
guard. `npm run test:unit` stays green.

## Source: Code audit — Native shells (android + ios + fastlane)

### [P2][dead-config] Stray `</content></invoke>` tokens leaked into a shipped Play Store changelog

**File(s):** `fastlane/metadata/android/en-US/changelogs/4.txt:15-18` (fastlane metadata) — pinned
at SHA f934d43

#### Problem

The end of the v4 Android changelog contains leftover tool/markup tokens that were never meant to
ship:

```
• App updates no longer leave stale content.
  </content>
  </invoke>
```

`fastlane supply` uploads these `.txt` files verbatim as the Google Play "What's new" text, so this
release's store listing literally shows `</content>` and `</invoke>` to parents. It is a copy-paste
artifact from an AI/editor session that escaped review. Every other changelog ends cleanly; only
`4.txt` is polluted.

#### Proposed solution

Delete the two trailing lines (`</content>` and `</invoke>`) so the file ends at "…no longer leave
stale content." Add a lightweight guard so this can't recur — e.g. a test or lint step that fails if
any `fastlane/metadata/**/*.txt` contains `<` / `>` markup tokens.

#### Verification

`grep -RnE '</?(content|invoke|parameter)' fastlane/metadata` returns nothing after the fix. Confirm
the changelog reads as clean prose end-to-end.

---

### [P2][single-source-of-truth] The app id `art.splotch.app` is hardcoded in six+ native files

**File(s):** `capacitor.config.json:2`, `android/app/build.gradle:12,25`,
`android/app/src/main/res/values/strings.xml:5-6`, `ios/App/App.xcodeproj/project.pbxproj:320,341`
(native identity) — pinned at SHA f934d43

#### Problem

The bundle identifier is repeated as a literal string in at least six places with no single source:

* `capacitor.config.json` → `"appId": "art.splotch.app"`
* `android/app/build.gradle` → `namespace = "art.splotch.app"` **and**
  `applicationId
  "art.splotch.app"`
* `android/app/src/main/res/values/strings.xml` → `package_name` **and** `custom_url_scheme`, both
  `art.splotch.app`
* `ios/.../project.pbxproj` → `PRODUCT_BUNDLE_IDENTIFIER = art.splotch.app` (Debug **and** Release)

`capacitor.config.json` already declares `appId`, which is conceptually the source of truth, yet the
native files each repeat the literal rather than deriving it. A rename (or a build-variant suffix
like `.dev`) requires a coordinated edit across three languages, and there is no test asserting the
copies agree. Note `strings.xml` even repeats it twice for two different keys.

#### Proposed solution

At minimum, document the canonical location (`capacitor.config.json.appId`) and add a check (a
Vitest/asset-pipeline assertion or a `scripts/` guard) that all native copies equal it. Where the
build system allows, derive instead of duplicate — e.g. Android `namespace`/`applicationId` can
share a single `ext` value, and `strings.xml`'s `package_name`/`custom_url_scheme` can be generated.

#### Verification

Grep the tree for `art.splotch.app`; every occurrence should trace back to one declared value or be
covered by an equality assertion. Change the id in one place in a scratch branch and confirm the
guard flags the drift.

---

### [P2][dead-config] Capacitor template smoke-tests assert the wrong package and would fail if run

**File(s):**
`android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java:24`,
`android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java:12-18` (Android tests) —
pinned at SHA f934d43

#### Problem

Both files are unmodified Capacitor scaffolding left in the app package `com.getcapacitor.myapp`
(not `art.splotch.app`). `ExampleUnitTest` only asserts `2 + 2 == 4`. `ExampleInstrumentedTest`
asserts:

```java
assertEquals("com.getcapacitor.app", appContext.getPackageName());
```

The real package is `art.splotch.app`, so this instrumented test is guaranteed to **fail** if it is
ever executed — it is stale boilerplate that only survives because the native test tasks aren't run
in CI (the repo's testing strategy uses Maestro smoke tests instead — see the `testing` skill).
Their presence is misleading: a newcomer running `./gradlew test`/`connectedCheck` gets a red build
from dead sample code, and the wrong `com.getcapacitor.myapp` package clutters `git grep`.

#### Proposed solution

Delete both `ExampleUnitTest.java` and `ExampleInstrumentedTest.java` (and the empty
`com/getcapacitor/myapp` dirs). If any native JVM test is genuinely wanted, add a real one under
`art/splotch/app` asserting the correct package id.

#### Verification

`git rm` the files; `./gradlew :app:testDebugUnitTest` still succeeds (nothing to run) and no source
references `com.getcapacitor.myapp`.

---

### [P3][dead-config] google-services / Firebase scaffolding is wired up but the app has no push

**File(s):** `android/build.gradle:11`, `android/app/build.gradle:70-77` (Android Gradle) — pinned
at SHA f934d43

#### Problem

The root build script adds the Google Services classpath:

```groovy
classpath 'com.google.gms:google-services:4.4.4'
```

and the app script conditionally applies the plugin, logging about push notifications:

```groovy
try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, ... Push Notifications won't work")
}
```

Splotch is an offline-first, privacy-first kids' app: there is **no** push plugin in the Capacitor
plugin set (secure-storage, media, device, filesystem, haptics, network, preferences,
screen-orientation, status-bar), no `google-services.json` (not tracked, not in `.gitignore`'s
active list), and no messaging permission in the manifest. This is dead Capacitor template
scaffolding that pulls in a Google dependency and implies a push capability the app deliberately
doesn't have — a real concern for a Families-policy app whose data posture is scrutinized.

#### Proposed solution

Remove the `com.google.gms:google-services` classpath from `android/build.gradle` and the
`google-services.json` try/apply block from `android/app/build.gradle`. If push is ever added, wire
it back deliberately (and document it in the `mobile` skill's compliance checklist).

#### Verification

`grep -rin 'google.services\|google-services\|firebase' android` returns nothing; a release build
(`bundleRelease`) still succeeds.

---

### [P3][dead-config] iOS requires the obsolete `armv7` capability on a 64-bit-only (iOS 16.4) app

**File(s):** `ios/App/App/Info.plist:35-38` (iOS Info.plist) — pinned at SHA f934d43

#### Problem

```xml
<key>UIRequiredDeviceCapabilities</key>
<array>
    <string>armv7</string>
</array>
```

`armv7` is the 32-bit ARM instruction set. The project's `IPHONEOS_DEPLOYMENT_TARGET` is `16.4`
(pbxproj) and SPM `platforms: [.iOS(.v16)]`; iOS 11+ dropped all 32-bit devices, so every device
that can install this app is `arm64`. Requiring `armv7` is stale template cruft — at best a no-op,
at worst it advertises a false capability. It should read `arm64` (or the key should be omitted).

#### Proposed solution

Change the required capability from `armv7` to `arm64`, or remove the `UIRequiredDeviceCapabilities`
key entirely (the deployment target already constrains eligible devices).

#### Verification

Archive/validate the app; App Store Connect accepts the build and device eligibility is unchanged
(arm64-only).

---

### [P3][dead-config] pbxproj injects a `COCOAPODS` compile flag, but the project uses SPM not CocoaPods

**File(s):** `ios/App/App.xcodeproj/project.pbxproj:319` (Xcode build settings) — pinned at SHA
f934d43

#### Problem

The Debug config sets:

```
OTHER_SWIFT_FLAGS = "$(inherited) \"-D\" \"COCOAPODS\" \"-DDEBUG\"";
```

The `-DCOCOAPODS` conditional-compilation flag is a CocoaPods artifact, but this project migrated to
Swift Package Manager (the `mobile`/`ios` guidance explicitly says "SPM not CocoaPods", `.gitignore`
ignores `App/Pods`, and dependencies come from `CapApp-SPM/Package.swift`). Any `#if COCOAPODS`
branch in a dependency would now compile down the wrong (Pods) path in Debug, and the flag misleads
anyone reading the build settings into thinking Pods are in play.

#### Proposed solution

Drop the `\"-D\" \"COCOAPODS\"` tokens from `OTHER_SWIFT_FLAGS` (leaving
`"$(inherited) \"-DDEBUG\""`, or just `$(inherited)` since
`SWIFT_ACTIVE_COMPILATION_CONDITIONS =
DEBUG` already defines DEBUG).

#### Verification

Clean-build the Debug scheme; it compiles with no CocoaPods define.
`grep COCOAPODS
ios/App/App.xcodeproj/project.pbxproj` returns nothing.

---

### [P3][consistency] PencilEraserPlugin comment claims iOS 15 deployment target; it is actually 16.4

**File(s):** `ios/App/App/PencilEraserPlugin.swift:27-28` (iOS plugin) — pinned at SHA f934d43

#### Problem

```swift
// The classic delegate callback is the only one available down to iOS 15 (the project's
// deployment target); it still fires on newer iPadOS, so we always interpret a tap as
```

The project's deployment target is **16.4** (`IPHONEOS_DEPLOYMENT_TARGET = 16.4` in all four pbxproj
configs; `Package.swift` pins `.iOS(.v16)`). The comment's "(the project's deployment target)" is
factually wrong and, since the newer `preferredTapAction` API is available from iOS 16, the stated
rationale for using only the classic callback no longer holds as written. A future contributor
trusting this comment could make the wrong availability decision.

#### Proposed solution

Correct the parenthetical to iOS 16.4 (or remove the "project's deployment target" clause) and, if
the classic callback is still deliberately preferred over `preferredTapAction`, restate the actual
reason (it fires reliably regardless of the user's system tap-action preference — which the next
sentence already says).

#### Verification

Confirm against the pbxproj/Package.swift target; the comment's version matches the real deployment
target.

---

### [P3][dead-config] Unused `AppTheme.NoActionBar` style

**File(s):** `android/app/src/main/res/values/styles.xml:12-16` (Android theme) — pinned at SHA
f934d43

#### Problem

`styles.xml` defines three themes: `AppTheme`, `AppTheme.NoActionBar`, and
`AppTheme.NoActionBarLaunch`. The manifest only references `@style/AppTheme` (application) and
`@style/AppTheme.NoActionBarLaunch` (activity). `AppTheme.NoActionBar` is never referenced anywhere
in the tree — leftover Capacitor template boilerplate.

```xml
<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
    ...
</style>
```

Dead resource that invites confusion about which theme is "the" app theme.

#### Proposed solution

Remove the `AppTheme.NoActionBar` style block (verify no `res/` or manifest reference first).

#### Verification

`grep -rn 'NoActionBar\b' android/app/src` shows only `NoActionBarLaunch` remains; the app builds
and looks identical.

---

### [P3][dead-config] Unused `activity_main.xml` layout — BridgeActivity never inflates it

**File(s):** `android/app/src/main/res/layout/activity_main.xml:1-12` (Android layout) — pinned at
SHA f934d43

#### Problem

This layout defines a `CoordinatorLayout` wrapping a bare `<WebView/>`:

```xml
<androidx.coordinatorlayout.widget.CoordinatorLayout ...>
    <WebView android:layout_width="match_parent" android:layout_height="match_parent" />
</androidx.coordinatorlayout.widget.CoordinatorLayout>
```

`MainActivity extends BridgeActivity`, which builds and manages its own Capacitor `WebView` in code
and never calls `setContentView(R.layout.activity_main)`. The layout is unused Capacitor template
scaffolding. Its presence is the only reason the `androidx.coordinatorlayout` dependency in
`app/build.gradle:59` appears "used", so it also masks a possibly-removable dependency.

#### Proposed solution

Delete `activity_main.xml`. Check whether `androidx.coordinatorlayout:coordinatorlayout` is then
still needed (Capacitor's bridge layout may pull it transitively); if not, drop that
`implementation` line and its `variables.gradle` version entry.

#### Verification

Build and launch on device — the canvas renders unchanged.
`grep -rn 'activity_main\|R.layout'
android/app/src` returns nothing.

---

### [P3][duplication] Android changelog 5 and the iOS release notes are byte-identical, maintained by hand in two files

**File(s):** `fastlane/metadata/android/en-US/changelogs/5.txt`,
`fastlane/metadata/en-US/release_notes.txt` (fastlane metadata) — pinned at SHA f934d43

#### Problem

`changelogs/5.txt` (Android) and `en-US/release_notes.txt` (iOS) contain the exact same "What's new"
copy for the current release, but live in two separate files with no shared source. The next release
requires editing both by hand and keeping them in sync; the `4.txt` markup-leak bug above shows how
easily one copy drifts or gets corrupted without the other noticing. There is no note explaining the
relationship or which file is authoritative.

#### Proposed solution

Either generate the per-platform files from one source (e.g. the `release` skill/script writes both
from a single release-notes input), or document in the fastlane metadata dir that the current
release's Android `N.txt` and iOS `release_notes.txt` must match, backed by an equality check.

#### Verification

`diff fastlane/metadata/android/en-US/changelogs/5.txt fastlane/metadata/en-US/release_notes.txt` is
empty and stays empty via generation or a guard.

---

### [P3][single-source-of-truth] Version (`5` / `1.3.0`) duplicated across gradle and four pbxproj settings with no in-file pointer

**File(s):** `android/app/build.gradle:28-29`,
`ios/App/App.xcodeproj/project.pbxproj:311,318,333,340` (native version) — pinned at SHA f934d43

#### Problem

`versionCode 5` / `versionName "1.3.0"` (Android) are mirrored by `CURRENT_PROJECT_VERSION = 5` and
`MARKETING_VERSION = 1.3.0` in **both** the Debug and Release pbxproj configs (four literals). The
`android/CLAUDE.md` notes these are set by `capacitor-set-version` during `npm run release`, so the
source of truth is really `package.json`, but none of the native files say so — a contributor
opening `build.gradle` or the pbxproj sees a hand-editable literal with no breadcrumb, and the
`android/CLAUDE.md` warning ("Don't hand-edit versionCode/versionName") has no iOS counterpart in
the `mobile`/`ios` guidance.

#### Proposed solution

Add a short comment at each native version literal pointing to the canonical source and the
`capacitor-set-version` flow (or reference it from the `ios` skill as the `android` one does). The
two duplicated pbxproj configs could also be hoisted into an `.xcconfig` so `MARKETING_VERSION`/
`CURRENT_PROJECT_VERSION` are declared once instead of per-config.

#### Verification

Run `npm run release` in a scratch branch; confirm all four pbxproj values and the two gradle values
move together, and that the new comments/pointers match reality.

---

### [P4][documentation] `android:allowBackup="true"` is unexplained for a privacy-first kids app

**File(s):** `android/app/src/main/AndroidManifest.xml:4` (Android manifest) — pinned at SHA f934d43

#### Problem

```xml
android:allowBackup="true"
```

This is the template default and is the one manifest attribute with a real privacy dimension:
`allowBackup=true` lets Android Auto Backup copy the app's data (including anything the
secure-storage / preferences plugins persist) to the user's Google account. Every other manifest
entry here carries a rationale comment (INTERNET, ACCESS_NETWORK_STATE, WRITE_EXTERNAL_STORAGE), but
this security-relevant flag has none. For a Families-policy app, whether child-created content and
any stored state should leave the device is a deliberate decision, not a default to inherit
silently.

#### Proposed solution

Decide intentionally and document it: either keep `allowBackup="true"` with a comment stating that
only non-sensitive local drawing state is backed up, or set it to `false` (and/or add
`fullBackupContent`/`dataExtractionRules`) if child content should never leave the device. Note the
choice in the `mobile` skill's kids-compliance checklist.

#### Verification

Manifest reflects an explicit, commented decision; if changed to `false`, `adb backup` produces no
app data.

---

### [P4][maintainability] FileProvider paths expose entire external + cache roots with template names

**File(s):** `android/app/src/main/res/xml/file_paths.xml:2-5` (Android FileProvider) — pinned at
SHA f934d43

#### Problem

```xml
<external-path name="my_images" path="." />
<cache-path name="my_cache_images" path="." />
```

`path="."` grants the FileProvider access to the **whole** external-files root and the **whole**
cache dir, and the entry names (`my_images`, `my_cache_images`) are unmodified Capacitor sample
names. Scoping a content provider to the entire root is broader than a "save one screenshot to the
gallery" flow needs, and the generic names give no hint of what actually shares files. This is the
provider referenced by `AndroidManifest.xml:23-29`.

#### Proposed solution

Narrow the shared paths to the specific subdirectory the media/filesystem export uses (e.g. a
`shared_images/` subpath) and rename the entries to something descriptive (`shared_drawings`). If
the wide scope is genuinely required by `@capacitor-community/media`, add a comment saying so.

#### Verification

Save-to-gallery / share still works on device; the provider no longer exposes unrelated files.

---

### [P4][duplication] The DeviceLock "Parent Center" rationale comment is duplicated verbatim across Java and Swift

**File(s):** `android/app/src/main/java/art/splotch/app/DeviceLockPlugin.java:12-15`,
`ios/App/App/DeviceLockPlugin.swift:5-6` (native plugins) — pinned at SHA f934d43

#### Problem

Both plugins carry the same hand-maintained sentence explaining the feature ("Surfaces whether …
lock is … engaged so the Parent Center can confirm the lock is on (green check) and swap its
'enable' steps for 'unpin'/'exit' steps."). The shared user-facing behavior lives in two
implementation comments that must be edited in lockstep to stay accurate; there is no single place
that documents the DeviceLock contract (JS name `DeviceLock`, method `isLocked` → `{locked}`).

#### Proposed solution

Document the cross-platform DeviceLock contract once — in the web-side plugin interface/TypeScript
definition that calls `DeviceLock.isLocked()`, or in the `mobile`/`architecture` skill — and reduce
the two native comments to a pointer plus platform-specific notes (Android lock-task state vs. iOS
Guided Access).

#### Verification

The behavioral description exists in exactly one canonical location; the native files reference it.

---

### [P4][dead-config] `AppDelegate.swift` is wall-to-wall empty template lifecycle stubs

**File(s):** `ios/App/App/AppDelegate.swift:14-34` (iOS app delegate) — pinned at SHA f934d43

#### Problem

Five lifecycle methods (`applicationWillResignActive`, `applicationDidEnterBackground`,
`applicationWillEnterForeground`, `applicationDidBecomeActive`, `applicationWillTerminate`) have
empty bodies containing only the stock Apple template prose ("Sent when the application is about to
move from active to inactive state… Games should use this method to pause the game."). None of it
applies to Splotch, and the noise buries the two methods that *do* carry real logic (`open url` and
the `supportedInterfaceOrientationsFor` override at lines 42-60). A reader has to wade through
boiler comments to find the one intentional customization.

#### Proposed solution

Delete the empty stub methods and their template comments (they are optional protocol methods; the
default behavior is identical). Keep `didFinishLaunchingWithOptions`, the
`open url`/`continue
userActivity` proxies, and the orientation override with its existing
explanatory comment.

#### Verification

Build and run on device — background/foreground/rotation behavior is unchanged; the file now shows
only methods that do something.

---

### [P4][maintainability] App-local iOS plugins were added via hand-crafted sequential pbxproj UUIDs

**File(s):** `ios/App/App.xcodeproj/project.pbxproj:14-16,28-30,168-170` (Xcode project) — pinned at
SHA f934d43

#### Problem

The three app-local Swift sources (`DeviceLockPlugin`, `MainViewController`, `PencilEraserPlugin`)
were registered by hand-editing the pbxproj with obviously synthetic, sequential object IDs:

```
DE1CE10C0000000000000001 /* DeviceLockPlugin.swift in Sources */ ...
DE1CE10C0000000000000005 /* MainViewController.swift in Sources */ ...
DE1CE10C0000000000000007 /* PencilEraserPlugin.swift in Sources */ ...
```

Xcode normally emits random 24-hex UUIDs; these zero-padded counters signal a manual/scripted edit.
That's workable but fragile: it isn't obvious to a newcomer that these files are wired in by hand
(not by Xcode's UI or `cap sync`), and a future `cap` project regeneration could clobber them
silently. There's no comment or doc noting that these three files must be re-added if the project is
regenerated.

#### Proposed solution

Add a short note (in the `ios` skill or a comment where the plugins are registered in
`MainViewController.swift`) stating that these app-local sources are wired into the pbxproj by hand
and must be re-added after any Capacitor project regeneration. Optionally regenerate the refs
through Xcode so they carry normal UUIDs.

#### Verification

The manual-wiring caveat is documented where a contributor regenerating the iOS project would see
it; a fresh checkout still builds all three sources into the App target.

---

### [P4][consistency] `Info.plist` `CAPACITOR_DEBUG` resolves to empty in Release with no explanation

**File(s):** `ios/App/App/Info.plist:5-6`, `ios/debug.xcconfig:1`,
`ios/App/App.xcodeproj/project.pbxproj:307,199` (iOS config) — pinned at SHA f934d43

#### Problem

`Info.plist` embeds `<key>CAPACITOR_DEBUG</key><string>$(CAPACITOR_DEBUG)</string>`. The
`CAPACITOR_DEBUG = true` value comes from `debug.xcconfig`, which is set as the
`baseConfigurationReference` **only** on the two Debug configs (pbxproj lines 199 and 307). The
Release configs have no base xcconfig, so `$(CAPACITOR_DEBUG)` expands to an empty string in shipped
builds. That is almost certainly intended (debug flag off in Release), but nothing states it, and
the asymmetry (xcconfig wired to Debug only) is easy to misread as a mistake or to break by
"helpfully" adding the base config to Release.

#### Proposed solution

Add a one-line comment in `debug.xcconfig` (or the `ios` skill) explaining that `CAPACITOR_DEBUG` is
deliberately Debug-only and expands empty in Release, so the intent is discoverable.

#### Verification

Archive a Release build and confirm `CAPACITOR_DEBUG` is empty; the documented intent matches
behavior.

---

### [P5][documentation] `ExportOptions.plist` lacks a pointer to who consumes it and when teamID matters

**File(s):** `ios/App/ExportOptions.plist:11-15` (iOS export config) — pinned at SHA f934d43

#### Problem

The file carries a commented-out `teamID` block with decent inline guidance, but nothing says which
command consumes `ExportOptions.plist` (`xcodebuild -exportArchive` / the `build` skill's IPA lane)
or that `method = app-store-connect` requires an authenticated App Store Connect session. A newcomer
finds a bare plist with no breadcrumb to the release flow it belongs to. The commented `teamID` also
duplicates a value that, if ever needed, would then live here *and* in signing config.

#### Proposed solution

Add a leading comment naming the consumer (the export/archive step in the `build`/`release` tooling)
and linking to the `mobile`/`ios` release checklist, so the plist is self-locating.

#### Verification

The plist header points a reader to the release lane; no behavior change.

---

### [P5][naming] Example-test package `com.getcapacitor.myapp` misrepresents ownership

**File(s):** `android/app/src/androidTest/java/com/getcapacitor/myapp/`,
`android/app/src/test/java/com/getcapacitor/myapp/` (Android test packages) — pinned at SHA f934d43

#### Problem

Even setting aside that these tests are dead (see the P2 finding), the directory/package name
`com.getcapacitor.myapp` places project files under the Capacitor framework's namespace rather than
`art.splotch.app`. It's inconsistent with every other source file in the app and pollutes package
search. This is subsumed by the delete recommended above, but flagged separately in case any native
test is retained rather than removed.

#### Proposed solution

If any native test survives cleanup, move it to `art/splotch/app` so test code shares the app's
package namespace.

#### Verification

No tracked source or test lives under `com/getcapacitor/` after cleanup.

## Source: Code audit — .claude / .codex config (hooks, rules, settings)

### [P2][dead-config] Overly broad allow rules grant destructive commands without a prompt

**File(s):** `.claude/settings.json:48,59,54,62-64` (permissions.allow) — pinned at SHA f934d43

#### Problem

Several allow-list entries are read-only in intent but permit destructive or file-writing operations
with no confirmation:

```json
"Bash(git rm *)",     // line 48 — deletes tracked files, no prompt
"Bash(sed *)",        // line 59 — `sed -i` rewrites files in place
"Bash(find *)",       // line 54 — `find . -delete` / `-exec rm` deletes
"Bash(curl -s * http://localhost:*)",  // line 62 — the middle `*` matches `-o /path`, letting curl write arbitrary files
```

The surrounding block (lines 50-60) is clearly meant to be the "safe read-only tools" group (`grep`,
`ls`, `cat`, `head`, `tail`, `wc`, `echo`, `jq`), but `sed *`, `find *`, and `git rm *` are filed
alongside them despite each having a well-known destructive mode. `Bash(git rm *)` in particular is
a standalone destructive git command sitting in the git group; the rest of that group (`git status`,
`git log`, `git diff`, `git show`, `git branch`, `git stash list`) is all read-only.

#### Proposed solution

Tighten each to its read-only shape, or drop it from the auto-allow list so the operator confirms:

* Remove `Bash(git rm *)` — deletions should prompt.
* Replace `Bash(sed *)` with the actual usage pattern if any (Claude rarely needs `sed` given
  Edit/Grep tools; consider removing it entirely — the repo convention discourages
  `sed`/`cat`/`echo` in favor of dedicated tools).
* Replace `Bash(find *)` with a narrower form, or remove; `Glob`/`Grep` tools cover discovery.
* Narrow the curl entries to a fixed flag prefix, e.g. `Bash(curl -s http://localhost:*)` and
  `Bash(curl -s -i http://localhost:*)`, so the wildcard can't inject `-o`.

#### Verification

For each entry, in a scratch clone run the destructive form (`git rm README.md`, `sed -i s/a/b/ f`,
`find . -name x -delete`) and confirm Claude currently executes it without a permission prompt;
after tightening, confirm the destructive form now prompts while the intended read-only use still
passes.

---

### [P2][error-handling] `session-start.sh` final `svelte-kit sync` is unguarded under `set -e`, contradicting the hook's best-effort intent

**File(s):** `.claude/hooks/session-start.sh:2,30-33,42` — pinned at SHA f934d43

#### Problem

The hook opens with `set -euo pipefail` (line 2) and deliberately wraps the fragile `npm install`
step in a fallback so a failed lifecycle script "doesn't kill this hook silently, leaving the
session with no deps at all" (lines 25-33). But the final step is bare:

```bash
node scripts/web.mjs svelte-kit sync   # line 42 — no || guard
```

Under `set -e`, if `svelte-kit sync` exits non-zero (e.g. a transient generate failure, or a partial
`node_modules` from the `--ignore-scripts` fallback path just above), the whole SessionStart hook
exits non-zero. That is inconsistent with the philosophy the file itself states two steps earlier,
and with the sibling `.codex/cloud/*.sh` scripts, which `|| warn` every step. A missing
`.svelte-kit` types dir degrades `npm run check`/`dev` but shouldn't abort session startup.

#### Proposed solution

Guard the final command so a failure is surfaced but non-fatal, matching the npm-install treatment:

```bash
node scripts/web.mjs svelte-kit sync \
  || echo "session-start.sh: svelte-kit sync failed — run 'node scripts/web.mjs svelte-kit sync' before 'npm run check'"
```

#### Verification

Temporarily make `scripts/web.mjs` exit non-zero (or point it at a bad subcommand), run
`CLAUDE_CODE_REMOTE=true CLAUDE_PROJECT_DIR=$PWD bash .claude/hooks/session-start.sh; echo "exit=$?"`,
and confirm the hook currently exits non-zero; after the fix it prints the warning and exits 0.

---

### [P2][duplication] The npm@11 pin (logic + multi-line rationale) is copy-pasted across four shell files and has already drifted

**File(s):** `.claude/hooks/session-start.sh:12-19`, `.claude/cloud/setup.sh:14-23`,
`.codex/cloud/setup.sh:37-44`, `.codex/cloud/maintenance.sh:29-33` — pinned at SHA f934d43

#### Problem

The same decision — pin npm to 11 because `package-lock.json` is authored by npm 11 and other majors
dirty the tree on optional-peer entries — is re-explained at length in four places, with the command
`npx -y npm@11 install -g npm@11` repeated in three of them. The prose has already drifted:

* `.claude/cloud/setup.sh:15` says "the container image ships npm 10"
* `.codex/cloud/setup.sh:38` says "the Codex image ships npm 11.4.2"
* `session-start.sh:15-19` gives yet a third framing ("npm 10 and 11 disagree on optional-peer
  entries")

Four copies of a rationale means four places to update when the npm story changes, and they are
already telling slightly different stories.

#### Proposed solution

Collapse the rationale to one canonical home (it partly lives in `docs/CLOUD/Claude.md` /
`docs/CLOUD/Codex.md` already) and have each script carry a one-line comment plus a doc pointer
instead of the full paragraph, e.g.
`# Pin npm@11 to match package-lock.json's authoring major — see docs/CLOUD/Codex.md.` The command
itself can't be factored into a shared sourced file (the cloud scripts are pasted into web dialogs
and must be standalone), so keep the command inline but stop duplicating the multi-line explanation.

#### Verification

`grep -rn "optional-peer\|npm@11 install -g npm@11" .claude .codex` currently returns the rationale
in four files; after the change each file has a single-line comment and the long explanation exists
in exactly one doc.

---

### [P2][consistency] Codex `setup.sh` and `maintenance.sh` are ~90% identical and have already diverged in ways that look accidental

**File(s):** `.codex/cloud/setup.sh:46-51`, `.codex/cloud/maintenance.sh:35-40` — pinned at SHA
f934d43

#### Problem

The two Codex scripts share the same header, `warn()` helper, npm pin, `npm ci`, Playwright install,
and `svelte-kit sync` — but the shared steps differ in ways that read as drift, not intent:

* `setup.sh:48` runs `playwright install --with-deps chromium`; `maintenance.sh:37` runs
  `playwright install chromium` (no `--with-deps`). If the OS deps are needed at setup they're
  presumably still needed after a maintenance refresh on a rebuilt container.
* `setup.sh:27-33` runs a Node-version check (`major !== 22 || minor < 12`); `maintenance.sh` has no
  equivalent, so a maintenance run on a bumped image silently skips the guard.

Nothing in the comments explains why maintenance intentionally omits `--with-deps` or the Node
check, so a reader can't tell whether the difference is deliberate.

#### Proposed solution

Either (a) make the shared steps identical unless a divergence is intentional and commented, or (b)
if they must stay separate UI-pasted scripts, add a one-line comment at each divergence stating why
(e.g. "`--with-deps` omitted — maintenance runs on an image that already has the apt deps"). Align
the Playwright flag and decide whether the Node check belongs in both.

#### Verification

`diff <(sed -n '26,60p' .codex/cloud/setup.sh) <(sed -n '26,49p' .codex/cloud/maintenance.sh)` shows
the current divergences; after the fix each remaining difference is either removed or has an
adjacent comment justifying it.

---

### [P3][dead-config] `Bash(node scripts/*)` is fully redundant with `Bash(node scripts/**)`

**File(s):** `.claude/settings.json:37-38` — pinned at SHA f934d43

#### Problem

```json
"Bash(node scripts/*)",
"Bash(node scripts/**)",
```

In gitignore-style matching `**` matches across path separators, so `scripts/**` already matches
everything `scripts/*` does (and more, e.g. `scripts/sub/x.mjs`). The `scripts/*` entry adds
nothing.

#### Proposed solution

Delete line 37; keep only `Bash(node scripts/**)`.

#### Verification

Confirm `node scripts/sub/anything.mjs` is still auto-allowed with only the `**` entry present, and
that removing line 37 changes no observable permission behavior.

---

### [P3][dead-config] `Bash(afplay *)` is a dead (and macOS-only) permission with no consumer in the repo

**File(s):** `.claude/settings.json:72` — pinned at SHA f934d43

#### Problem

`afplay` is macOS's audio player. A repo-wide grep finds it only in `settings.json` — no hook,
skill, script, or `.ruler` source invokes it:

```
$ grep -rn "afplay" .claude .ruler scripts
.claude/settings.json:72:      "Bash(afplay *)",
```

It looks like a leftover from a since-removed notification/Stop-hook sound. It also can't work on
the Linux dev/cloud environments the project supports (ADR-0017). Dead config in the allow list
makes the real, load-bearing entries harder to audit.

#### Proposed solution

Remove line 72. If a completion sound is still wanted, wire it through a Stop hook and a
cross-platform helper (per ADR-0017's "platform tools via Node helpers" rule), then re-add a scoped
permission for that helper.

#### Verification

`grep -rn afplay` returns only `settings.json` today; after removal it returns nothing and no
workflow regresses (nothing invoked it).

---

### [P3][maintenance] `cloud-branch-preview.sh` embeds a dated, mutable "CURRENT MODE" fact that is injected into every cloud session

**File(s):** `.claude/hooks/cloud-branch-preview.sh:24-31` — pinned at SHA f934d43

#### Problem

The heredoc hard-codes a Netlify preview-mode fact with a date:

```
CURRENT MODE: restricted (as of 2026-07-09). Assume a plain `feat/*` push
produces NO live preview.
```

This is exactly the kind of fast-moving operational state that goes stale silently: if the site
flips back to "Full" mode, every cloud session is told the wrong thing until someone remembers this
string lives inside a shell hook (not in a doc, not in config). Embedding a `(as of DATE)` marker in
a script is a smell that the value doesn't belong in the script.

#### Proposed solution

Move the current-mode fact to a single source of truth (a line in `docs/CLOUD/Claude.md`, which the
heredoc already cites) and have the hook reference it rather than restating it, or read it from an
env var set on the cloud environment. At minimum, add a comment reminding editors that the mode
string must be updated here when Netlify config changes.

#### Verification

Confirm the mode currently appears verbatim only in this hook; after the change the authoritative
value lives in one place and the hook points at it.

---

### [P3][duplication] `cloud-branch-preview.sh` restates ~37 lines of the branching/preview convention already in `docs/CLOUD/Claude.md`

**File(s):** `.claude/hooks/cloud-branch-preview.sh:12-49` — pinned at SHA f934d43

#### Problem

The heredoc (lines 13-49) is a full prose walkthrough of the cloud branching workflow, preview
modes, and slug-URL derivation — content that the file itself says lives in `docs/CLOUD/Claude.md`
("See docs/CLOUD/Claude.md", lines 7, 24). Two hand-maintained copies of the same multi-step
procedure will drift; the hook is the copy most likely to go unnoticed when the doc is updated.

#### Proposed solution

Trim the injected text to the actionable essentials the model needs at session start (branch off
`origin/main` as `feat/<feature>`; restricted mode → no preview for plain `feat/*`; how to get a
`feature/*` preview on demand) and defer the full explanation to the doc via a single pointer. Keep
injected context lean — it costs tokens every cloud session.

#### Verification

Compare the heredoc against `docs/CLOUD/Claude.md`'s "Two preview modes" section for overlap; after
trimming, the operational steps exist in one authoritative place with the hook citing it.

---

### [P3][consistency] Claude cloud `setup.sh` uses `#!/bin/bash` while the Codex scripts use `#!/usr/bin/env bash`

**File(s):** `.claude/cloud/setup.sh:1`, `.claude/hooks/*.sh:1`, `.codex/cloud/setup.sh:1`,
`.codex/cloud/maintenance.sh:1` — pinned at SHA f934d43

#### Problem

The `.claude` shell files use `#!/bin/bash`; the `.codex` files use `#!/usr/bin/env bash`. Both are
reasonable, but the split is arbitrary and undocumented. `#!/usr/bin/env bash` is the more portable
choice (macOS ships an ancient `/bin/bash` 3.2; a Homebrew bash lands on PATH), and ADR-0017
requires scripts to run on both macOS and Linux, so the env form is the better house style to
standardize on.

#### Proposed solution

Pick one shebang convention repo-wide for these hand-authored shell scripts (prefer
`#!/usr/bin/env bash`) and apply it to all six files.

#### Verification

`head -1 .claude/hooks/*.sh .claude/cloud/setup.sh .codex/cloud/*.sh` shows a mix today; after the
change all lines match.

---

### [P3][consistency] Claude `setup.sh` swallows every step with `|| echo` but, unlike the Codex scripts, never summarizes what was skipped

**File(s):** `.claude/cloud/setup.sh:22-45` vs `.codex/cloud/setup.sh:14-59` — pinned at SHA f934d43

#### Problem

Both cloud setups are best-effort (`set -uo pipefail`, no `-e`). The Codex scripts accumulate a
`warnings=()` array and print a "finished with N warning(s)" summary at the end (`setup.sh:53-60`),
so a partially-provisioned environment is obvious in the log. The Claude `setup.sh` instead prints a
one-off `echo` at each failing step (lines 23, 35, 44) with no roll-up, so a session that had npm,
Playwright, and chisel all fail scatters three lines through a long log with nothing tying them
together. Two setup scripts solving the same "best-effort with visible failures" problem in two
different shapes is avoidable inconsistency.

#### Proposed solution

Adopt the Codex `warn()`/summary pattern in `.claude/cloud/setup.sh` (or, conversely, agree the
inline-echo style is sufficient and simplify the Codex scripts) so both cloud setups report failures
the same way.

#### Verification

Force all three optional installs to fail and run each setup script; confirm today only Codex emits
a consolidated summary, and after the change both do.

---

### [P3][maintenance] Claude `setup.sh` hard-codes a Playwright fallback version that duplicates `package.json` and diverges from the Codex approach

**File(s):** `.claude/cloud/setup.sh:33-34` — pinned at SHA f934d43

#### Problem

```bash
PW_VERSION="$(node -p "require('./package.json').devDependencies['@playwright/test'].replace(/^[^0-9]*/, '')" 2>/dev/null || true)"
npx --yes "playwright@${PW_VERSION:-1.61.1}" install --with-deps chromium
```

The literal fallback `1.61.1` duplicates the version already pinned in `package.json`
(`"@playwright/test": "^1.61.1"`). When the dependency is bumped, this fallback silently goes stale
— exactly the "hard-coded version drifts silently" failure the comment two lines up warns about. The
Codex scripts avoid the literal entirely by delegating to `node scripts/web.mjs playwright install`,
which resolves the installed version. Two cloud setups derive the Playwright version two different
ways, one of which reintroduces the drift the other eliminates.

#### Proposed solution

Prefer the Codex approach (`node scripts/web.mjs playwright install --with-deps chromium`) so the
version is always the resolved one and no literal exists to drift; or if the explicit
`npx
playwright@<version>` is needed for the CDN allowlist reason, drop the literal fallback and
fail loudly when the version can't be derived rather than pinning a number that will rot.

#### Verification

Bump `@playwright/test` in `package.json` and re-read the script: the derived path stays correct
while the `1.61.1` fallback does not; confirm the chosen fix leaves no literal version to maintain.

---

### [P3][maintenance] The audit-routine cron schedule table can silently drift from the actual Claude Routines with no automated check

**File(s):** `.claude/audit-conventions.md:150-172` — pinned at SHA f934d43

#### Problem

The "Scheduled runs (Claude Routines)" section declares itself "the source of truth for that
automation" and holds a six-row cron table (lines 161-168) plus the instruction "if a routine is
added, retired, or rescheduled, update this table in the same change." But the actual triggers live
in the Routines backend, not in the repo, so nothing enforces that the table matches reality —
unlike the `ruler:check` / `dprint check` gates that guard other generated/formatted content. A
rescheduled or deleted routine leaves this table wrong with no CI signal.

#### Proposed solution

Acknowledge the limitation explicitly (a note that this table is manually mirrored and can drift),
or add a lightweight reconciliation step — e.g. a documented periodic `list_triggers` cross-check,
or folding the cadence into the routines' own definitions so the doc points at them rather than
restating cron strings.

#### Verification

Confirm no script or CI job references this table's cron values; decide on a mirroring note or a
check and confirm the doc no longer claims unenforced "source of truth" status without a caveat.

---

### [P4][documentation] `settings.json` permission groups are unlabeled and unreferenced from any doc

**File(s):** `.claude/settings.json:29-78` — pinned at SHA f934d43

#### Problem

The allow list is visually grouped by blank lines (npm/node, git, read-only tools, curl-localhost,
mobile toolchain, skills, reads) but JSON can't carry comments, so the grouping intent is implicit,
and no doc explains what is auto-allowed or why. CLAUDE.md documents the hooks and rules but says
nothing about the permission policy, so a newcomer wondering "why did that command not prompt?" has
no pointer. The mobile-toolchain group in particular (`adb`, `xcrun simctl`, `xcode-select`,
`xcodebuild`, `pod`, `ruby`, lines 66-72) is non-obvious without the `mobile` skill context.

#### Proposed solution

Add a short "Auto-allowed commands" note to the appropriate doc (e.g. `docs/CONTRIBUTING.md` or a
line in CLAUDE.md's config section) pointing at `.claude/settings.json` and summarizing the intent
of each group, so the policy is discoverable and reviewable. Optionally split truly
environment-specific entries (the Apple-only mobile tools) into `settings.local.json` if they aren't
needed by all contributors.

#### Verification

A newcomer can locate the permission policy from the docs without opening `settings.json` blind;
confirm each group's purpose is stated somewhere in prose.

---

### [P4][dead-config] `node --check` / `node --input-type=module -e` allows have no repo consumer and are undocumented

**File(s):** `.claude/settings.json:39-40` — pinned at SHA f934d43

#### Problem

```json
"Bash(node --check *)",
"Bash(node --input-type=module -e *)",
```

Neither pattern appears in any script, hook, or skill
(`grep -rn "node --check\|input-type=module"
.claude .ruler scripts` returns only `settings.json`).
They're presumably for ad-hoc syntax checks / one-liners Claude runs, which is legitimate, but as
unexplained standalone allows they read like possibly-stale entries. `node --input-type=module -e *`
in particular grants arbitrary module evaluation, which is broad.

#### Proposed solution

If these support a real ad-hoc workflow, keep them but add them to the permission-policy note
proposed above so their purpose is on record; if they're leftovers, remove them. Consider whether
arbitrary `-e` evaluation should be auto-allowed at all.

#### Verification

Confirm no committed tooling depends on these; decide keep-and-document vs. remove and confirm no
workflow regresses.

---

### [P4][documentation] `Read(//tmp/**)` uses non-obvious double-slash absolute-path syntax with no explanation

**File(s):** `.claude/settings.json:77` — pinned at SHA f934d43

#### Problem

```json
"Read(//tmp/**)"
```

The leading `//` is Claude Code's syntax for a filesystem-absolute path (so this grants reads under
`/tmp`, where the session scratchpad lives), but it reads like a typo (`/tmp` double-slashed) to
anyone not steeped in the permission grammar. A reviewer could "fix" it to `/tmp/**` and change its
meaning. It's the only absolute-path entry in the file and carries no context.

#### Proposed solution

Leave the syntax as-is (it's correct) but cover it in the permission-policy doc note, or if the
project prefers, verify whether the intended path is the session scratchpad specifically and scope
it tighter than all of `/tmp`.

#### Verification

Confirm `Read(//tmp/**)` currently permits reading `/tmp/...` files and that `Read(/tmp/**)` would
not (validating the `//` is load-bearing), then ensure the distinction is documented.

---

### [P4][dead-config] `npm install *` auto-allows installing arbitrary packages without a prompt

**File(s):** `.claude/settings.json:31,33-35` — pinned at SHA f934d43

#### Problem

```json
"Bash(npm run *)",
"Bash(npm test*)",
"Bash(npm ci)",
"Bash(npm install)",
"Bash(npm install *)",
```

`Bash(npm install *)` lets any `npm install <pkg>` run with no confirmation — arbitrary package
addition (a supply-chain surface) is auto-approved. Given the repo's careful `dependencies` vs
`devDependencies` policy (ADR-0070) where getting a package's placement wrong breaks the Netlify
deploy, silently auto-installing arbitrary packages is a poor default; a human should at least see
the package name.

#### Proposed solution

Consider dropping `Bash(npm install *)` (keep bare `Bash(npm install)` for lockfile-driven installs
and `Bash(npm ci)`), so adding a new dependency prompts. If unattended installs are needed for the
cloud audit routines, scope them there rather than in the shared allow list.

#### Verification

Confirm `npm install some-package` currently runs without a prompt; after removal confirm it prompts
while `npm install` / `npm ci` still pass.

---

### [P4][documentation] `session-start.sh` and `cloud-branch-preview.sh` aren't discoverable from the primary config/instruction files

**File(s):** `.claude/settings.json:14-27`, `CLAUDE.md` (config section) — pinned at SHA f934d43

#### Problem

CLAUDE.md documents the PostToolUse `format-edited-file.sh` hook by name but never mentions the two
SessionStart hooks. They are described in `docs/CLOUD/Claude.md`, but a contributor reading the main
instructions or `settings.json` has no in-place signal that two scripts run at every session start
(one of which injects a whole workflow prompt into context). The `settings.json` registration is
just two bare command paths (lines 19, 23) with no comment (JSON limitation).

#### Proposed solution

Add a one-line mention of the SessionStart hooks (and their `CLAUDE_CODE_REMOTE` guard) to the
config-overview area that already names `format-edited-file.sh`, pointing at `docs/CLOUD/Claude.md`
for detail, so all three hooks are discoverable from one place.

#### Verification

From CLAUDE.md alone a reader can enumerate all registered hooks and find where each is documented;
confirm the SessionStart pair is now referenced.

---

## Source: Code audit — .github CI workflows

### [P1][consistency] Issue templates apply labels (`bug`, `enhancement`) that don't exist in the declarative taxonomy

**File(s):** `.github/ISSUE_TEMPLATE/bug_report.md:5`, `.github/ISSUE_TEMPLATE/feature_request.md:5`
— pinned at SHA f934d43

#### Problem

`bug_report.md` sets `labels: bug` and `feature_request.md` sets `labels: enhancement`:

```yaml
# bug_report.md
labels: bug
# feature_request.md
labels: enhancement
```

But the single source of truth for labels, `.github/labels.yml`, defines **`type:bug`** and
**`type:feature`** — there is no `bug` or `enhancement` label in the taxonomy (lines 7-30). Since
`label-sync.yml` runs with `skip-delete: true`, GitHub's default `bug`/`enhancement` labels are
never pruned, so every issue opened through these templates lands with an off-taxonomy label. This
directly undermines the automation and skills keyed on `type:*` (`docs/ISSUE-WORKFLOW.md`,
`burn-down-backlog`, `vet-audits`, the `reviewed`→ToDo move) — a bug filed via the template is not
`type:bug`, so `area:*`/`type:*` filtering silently misses it. The `task.md` template (`labels: ''`)
is at least honest about carrying no label, but leaves the same gap.

#### Proposed solution

Change the template front-matter to the real taxonomy labels: `labels: type:bug` and
`labels: type:feature` (multiple allowed, e.g. `type:bug, needs-triage`). Preset `task.md` to
`labels: type:chore`. Optionally add the two GitHub defaults as explicit entries in `labels.yml` and
flip `skip-delete` for a one-time prune — but aligning the templates to `type:*` is the correct fix.

#### Verification

`grep -R "^labels:" .github/ISSUE_TEMPLATE` and confirm every value appears as a `name:` in
`.github/labels.yml`. Open a test issue from each template and confirm the applied label matches the
taxonomy.

---

### [P1][security] Test/deploy/smoke workflows declare no `permissions:` block — they run with the default (write-capable) token

**File(s):** `.github/workflows/test.yml:1-11`, `.github/workflows/android-deploy.yml:10-17`,
`.github/workflows/ios-deploy.yml:11-18`, `.github/workflows/blobs-smoke.yml:14-24` — pinned at SHA
f934d43

#### Problem

`pages.yml` (18-22), `label-sync.yml` (17-18), and `label-to-todo.yml` (9-10) each scope their
`GITHUB_TOKEN` with an explicit `permissions:` block. The four remaining workflows — `test.yml`,
`android-deploy.yml`, `ios-deploy.yml`, `blobs-smoke.yml` — declare **none**, so they inherit the
repository/org default, which for many repos is the legacy read-write token. These workflows run
untrusted PR code (`test.yml` triggers on `pull_request`), download and execute a piped installer
(`curl … | bash` for Maestro), and handle `secrets.ADMIN_ACCESS_TOKEN` (`blobs-smoke.yml`). A
compromised dependency or action step would have write access to contents, issues, and more.

#### Proposed solution

Add a least-privilege top-level `permissions:` block to each. `test.yml`, `android-deploy.yml`, and
`ios-deploy.yml` only need `contents: read`. `blobs-smoke.yml` needs `contents: read`. Set the
default org-wide to read-only as defense in depth. This also makes "what can this workflow touch"
grepable and consistent with the other three workflows.

#### Verification

Every workflow file contains a `permissions:` block;
`grep -L "permissions:" .github/workflows/*.yml` returns nothing. Re-run a PR build to confirm no
step needs a write scope that was removed.

---

### [P2][duplication] The checkout + setup-node@24 + `npm ci` preamble is copy-pasted across five jobs

**File(s):** `.github/workflows/test.yml:18-26` and `:89-97`,
`.github/workflows/android-deploy.yml:27-49`, `.github/workflows/ios-deploy.yml:25-33`,
`.github/workflows/blobs-smoke.yml:34-38` — pinned at SHA f934d43

#### Problem

Six jobs repeat some subset of this identical block:

```yaml
- uses: actions/checkout@v7
- uses: actions/setup-node@v6
  with:
    node-version: 24
    cache: npm
- name: Install dependencies
  run: npm ci
```

Any change (node version, cache strategy, adding `always-auth`, pinning to a SHA) must be edited in
five places and is already drifting (see the node-version and checkout-version findings below).

#### Proposed solution

Extract a composite action, e.g. `.github/actions/setup/action.yml`, that runs checkout +
setup-node + `npm ci`, with an input like `install: true|false` (so `blobs-smoke.yml`, which
deliberately skips `npm ci`, can pass `install: false`). Each job becomes
`- uses: ./.github/actions/setup`. Centralizes the node version and cache config in one file.

#### Verification

`grep -rc "actions/setup-node" .github/workflows` drops to the composite action only; all workflows
still install deps and pass CI.

---

### [P2][versioning] Node version `24` is hard-coded in five places with no single source of truth (and disagrees with the docs)

**File(s):** `.github/workflows/test.yml:22` and `:93`, `.github/workflows/android-deploy.yml:31`,
`.github/workflows/ios-deploy.yml:29`, `.github/workflows/blobs-smoke.yml:38` — pinned at SHA
f934d43

#### Problem

`node-version: 24` is a magic constant repeated five times. There is no `.nvmrc`, and `package.json`
`engines` isn't consulted (`node-version-file:` is unused). Bumping Node means editing five lines
and hoping none is missed. It also **conflicts with the documented floor**: the `testing` skill and
`mobile` skill state "Node ≥ 22" / "Node ≥ 22 … JDK 21", so CI silently runs a version different
from what the docs promise contributors.

#### Proposed solution

Add a `.nvmrc` (or `.node-version`) at the repo root as the single source, and switch every
`setup-node` to `node-version-file: .nvmrc` (folded into the composite action above). Reconcile the
docs to name the exact CI version. Local dev, CI, and docs then read one number.

#### Verification

`grep -rn "node-version" .github/workflows` shows only `node-version-file`; `cat .nvmrc` is the one
place the version lives. `nvm use` in a fresh checkout selects it.

---

### [P2][maintainability] CI rebuilds the debug APK inline instead of calling the committed `android:apk` script

**File(s):** `.github/workflows/android-deploy.yml:55-61` (Build debug APK) — pinned at SHA f934d43

#### Problem

The step reimplements, in inline shell, exactly what an npm script already does:

```yaml
- name: Build debug APK
  run: |
    npm run cap:sync
    cd android
    chmod +x gradlew
    ./gradlew :app:assembleDebug
```

`package.json` defines
`"android:apk": "npm run cap:sync && node scripts/gradle.mjs :app:assembleDebug"`, and
`scripts/gradle.mjs`'s header explicitly exists "to keep the npm scripts free of an inline
`cd android && ./gradlew` shell dance" (ADR-0017). CI bypasses both the script and the helper,
duplicating logic and directly violating the repo convention that the Gradle wrapper is invoked via
a Node helper, never inline `cd android && ./gradlew`. If the build command changes (task name,
extra flags), the script and this workflow drift.

#### Proposed solution

Replace the whole step with `run: npm run android:apk`. If the debug artifact path is needed later,
it is deterministic (`android/app/build/outputs/apk/debug/app-debug.apk`, already referenced at line
77). Drop the manual `chmod +x gradlew` — `gradle.mjs` spawns the wrapper by absolute path.

#### Verification

`npm run android:apk` locally produces the same APK; the tag workflow still installs and smokes it.
`grep -rn "gradlew" .github/workflows` returns nothing.

---

### [P2][consistency] `actions/checkout` pinned to `@v4` in one workflow and `@v7` in every other

**File(s):** `.github/workflows/label-sync.yml:25` (`actions/checkout@v4`) vs
`.github/workflows/test.yml:18`, `android-deploy.yml:27`, `ios-deploy.yml:25`, `blobs-smoke.yml:34`,
`pages.yml:37`, `label-to-todo.yml:34` (all `@v7`) — pinned at SHA f934d43

#### Problem

Six workflows are on `actions/checkout@v7`; `label-sync.yml` alone is stuck on `@v4`. This is stale
drift — nothing about label sync needs the older major. Inconsistent pins make "what version do we
run" un-grepable and mean a security advisory or Node-runtime bump has to be tracked per-file.

#### Proposed solution

Bump `label-sync.yml` to `actions/checkout@v7` (or, better, pin all of them to a single SHA and let
the composite action own it — see the duplication finding). Sweep for any other lagging pins at the
same time.

#### Verification

`grep -rn "actions/checkout@" .github` shows a single version everywhere. Re-run `label-sync` via
`workflow_dispatch` and confirm it still reconciles labels.

---

### [P2][duplication] The Maestro CLI install step is duplicated verbatim between the Android and iOS workflows

**File(s):** `.github/workflows/android-deploy.yml:62-65`, `.github/workflows/ios-deploy.yml:35-38`
— pinned at SHA f934d43

#### Problem

Both workflows contain the identical block:

```yaml
- name: Install Maestro CLI
  run: |
    curl -fsSL "https://get.maestro.mobile.dev" | bash
    echo "$HOME/.maestro/bin" >> "$GITHUB_PATH"
```

The `testing` skill even documents a footgun here (`get.maestro.mobile.dev`, not `get.maestro.dev`).
Duplicating a curl-pipe-bash installer across two files means a URL fix or a version pin lands in
one and is forgotten in the other. It's also unpinned — every run installs whatever Maestro is
latest.

#### Proposed solution

Extract to a composite action `.github/actions/install-maestro/action.yml` used by both jobs.
Consider pinning a Maestro version there for reproducibility. This also gives the URL-footgun
comment a single home.

#### Verification

Both tag workflows still run the Maestro smoke; `grep -rn "get.maestro" .github/workflows` returns
nothing (moved into the composite action).

---

### [P2][duplication] The "Upload Maestro report" artifact step is near-identical across the two native workflows

**File(s):** `.github/workflows/android-deploy.yml:82-89`, `.github/workflows/ios-deploy.yml:47-54`
— pinned at SHA f934d43

#### Problem

Both jobs end with the same upload-artifact step; only the artifact `name` (`maestro-report` vs
`maestro-ios-report`) differs. Path (`~/.maestro/tests/`), `retention-days: 7`,
`if-no-files-found: ignore`, and the `if: ${{ !cancelled() }}` guard are duplicated. Drift risk on
retention/path changes.

#### Proposed solution

Fold into the same composite action as the Maestro install (or a dedicated `upload-maestro-report`
composite) taking the artifact name as an input. Retention and path then live once.

#### Verification

Both workflows still upload their report artifact with distinct names; the retention/path values
exist in a single file.

---

### [P2][maintainability] Missing `timeout-minutes` on the two label-automation jobs — a hung `gh api` call runs for the 6-hour default

**File(s):** `.github/workflows/label-sync.yml:22-26` (sync job),
`.github/workflows/label-to-todo.yml:17-31` (move-to-todo job) — pinned at SHA f934d43

#### Problem

Every other job in the repo sets a `timeout-minutes` (test 10/15, android/ios 40, blobs 5, pages 5).
The `sync` job in `label-sync.yml` and the `move-to-todo` job in `label-to-todo.yml` set none, so a
stuck GraphQL call (rate-limit, network hang) in `label-to-todo.sh` or the labeler action can burn
up to the 360-minute default per run, and `label-to-todo` fires on every `issues: labeled` event.

#### Proposed solution

Add `timeout-minutes: 5` (generous for a couple of `gh api` calls) to both jobs. Makes the timeout
convention uniform across all workflows.

#### Verification

`grep -L "timeout-minutes" .github/workflows/*.yml` returns nothing meaningful; force a
`workflow_dispatch` of label-sync and confirm it completes well under the limit.

---

### [P3][security] Third-party actions are pinned to mutable major tags, not commit SHAs

**File(s):** `.github/workflows/android-deploy.yml:68`
(`reactivecircus/android-emulator-runner@v2`), `.github/workflows/label-sync.yml:26`
(`crazy-max/ghaction-github-labeler@v5`), plus every `actions/*@vN` — pinned at SHA f934d43

#### Problem

All actions — first-party (`actions/checkout@v7`, `actions/setup-node@v6`, `actions/cache@v6`,
`actions/upload-artifact@v7`) and third-party (`reactivecircus/android-emulator-runner@v2`,
`crazy-max/ghaction-github-labeler@v5`) — are pinned to floating major-version tags. A tag is
mutable: a compromised or repointed tag executes new code in CI with the workflow's token (see the
missing-`permissions` finding for how much that token can do). Third-party actions like the
emulator-runner and the labeler are the higher-risk cases.

#### Proposed solution

Pin actions to full commit SHAs with a trailing `# vX.Y.Z` comment, and let Dependabot (next
finding) propose bumps. At minimum, SHA-pin the two third-party actions.

#### Verification

`grep -rnE "uses: .+@v[0-9]+$" .github/workflows` returns only first-party actions you consciously
choose to leave on tags; third-party uses show a 40-char SHA.

---

### [P3][dead-config] No `dependabot.yml` — nothing keeps the pinned actions or npm deps updated

**File(s):** `.github/` (absent `dependabot.yml`) — pinned at SHA f934d43

#### Problem

There is no `.github/dependabot.yml`. Combined with the tag-pinned (or, if SHA-pinned, frozen)
actions above and the hand-maintained npm tree, action and dependency updates are entirely manual.
Security patches to `android-emulator-runner`, `checkout`, etc. land only if someone notices.

#### Proposed solution

Add `.github/dependabot.yml` with a `github-actions` ecosystem (weekly) and, if desired, an `npm`
ecosystem scoped to the root `package.json`. Group patch/minor action bumps to keep PR noise down.

#### Verification

File exists and validates; Dependabot opens its first "bump actions" PR on the next scheduled run.

---

### [P3][maintainability] Playwright version is resolved by a brittle inline `node -p` reaching into `package-lock.json` internals

**File(s):** `.github/workflows/test.yml:105-107` (Resolve Playwright version) — pinned at SHA
f934d43

#### Problem

```yaml
run: echo "version=$(node -p "require('./package-lock.json').packages['node_modules/@playwright/test'].version")" >> "$GITHUB_OUTPUT"
```

This nests double-quotes inside a `run:` string, hard-codes the lockfile's internal
`packages['node_modules/…']` key shape (a lockfile-v3 detail that changed across npm majors), and is
the sole consumer of a value used only to build the cache key. Any lockfile-format change or an
added quoting layer breaks it silently (cache key becomes `playwright-…-` with an empty version,
quietly disabling the WebKit-aware cache).

#### Proposed solution

Move the resolution into a committed helper (e.g. `scripts/playwright-version.mjs`) that reads the
installed `@playwright/test/package.json` version and prints it, called as
`node scripts/playwright-version.mjs >> "$GITHUB_OUTPUT"`. Testable and robust to lockfile-format
churn.

#### Verification

`node scripts/playwright-version.mjs` prints the same version the inline expression does; the cache
key in a CI run contains a non-empty version.

---

### [P3][consistency] Android emulator API level is a second source of truth for the `Pixel_7_Pro_API_33` AVD

**File(s):** `.github/workflows/android-deploy.yml:70-74` (`api-level: 33`, `target: google_apis`,
`arch: x86_64`, long `emulator-options` string) — pinned at SHA f934d43

#### Problem

CI hard-codes `api-level: 33` (and `target`/`arch`) in the emulator-runner inputs, while the local
smoke path (`scripts/android-emulator-smoke.mjs`, `scripts/lib/android.mjs`) targets an AVD named
`Pixel_7_Pro_API_33`. The API level "33" now lives in two unrelated places; a bump to API 34 must be
made in both or CI and local diverge. The `emulator-options` value is also a long undocumented magic
string (`-no-snapshot-save -no-window -noaudio -no-boot-anim -camera-back none`) with no named
constant or comment explaining each flag.

#### Proposed solution

Derive the API level from a single source (an env/constant shared with `scripts/lib/android.mjs`, or
at least a workflow `env:` used to interpolate both the runner input and any reference). Add a brief
comment naming why each `emulator-options` flag is present (headless/perf).

#### Verification

Changing the API level in one place updates both CI and local smoke; a comment documents the
emulator flags.

---

### [P3][maintainability] `label-to-todo.sh` caps project items and fields at `first: 100` with no pagination

**File(s):** `.github/scripts/label-to-todo.sh:23` (`projectItems(first: 100)`), `:37`
(`fields(first: 100)`), `:47`? — pinned at SHA f934d43

#### Problem

The GraphQL query fetches the issue's `projectItems(first: 100)` and the project's
`fields(first:
100)` with no pagination. If the issue is already in more than 100 projects
(unlikely) or, more plausibly, the project grows many single-select fields, the `Status` field or
the existing item can fall outside the first page and the script will silently "add it now"
(line 118) as a duplicate or fail to find the field. It's a latent correctness edge on an otherwise
careful script.

#### Proposed solution

For a single-owner project this is low-risk, so at minimum add a comment documenting the 100-item
assumption. If robustness matters, page the `fields` connection or query the field by name directly.

#### Verification

Confirm the target project has <100 fields; add a comment or paginate. Trigger the `reviewed` label
on a test issue and confirm it moves to ToDo.

---

### [P3][consistency] Concurrency control is applied unevenly — only two of seven workflows declare a group

**File(s):** `.github/workflows/test.yml:8-10` (cancel), `pages.yml:24-26` (no-cancel),
`label-to-todo.yml:12-14` (cancel); absent in `android-deploy.yml`, `ios-deploy.yml`,
`blobs-smoke.yml`, `label-sync.yml` — pinned at SHA f934d43

#### Problem

`test`, `pages`, and `label-to-todo` set `concurrency`; the other four don't. `label-sync.yml` can
double-run if two `labels.yml` pushes land close together (two labelers racing the same label set),
and `blobs-smoke` can run overlapping instances across rapid `deployment_status` events. There's no
documented rationale for which workflows opt in.

#### Proposed solution

Add a `concurrency` group to `label-sync` (`group: label-sync`, `cancel-in-progress: false` — don't
cancel a partial reconcile) and to `blobs-smoke` keyed on the deploy URL. Leave the tag-triggered
native smokes without cancel (each tag is a distinct release). Add a one-line comment on each
explaining the cancel/no-cancel choice, mirroring `pages.yml`'s existing comment.

#### Verification

Each workflow either has a `concurrency` block with a rationale comment or is intentionally exempt;
two quick label pushes no longer run two overlapping `label-sync` jobs.

---

### [P4][duplication] The `chromium webkit` browser list is repeated across the two Playwright install steps

**File(s):** `.github/workflows/test.yml:122` (install `chromium webkit`), `:128` (install-deps
`chromium webkit`) — pinned at SHA f934d43

#### Problem

```yaml
- run: npx playwright install --with-deps chromium webkit   # cache miss
- run: npx playwright install-deps chromium webkit           # cache hit
```

The browser set `chromium webkit` is hard-coded in two mutually-exclusive steps. Adding a browser
(e.g. firefox) or dropping WebKit means editing both, and the cache-key comment on line 118 is a
third place that encodes the same WebKit assumption. Easy to update one and desync coverage.

#### Proposed solution

Hoist the browser list into a job-level `env: PW_BROWSERS: "chromium webkit"` and reference
`${{ env.PW_BROWSERS }}` in both steps, so the set is defined once. (Or collapse the two steps —
`install-deps` on a cache hit and `install --with-deps` on a miss — behind a small script.)

#### Verification

`grep -c "chromium webkit" .github/workflows/test.yml` drops to one definition; CI still installs
and runs both browser projects with `REQUIRE_WEBKIT: 1`.

---

### [P4][maintainability] `ALLOWED_TOKENS_LIST` hard-codes retry-indexed values tightly coupled to `retries: 2` in a different file

**File(s):** `.github/workflows/test.yml:143` — pinned at SHA f934d43

#### Problem

```yaml
ALLOWED_TOKENS_LIST: daycare-club,daycare-club-retry1,daycare-club-retry2
```

The `-retry1`/`-retry2` suffixes exist solely because `web/playwright.config.ts` sets `retries: 2`
in CI (one token per attempt, per the comment). This is an invisible cross-file coupling: bump
retries to 3 and the burst spec's third attempt has no allowlisted token, producing a confusing
rate-limit failure with no signal pointing back here. The magic list lives in a workflow env, far
from the config that dictates its length.

#### Proposed solution

Derive the token list from the retry count in one place — e.g. generate it in `playwright.config.ts`
(or a shared constant the spec and config both read) so the list length tracks `retries`
automatically, or add a comment at the `retries` definition pointing at this env. At minimum,
cross-reference both sides so a future retry bump updates the token list.

#### Verification

Changing `retries` in `playwright.config.ts` no longer requires a manual edit here (or a
lint/comment flags the coupling); the rate-limit burst spec passes on every retry attempt.

---

### [P4][consistency] `upload-artifact` steps disagree on `if-no-files-found` handling

**File(s):** `.github/workflows/test.yml:151-157` (no `if-no-files-found`) vs
`android-deploy.yml:82-89` and `ios-deploy.yml:47-54` (`if-no-files-found: ignore`) — pinned at SHA
f934d43

#### Problem

The Playwright report upload omits `if-no-files-found`, so it defaults to `warn` and emits an
annotation when `web/playwright-report/` is empty (e.g. a build that failed before Playwright ran).
The two Maestro uploads set `if-no-files-found: ignore`. No stated reason for the difference — it's
just inconsistency that produces noisy warnings on some failed runs.

#### Proposed solution

Decide one policy. A missing Playwright report on a passing-up-to-that-point run is worth a warning,
so `warn` may be intentional — if so, add a comment. Otherwise set all three to the same value.

#### Verification

All three `upload-artifact` steps set `if-no-files-found` explicitly (or a comment explains the
default); a run that produces no report doesn't emit an unexplained warning.

---

### [P4][naming] Redundant workflow/job naming: workflow "Tests" contains a job named "Tests"

**File(s):** `.github/workflows/test.yml:1` (`name: Tests`), `:84-85` (job `test`, `name: Tests`) —
pinned at SHA f934d43

#### Problem

The workflow is named `Tests` and its second job is also displayed as `Tests`, so the GitHub checks
list shows `Tests / Tests` alongside `Tests / Quality`. The `test.yml` file actually runs a
`quality` gate (type-check, lint, format, SVG/ruler/token/asset/scrapbook drift, `npm audit`) plus
the test suites — the filename and workflow name undersell that it's the whole push/PR gate.
`Tests / Tests` is a poor, un-scannable check name.

#### Problem grepability

Someone searching required-status-check config for "the CI gate" sees `Tests / Quality` and
`Tests / Tests` and can't tell what the second covers (unit + asset + E2E + driver smoke).

#### Proposed solution

Rename the second job's display name to something distinct (`Unit & E2E`, `Test suites`), or rename
the workflow to `CI` so the checks read `CI / Quality` and `CI / Tests`. Keep the filename or rename
to `ci.yml` for grepability.

#### Verification

The GitHub checks list shows two distinctly-named jobs; branch-protection required checks still
resolve.

---

### [P5][dead-config] `label-sync` comment references toggling `dry-run` that is already off

**File(s):** `.github/workflows/label-sync.yml:7-8` and `:28-30` — pinned at SHA f934d43

#### Problem

The header comment says "flip dry-run off / skip-delete as needed for a full sync," but the workflow
already sets `dry-run: false` (line 29). The comment describes a state that doesn't match the
config, so a reader has to reconcile "flip it off" against "it's already off." Minor staleness on an
otherwise well-documented file.

#### Proposed solution

Reword to reflect reality: dry-run is off (it does apply changes); the knob left conservative is
`skip-delete: true` (won't prune hand-made labels) — flip that to `false` for a full reconcile.

#### Verification

The comment matches the actual `dry-run`/`skip-delete` values.

---

### [P5][consistency] Repo owner casing is inconsistent across `.github` URLs (`kylemit` vs `KyleMit`)

**File(s):** `.github/ISSUE_TEMPLATE/config.yml:7` (`github.com/kylemit/splotch/...`),
`.github/workflows/pages.yml:3` (`kylemit.github.io/Splotch/`),
`.github/workflows/label-to-todo.yml:24` and `:26` (`KyleMit`) — pinned at SHA f934d43

#### Problem

The owner is written `kylemit` in the issue-template contact link and the Pages comment, but
`KyleMit` in `label-to-todo.yml` (both the comment URL and `PROJECT_OWNER: KyleMit`). GitHub
redirects are case-insensitive so nothing breaks, but the inconsistency is a papercut and, for
`PROJECT_OWNER`, the GraphQL `repositoryOwner(login:)` lookup is a value that should match the
canonical casing exactly to avoid a surprise if lookups ever tighten.

#### Proposed solution

Pick the canonical casing (the account displays as `KyleMit`) and normalize all `.github` references
to it, including the `config.yml` contact link and the `pages.yml` comment.

#### Verification

`grep -rin "kylemit" .github` shows one consistent casing; the `label-to-todo` GraphQL owner lookup
still resolves.

---

### [P5][maintainability] Issue templates use legacy Markdown format instead of validated Issue Forms

**File(s):** `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md`, `task.md` — pinned at SHA
f934d43

#### Problem

All three templates are the old Markdown-with-front-matter format. Their prompts (Steps to
Reproduce, Device Information, checkboxes) are free text a reporter can delete wholesale, so nothing
is enforced — combined with the P1 label mismatch, an issue can arrive with no structure and a wrong
label. GitHub Issue Forms (`.yml`) enforce required fields, dropdowns (e.g. device OS, target-user),
and reliably-applied labels.

#### Proposed solution

Convert to Issue Forms (`bug_report.yml`, `feature_request.yml`) with `required:` fields and
`labels:` set to the correct `type:*` taxonomy values. This solves the P1 label bug and the
structure gap together. Keep `task.md`/`blank` for free-form chores if desired.

#### Verification

Opening a bug via the form requires the key fields and applies `type:bug`; `config.yml`
`blank_issues_enabled` still allows an escape hatch.

---

## Summary

23 findings. The two P1s are correctness/security: issue templates apply labels outside the
declarative taxonomy (mislabeling every templated bug/feature and defeating `type:*` automation),
and four workflows run with an unscoped default token. The P2 cluster is the classic CI-hygiene set
— one duplicated checkout/setup/`npm ci` preamble to extract into a composite action, a hard-coded
Node `24` in five places (that disagrees with the docs), CI rebuilding the APK inline instead of
calling `npm run android:apk` (violating the ADR-0017 gradle-helper convention), a stray
`checkout@v4`, duplicated Maestro install/upload steps, and missing timeouts on the label jobs. The
tail covers supply-chain pinning (SHA pins + a missing `dependabot.yml`), brittle inline `node -p`
lockfile parsing, and assorted consistency papercuts.

## Source: Code audit — scrapbook · run-artifact code

### [P2][duplication] Hub `CATEGORIES` registry + per-category page counts duplicate the generator's source of truth with no drift guard

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:182-191`, `:220` (hand-authored hub) —
pinned at SHA f934d43

#### Problem

The hub hardcodes the full category list and page counts:

```js
var CATEGORIES = [
  { id: 'farm', name: 'Farm', pages: 6 },
  { id: 'dinosaur', name: 'Dinosaurs', pages: 6 },
  ...{ id: 'vehicles', name: 'Vehicles', pages: 6 },
];
```

and renders `'Category ' + (i + 1) + ' of ' + CATEGORIES.length + ' · ' + cat.pages + ' pages'`
(line 220). Every value here is a copy of state that actually lives in the proof-sheet generator
(`tools/asset-gen/bin/gen-coloring-book-proof-sheet.mjs`) and in the sibling `*.html` sheets.
Nothing keeps them in lockstep:

* `npm run scrapbook:check` only verifies each *collection dir* resolves to one entry page
  (`collectionsMissingEntry`) and that the top-level `index.html` is fresh — it never looks inside
  the hub. Adding a new category sheet (e.g. a future `bugs.html`) leaves the hub silently omitting
  it; the sheet is reachable by URL but invisible in the tab strip.
* A page-count change (say `farm` drops from 6 to 5 pages) makes the "· 6 pages" label lie, with no
  test to catch it.

This is the single highest-drift spot in the whole section: it is the only committed page with a
hardcoded mirror of generator data and no automated reconciliation.

#### Proposed solution

Prefer eliminating the copy: have the proof-sheet generator (or a small `scrapbook:index`-adjacent
step) emit the `CATEGORIES` array — or the whole hub — from the same manifest it uses to build the
sheets, so id/name/pages have one source. If the hub must stay hand-authored, add a check (extend
`scrapbook:check`) that (a) every `coloring-book-proof-sheets/*.html` sheet except `index.html`
appears as a `CATEGORIES` entry and vice-versa, and (b) each `pages` value matches the sheet's
actual page count. At minimum, drop the `pages` field if it can't be verified — a wrong count is
worse than no count.

#### Verification

Add a ninth category sheet without editing the hub and confirm today it does not appear in the tabs
and no check fails; after the fix, either the tab appears automatically or `scrapbook:check` fails
with a clear message. For the count: edit a sheet's page count and confirm the guard flags the stale
`pages` value.

---

### [P3][correctness] Deep-linking via `hashchange` (or back/forward) leaves `document.title` stale

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:214-229`, `:240` (hand-authored hub) —
pinned at SHA f934d43

#### Problem

`show(i, skipHash)` updates the tab title only inside the non-skip branch:

```js
if (!skipHash) {
  if (location.hash.replace(/^#/, '') !== cat.id) location.hash = cat.id;
  document.title = 'Splotch proof sheets — ' + cat.name; // only here
}
```

The `hashchange` listener calls `show(indexFromHash(), true)` (line 240) with `skipHash = true`, so
navigating by editing the URL hash, or using browser back/forward between categories, swaps the
iframe but never updates `document.title`. The visible page changes while the tab caption stays on
whatever category was last selected by click. The bug exists because the flag conflates two
unrelated concerns (see next finding).

#### Proposed solution

Move `document.title = …` out of the `if (!skipHash)` block so it runs on every category switch
regardless of how it was triggered. Keep only the `location.hash` write gated by the flag.

#### Verification

Load the hub, click "Farm", then edit the URL to `#space` (or press Back). Observe the tab title
stays "…Farm" before the fix; after moving the assignment out, the title tracks the shown category
on every path.

---

### [P4][readability] `skipHash` boolean is a control-flag that silently gates two behaviours

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:214-229` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

The parameter is named for one job (skip writing the hash) but the `if (!skipHash)` block also owns
the `document.title` update. A reader reasonably assumes `skipHash` only suppresses the URL write,
which is exactly how the stale-title bug (previous finding) slipped in. Bundling "should I write the
hash?" and "should I update the title?" under one negated flag is a classic control-coupling smell.

#### Proposed solution

Split the concerns: always update the iframe, tab state, and title; take a separate,
positively-named argument (e.g. `writeHash = true`) that governs only the `location.hash`
assignment. The two callers that pass `true` today (`hashchange`) become `writeHash = false`.

#### Verification

Re-read `show()`: each side effect should be unconditional except the hash write. Confirm both
callers still behave (click writes hash; hashchange does not re-write it and loop).

---

### [P4][correctness] Initial load rewrites the URL to `#farm` and pushes a history entry

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:226`, `:242` (hand-authored hub) —
pinned at SHA f934d43

#### Problem

On first load with no hash, `show(indexFromHash())` runs with `indexFromHash()` returning `0`, and
because `skipHash` is falsy it executes `location.hash = cat.id` (line 226) since `'' !== 'farm'`.
So opening the bare hub URL immediately mutates the address bar to `…/index.html#farm` and, because
assigning `location.hash` creates a new history entry, adds a spurious Back-button stop before the
page the user actually arrived from. The shareable/canonical URL a visitor copies also silently
gains a `#farm` they didn't choose.

#### Proposed solution

For the canonicalisation-on-load case use `history.replaceState(null, '', '#' + cat.id)` instead of
assigning `location.hash`, so the hash is normalised without a new history entry. (User-initiated
tab clicks can keep pushing entries if per-category back/forward is desired — that's a deliberate
choice to make explicitly.)

#### Verification

Open the hub from another page, then press Back: today it returns to `#farm`-less state (an extra
stop) rather than the previous page. After the fix, Back leaves the hub directly.

---

### [P3][maintainability] Hub palette renames the shared chrome tokens, defeating the "keep in sync by eye" note

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:8-43` (hand-authored hub) — pinned at
SHA f934d43

#### Problem

The hub opens with a comment promising the palette is "Kept in sync by eye with the shared scrapbook
chrome (scripts/lib/scrapbook-chrome.mjs)". But it then declares the tokens under *different names*
than the chrome uses — `--fg`/`--bg`/`--bar`/`--line`/`--tab-bg`/`--tab-fg` here vs
`--ink`/`--paper`/`--card-2`/`--hair` in the generated pages (e.g. `scrapbook/index.html:12-13`,
`crayon-brush-samples/index.html:11-13`). A maintainer trying to reconcile the two blocks after a
chrome change can't diff them line-for-line; they must first mentally map `--fg` ↔ `--ink`, `--bar`
↔ `--card-2`, etc. The renamed vocabulary makes the one sync mechanism the file relies on (human
eyeballing) maximally error-prone.

#### Proposed solution

Adopt the chrome's exact token names in the hub so the two `:root` blocks are copy-comparable (or a
future extraction can literally share them). Where the hub genuinely needs extra tokens (`--tab-bg`,
`--tab-fg`), keep those but layer them on top of the shared names rather than substituting the core
ones.

#### Verification

Diff the hub's `:root` light block against the shared chrome's after the rename — the shared subset
should match token-name-for-token-name, so a drift is a visible diff.

---

### [P4][duplication] Hub re-implements the masthead/crayon-strip/breadcrumb chrome by hand

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:150-173` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

The `<header>` block hand-copies the crayon-strip brand, the `Splotch / Scrapbook` wordmark, and the
breadcrumb that `scripts/lib/scrapbook-chrome.mjs` generates for every other page. The README even
concedes it "carries the shared crayon masthead + breadcrumb by hand; keep it in sync". This is real
structural duplication (distinct from the token duplication above): a change to the generated chrome
(a new brand element, a different crumb separator) leaves this page visually diverged with no guard.

#### Proposed solution

Since the hub is intentionally hand-authored (an iframe switcher the generator doesn't produce), the
cleanest fix is to have `scrapbook-chrome.mjs` expose its masthead/breadcrumb fragment as a reusable
export and generate the hub's shell (injecting the hand-authored tab strip + iframe + script) rather
than hand-writing the chrome. If full generation is too much, at least factor the chrome HTML into a
shared string both the generator and a tiny hub-build step consume.

#### Verification

Change the generated masthead (e.g. crumb separator) and confirm the hub does not follow today;
after the fix the hub inherits the change (or a check flags the divergence).

---

### [P3][discoverability] README omits the `crayon-brush-samples` collection and how it's regenerated

**File(s):** `scrapbook/README.md` (whole file; cf. the icons paragraph at `:66-71`) — pinned at SHA
f934d43

#### Problem

The README's "Live URLs" section calls out how to regenerate the coloring-book proof sheets, the
icon gallery, and the model-eval report, but never mentions the `crayon-brush-samples/` collection —
even though it is a committed top-level collection with its own generators
(`tools/asset-gen/crayon-brush-samples/build-sheet.mjs` → `index.html`, `build-compare-sheet.mjs` →
`vs-current.html`). A newcomer who opens `scrapbook/crayon-brush-samples/` in the tree has, unlike
every other collection, no in-`scrapbook` pointer to what produced it or how to refresh it.

#### Proposed solution

Add a short paragraph alongside the icons/coloring entries: what `crayon-brush-samples/` is, its
live URL (`…/crayon-brush-samples/`), and that `index.html`/`vs-current.html` are built by the
`tools/asset-gen/crayon-brush-samples/` scripts (link to that dir's README). Keep it symmetric with
the existing collection blurbs.

#### Verification

Grep `scrapbook/README.md` for `crayon-brush-samples` — currently zero hits; after the fix the
collection is documented like the others.

---

### [P3][discoverability] README warns about masthead sync but not the hub's category-registry maintenance step

**File(s):** `scrapbook/README.md:61-65` — pinned at SHA f934d43

#### Problem

The README tells maintainers the coloring hub `index.html` is a keeper that must be kept "in sync"
with the chrome masthead/breadcrumb by hand. It does *not* mention the more consequential manual
step: adding or removing a proof-sheet category requires editing the hub's `CATEGORIES` array (and
its `pages` count) or the new sheet is invisible in the hub (see the P2 finding). The one piece of
the hub most likely to need editing is the one the docs are silent on.

#### Proposed solution

Extend the existing hub note to state that adding/renaming/removing a category means editing the
`CATEGORIES` array in `coloring-book-proof-sheets/index.html` (and its `pages` count), until/unless
that array is generated. Pair this with whatever guard the P2 finding lands on.

#### Verification

The README's coloring-hub paragraph should name `CATEGORIES` as a hand-maintained list; confirm a
reader adding a category is told to edit it.

---

### [P4][accessibility] Tab UI is built from bare `<button>`s with no tab ARIA semantics

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:168-177`, `:199-206` (hand-authored
hub) — pinned at SHA f934d43

#### Problem

The hub implements a genuine tablist — mutually-exclusive `.on` state, ←/→ arrow navigation, a
switched iframe — but with no assistive semantics: `<div class="tabs">` is not `role="tablist"`, the
generated buttons are not `role="tab"` and never set `aria-selected`, and the `<iframe id="sheet">`
is not `role="tabpanel"` associated to the active tab. Screen-reader users get eight unlabelled
toggle buttons and an untied frame instead of a coherent tab widget.

#### Proposed solution

Add `role="tablist"` to the `.tabs` container, `role="tab"` + `aria-selected` (toggled alongside the
`.on` class in `show()`) to each button, and wire the iframe as the panel (`role="tabpanel"` +
`aria-labelledby`). This is a reference/keeper page so the bar is low, but the tab pattern is
already there — the semantics are cheap to finish.

#### Verification

Run an a11y checker (axe) against the hub, or tab through with a screen reader: the tab strip should
announce as a tablist with a selected tab.

---

### [P4][naming] Inconsistent element-variable suffixing (`frame` vs `tabsEl`/`countEl`)

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:193-196` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

```js
var tabsEl = document.getElementById('tabs');
var frame = document.getElementById('sheet');
var countEl = document.getElementById('count');
```

Two of the three cached elements use the `…El` suffix convention; the middle one (`frame`, for the
element with `id="sheet"`) does not, and its variable name (`frame`) doesn't match its id (`sheet`)
either. Small, but it's the kind of inconsistency that makes a reader hunt.

#### Proposed solution

Pick one convention. Either `sheetEl`/`tabsEl`/`countEl` (matching ids + suffix) or drop the suffix
uniformly. Align the variable name with the element id.

#### Verification

Read lines 193-196: the three cached-element names should follow one visible rule.

---

### [P5][readability] Hub script uses ES5 `var` + function expressions despite a modern-only target

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:178-243` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

The entire `<script>` is written in ES5 style — `var` bindings, `function () {}` callbacks
throughout. The scrapbook is self-contained modern HTML served to current browsers (the repo's
`docs/COMPATIBILITY.md` floor is well past ES5), and the rest of the codebase is `const`/`let` +
arrow functions. There is no build/transpile step here, so the dated style is a pure readability
drag with no compatibility upside, and it's inconsistent with how a contributor would expect Splotch
JS to read.

#### Proposed solution

Modernise in place: `const`/`let`, arrow callbacks, template literals for the count string.
Behaviour is unchanged; the diff is mechanical. Low priority — it works as-is.

#### Verification

Load the hub after the rewrite and exercise tabs, arrows, and hash deep-links; behaviour identical,
source reads in the house style.

## Source: Code audit — Root config (package.json, dprint, tsconfig, …)

### [P2][dead-config] dprint loads the TypeScript and JSON plugins but never runs them

**File(s):** `dprint.json:10-13,23-27` (formatting) — pinned at SHA f934d43

#### Problem

`dprint.json` loads three plugins and configures a TypeScript block:

```json
"typescript": { "quoteStyle": "preferSingle" },
"includes": ["**/*.md"],
...
"plugins": [
  "node_modules/@dprint/markdown/plugin.wasm",
  "node_modules/@dprint/typescript/plugin.wasm",
  "node_modules/@dprint/json/plugin.wasm"
],
```

`includes` matches only `**/*.md`. dprint only formats a file when it is in `includes` *and* a
plugin claims its extension — so with markdown the sole included glob, the `@dprint/typescript` and
`@dprint/json` plugins (and the `typescript.quoteStyle` config block) never execute. `format:md`
(`dprint fmt`) and `format:md:check` (`dprint check`) touch only markdown. The two extra WASM
plugins are dead weight: they are downloaded/cached, listed as `devDependencies` (`@dprint/json`,
`@dprint/typescript` at `package.json:252-254`), and mislead a reader into thinking dprint owns
`.ts`/`.json` formatting when Prettier owns `.ts` and *nothing* owns `.json`.

#### Proposed solution

Either (a) delete the `@dprint/typescript` + `@dprint/json` plugin lines, the `typescript` config
block, and their two `devDependencies`, to make dprint honestly markdown-only (matches ADR-0057); or
(b) if JSON formatting is actually wanted, add `**/*.json` to `includes` and wire `format:md` into
`format` accordingly — but that overlaps Prettier/`.prettierignore` and should be an explicit
decision, not latent config. Option (a) is the low-risk default.

#### Verification

`grep -c '\.ts' <(git ls-files '*.md')` — no TS files are markdown, confirming the plugin is
unreachable. After removing, run `npm run format:md:check` and confirm identical output. Confirm no
other tool references `@dprint/json`/`@dprint/typescript`: `git grep dprint/json dprint/typescript`.

---

### [P2][dead-config] No formatter owns JSON/YAML — config files drift unchecked

**File(s):** `.prettierignore:26-29`, `dprint.json:13` (formatting) — pinned at SHA f934d43

#### Problem

`.prettierignore` deliberately excludes the config formats:

```
# Deliberately out of Prettier scope for now — remove these to bring configs into the check
*.json
*.yml
*.yaml
*.webmanifest
```

and dprint's `includes` is `["**/*.md"]` only (see the previous finding), so *no* formatter and *no*
CI check owns `package.json`, `tsconfig`s, `.vscode/*.json`, `netlify.toml`-adjacent YAML, GitHub
workflow YAML, or the webmanifest. These files — including this very `package.json` with its 117
hand-maintained script rows — can drift in indentation/key style with zero enforcement, and the
loaded-but-unused `@dprint/json` plugin makes it look like coverage exists when it doesn't.

#### Proposed solution

Decide and wire one owner for JSON/YAML: simplest is to drop `*.json`/`*.yml`/`*.yaml`/
`*.webmanifest` from `.prettierignore` (Prettier already handles all four) and let `format:check`
cover them; or add `**/*.json` etc. to `dprint.json` `includes` and use the already-loaded JSON
plugin. Whichever is chosen, delete the other's dead config so there is a single, discoverable
owner.

#### Verification

`npx prettier --check '**/*.json'` (or `dprint check` after adding the glob) currently either errors
on the ignore or reports "0 files"; after the fix it should lint the real config tree. Add a
deliberately mis-indented key to a JSON file and confirm the chosen check now fails.

---

### [P2][dead-config] `.markdownlint.json` is orphaned and duplicates dprint's markdown style

**File(s):** `.markdownlint.json:1-11`, `dprint.json:4-9` (formatting) — pinned at SHA f934d43

#### Problem

`.markdownlint.json` configures a markdownlint ruleset (asterisk bullets, asterisk emphasis, fenced
code, `---` HR, etc.). But ADR-0057 made **dprint the sole markdown owner**, and nothing consumes
this file: `markdownlint` is not a dependency, not in any `scripts`/`scripts-info` entry, and not in
`.vscode/extensions.json` recommendations (`dprint.dprint`, `esbenp.prettier-vscode`,
`svelte.svelte-vscode`). The only repo reference to markdownlint is inside ADR-0057 itself. Worse,
its rules **restate** dprint's config with no cross-reference — `MD004 asterisk` ↔
`unorderedListKind: "asterisks"`, `MD049 asterisk` ↔ `emphasisKind: "asterisks"` — a second source
of truth for the same markdown style that a future edit to `dprint.json` will silently desync from.

#### Proposed solution

Delete `.markdownlint.json`. dprint already enforces the identical style via `format:md:check` in
CI. If interactive lint-in-editor is still wanted, add the markdownlint extension to
`.vscode/extensions.json` and keep the file — but then document the dprint/markdownlint style
coupling in one place. Deletion is the ADR-0057-consistent default.

#### Verification

`git grep -l markdownlint -- ':!package-lock.json' ':!.markdownlint.json'` returns only
`docs/adrs/0057-*.md` — proving no tool reads it. After deletion, `npm run format:md:check` still
passes.

---

### [P2][duplication] `--experimental-strip-types --disable-warning=ExperimentalWarning` repeated 10× and likely stale

**File(s):** `package.json:20,25,72,73,76,77,78,85,86,91` (scripts) — pinned at SHA f934d43

#### Problem

Ten scripts invoke Node with the identical verbose flag pair, e.g.:

```json
"build:cap": "CAPACITOR=true node scripts/web.mjs vite build && node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/strip-native-assets.mjs",
"gen:tokens": "node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/gen-tokens.mjs",
```

Two problems: (1) the 60-character flag string is copy-pasted verbatim ten times — any change (or a
typo in one) must be reconciled by hand; (2) it is likely **stale**. `engines.node` is `">=22.13"`
(`package.json:6`); Node stabilized type-stripping so that `--experimental-strip-types` became the
default (and the flag a deprecated no-op emitting its own warning) from 22.18 / 23.6 onward. On a
modern Node in the supported range the whole pair is redundant, and `--disable-warning` exists only
to silence a warning the flag itself triggers.

#### Proposed solution

Either drop both flags (verify on the project's Node floor that `node scripts/gen-tokens.mjs` strips
types without them), or, if the floor must keep them, factor a single helper — e.g.
`scripts/run-ts.mjs` that re-execs Node with the flags, or a package-level shell alias — so the flag
string lives in exactly one place. Update `engines.node` to the version where the decision holds.

#### Verification

On the CI Node version: `node scripts/gen-tokens.mjs --check` (no flags) — if it runs, the flags are
dead. `grep -c 'experimental-strip-types' package.json` should drop from 10 to 0 (or to 1 in a
shared helper).

---

### [P3][duplication] Browser-support floor is duplicated between `browserslist` and vite `build.target`

**File(s):** `package.json:304-310`, `web/vite.config.ts:77` (build config) — pinned at SHA f934d43

#### Problem

The root `package.json` declares:

```json
"browserslist": [ "chrome >= 111", "edge >= 111", "firefox >= 114", "safari >= 16.4", "ios_saf >= 16.4" ]
```

and `web/vite.config.ts:77` hard-codes the same floor as
`build: { target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'] }`, with a comment
"Keep in sync with `browserslist` in the root package.json". Two hand-synced sources of truth for
the same five-browser floor. It is also unclear what actually *consumes* the `browserslist` field:
vite compiles against `build.target`, not browserslist, so the array may be feeding only
`update:browserslist`/caniuse-lite and otherwise be inert — a reader can't tell whether editing it
changes any output.

#### Proposed solution

Make one the source of truth. Simplest: keep `browserslist` as the single declaration and have
`vite.config.ts` derive `build.target` from it (e.g. via `browserslist-to-esbuild`), or, if vite's
`build.target` is the real control, delete the `browserslist` field and the `update:browserslist`
script and document the floor once in `docs/COMPATIBILITY.md` + `vite.config.ts`. Either way, remove
the "keep in sync by hand" coupling.

#### Verification

Change one browser version in the chosen source and rebuild; confirm the emitted bundle's
syntax-lowering target moved (e.g. inspect for `??`/optional-chaining lowering). Confirm the other
file no longer needs a manual edit.

---

### [P3][duplication] Four ignore lists re-encode the same excluded paths with no shared source

**File(s):** `eslint.config.js:13-23`, `.prettierignore:1-14`, `dprint.json:14-22`, `.gitignore`
(config) — pinned at SHA f934d43

#### Problem

The generated/vendored dirs are enumerated independently in every config:

* `eslint.config.js:13-23`: `.svelte-kit`, `build`, `.netlify`, `node_modules`, `android/`, `ios/`,
  `scrapbook/`, `web/src/lib/components/icon-names.d.ts`, `web/src/lib/releases.json`
* `.prettierignore:1-14`: the same set plus `package-lock.json`, `tokens.css`, `*-snapshots/`, …
* `dprint.json:14-22`: `node_modules`, `.svelte-kit`, `.netlify`, `.gradle`, `web/build`,
  `android/**/build`, `ios/**/build`

Adding a new generated artifact (or renaming `icon-names.d.ts`/`releases.json`) requires editing
three or four files, and they already disagree in ways a newcomer can't distinguish from bugs
(`eslint` ignores all of `android/`, dprint ignores only `android/**/build` because it must still
format generated `android/**/*.md` — but nothing says so).

#### Proposed solution

Can't fully share across tools with different config languages, but reduce the surface: add a short
comment in each list pointing to the others ("generated-path ignores also live in `.prettierignore`
/ `dprint.json`"), and align the glob *style* (see the consistency finding). For the two
project-specific generated files (`icon-names.d.ts`, `releases.json`), consider co-locating them
under a single ignored dir so one glob covers both everywhere.

#### Verification

`git grep -n 'icon-names.d.ts'` shows it hard-coded in both `eslint.config.js` and `.prettierignore`
— renaming it today silently breaks one. After co-location, a single glob per tool should cover it.

---

### [P3][dead-config] `.gitignore` is padded with generic-template entries for tools this repo never uses

**File(s):** `.gitignore:42-137` (config) — pinned at SHA f934d43

#### Problem

Roughly 60 lines are boilerplate from the standard Node `.gitignore` for frameworks/tools absent
from this SvelteKit + Capacitor project: `.grunt` (42), `bower_components` (46), `.lock-wscript`
(49), `jspm_packages/` (56), `web_modules/` (59), `.next`/`out` (92-93), `.nuxt`/`dist` (95-97),
Gatsby `.cache/` (100), `.vuepress/dist` (106), `**/.vitepress/*` (116-119), `.docusaurus` (122),
`.serverless/` (125), `.fusebox/` (128), `.dynamodb/` (131), `.firebase/` (133), `.tern-port` (137),
`.vscode-test` (140), the entire `.yarn/*` block (143-149). None correspond to a tool in
`package.json`. The noise buries the ~30 lines that are actually project-specific and load-bearing
(the Playwright/perf/redteam/coloring-samples/maestro anchored ignores), hurting grepability.

#### Proposed solution

Prune the unused framework blocks, keeping only entries that match tools actually in use (Vite,
SvelteKit, Playwright, Netlify, Capacitor, dprint, the project's own scratch dirs). Keep the
generic-but-cheap safety nets (`*.log`, `.env*`, `.DS_Store`, `node_modules/`, `coverage`).

#### Verification

For each removed entry, `git grep` the tool name in `package.json` returns nothing (e.g. `grunt`,
`bower`, `nuxt`, `docusaurus`, `fusebox`). `git status` is unchanged after pruning (nothing that was
being ignored is now surfaced).

---

### [P3][duplication] `.cache` is ignored three times in `.gitignore`

**File(s):** `.gitignore:88,100,110` (config) — pinned at SHA f934d43

#### Problem

`.cache` / `.cache/` appears three times — line 88 (parcel-bundler block), line 100 (Gatsby block),
line 110 (vuepress-v2 block) — all ignoring the same path with different trailing-slash forms. Pure
redundancy that compounds the template-bloat problem above.

#### Proposed solution

Collapse to a single `.cache/` entry (folded into the prune of the previous finding).

#### Verification

`grep -n '^\.cache' .gitignore` currently prints three lines; after the fix, one.

---

### [P3][maintainability] Personal device identifiers are hard-coded into committed scripts

**File(s):** `package.json:106,113,114` (scripts) — pinned at SHA f934d43

#### Problem

Three scripts embed one developer's specific hardware:

```json
"android:run:device": "... ANDROID_SERIAL=R5CY128YMGF node scripts/gradle.mjs :app:installDebug",
"ios:run:emulator":   "... cap run ios --target C6012C49-AA93-4869-B3A6-E47C9EAAC567",
"ios:run:device":     "... cap run ios --target 00008103-0006202E3CF1001E",
```

and the `scripts-info` describes them as the physical "SM-S938U1" phone and "Kyle's iPad". These
serials/UDIDs are meaningless (and non-functional) for any other contributor or CI, yet they sit in
the shared `package.json`. They are effectively personal config committed to the repo.

#### Proposed solution

Read the target from an env var with the current value as a documented fallback, e.g.
`ANDROID_SERIAL=${ANDROID_SERIAL:-R5CY128YMGF}` is not portable inline — instead have the Node
helper (`scripts/gradle.mjs` / a wrapper) accept `--target`/`ANDROID_SERIAL` from the environment
and drop the literals from `package.json`, or move the device-specific variants into a gitignored
local overrides file. At minimum, document in `scripts-info` that these are placeholders to replace
with `adb:devices` / `xcrun simctl list` output (already partially noted for Android).

#### Verification

On a machine without those devices, `npm run ios:run:device` fails with "device not found" — proving
the literal is dead for everyone but one person. After the fix it should resolve from env or error
with a clear "set TARGET_DEVICE" message.

---

### [P3][duplication] AVD name `Pixel_7_Pro_API_33` is hard-coded across four scripts

**File(s):** `package.json:101,102,103,219` (scripts) — pinned at SHA f934d43

#### Problem

The emulator/AVD name is repeated verbatim in `android:boot` (`emulator -avd Pixel_7_Pro_API_33`),
`android:emulator` (`cap run android --target Pixel_7_Pro_API_33`), `android:live`
(`--target Pixel_7_Pro_API_33`), and described in `android:setup`'s `scripts-info` (line 219). The
matching "API 33" system image lives in `scripts/android-setup.mjs`. Renaming the AVD or bumping the
API level touches four+ places with no single constant.

#### Proposed solution

Define the AVD name once — an env default resolved in a Node helper
(`scripts/android-emulator-*.mjs` already exist) or a single constant those scripts read — and
reference it from the `android:*` scripts. Keep the human-readable form in `scripts-info` only.

#### Verification

`grep -c Pixel_7_Pro_API_33 package.json` returns 3 (plus prose); after centralizing it should be 0
in the executable commands.

---

### [P3][documentation] `overrides.tar` pin has no rationale, unlike every other config in the repo

**File(s):** `package.json:298-303` (dependencies) — pinned at SHA f934d43

#### Problem

```json
"overrides": {
  "@capacitor/assets": { "sharp": "$sharp" },
  "tar": "^7.5.19"
},
```

The `sharp: "$sharp"` override is self-explaining (dedupe @capacitor/assets onto the project's
sharp). The `"tar": "^7.5.19"` override has no comment — a reader can't tell whether it is a
security advisory pin, a compatibility workaround, or stale cruft, nor when it can be removed. This
is conspicuous next to `netlify.toml`, which comments nearly every directive. Un-annotated
transitive pins are exactly the config that rots (the advisory gets fixed upstream, the pin lingers
forever).

#### Proposed solution

Add a one-line comment (JSON5 not available in `package.json`, so use a sibling `overrides` note in
the CONTRIBUTING/ADR or a `// tar:` convention isn't possible in strict JSON — instead record the
reason in a short comment in `docs/` or the commit and reference the advisory ID / issue number in
`scripts-info`-adjacent docs). Practically: document the CVE/reason and a removal condition wherever
dependency decisions are tracked, and periodically re-check whether the transitive floor already
satisfies it so the override can be dropped.

#### Verification

`npm ls tar` shows what depends on it and at what version; if the depended-on range already resolves
to `>=7.5.19` without the override, the pin is removable — prove by deleting it and re-running
`npm ci && npm ls tar`.

---

### [P3][dependency-split] `@capacitor/filesystem` appears unused — no JS import anywhere

**File(s):** `package.json:279` (dependencies) — pinned at SHA f934d43

#### Problem

Every Capacitor plugin in `dependencies` is imported from `web/src` (verified) — except
`@capacitor/filesystem`, which has **zero** JS references. Its only repo mentions are the generated
native registrations (`android/capacitor.settings.gradle`, `ios/App/CapApp-SPM/Package.swift`) and
`package.json` itself. A Capacitor plugin that is installed but never called from JS ships in the
native binaries yet does nothing, and — under the inverted-split rule (ADR-0070: `dependencies` =
what the Netlify web build imports) — it doesn't belong in `dependencies` either, since the web
build never bundles it.

#### Proposed solution

Confirm no dynamic import or peer requirement (e.g. `@capacitor-community/media` needing it) then
remove `@capacitor/filesystem`, `cap sync`, and re-run the native smoke test. If a peer/native need
surfaces, document why it is present-but-unimported.

#### Verification

`git grep "@capacitor/filesystem" -- ':!package-lock.json' ':!*.md'` returns only native config +
`package.json` (confirmed). `npm ls @capacitor/filesystem` shows whether anything depends on it
transitively; if it's a leaf with no JS import, it is dead. Remove it and confirm
`npm run test:android:device` still passes.

---

### [P3][maintainability] Dev/preview port numbers are magic values scattered across scripts and configs

**File(s):** `package.json:16,47,103,115,121` (scripts) — pinned at SHA f934d43

#### Problem

The dev port `5173` is hard-coded in `dev:kill` (`kill-port 5173 8888`), `android:live`
(`--port 5173`), `ios:live` (`--port 5173`), `adb:reverse` (`tcp:5173 tcp:5173`); the netlify-dev
port `8888` in `dev:kill`; and the perf-preview port `4173` in `perf:serve`. There is no single
declaration — a contributor changing the vite dev port (set in `web/vite.config.ts`) must hunt down
and update several unrelated scripts, and `dev:kill` will silently kill the wrong port.

#### Proposed solution

Where the port is a vite concern, it already lives in `web/vite.config.ts`; have the port-dependent
Node helpers (`cloud-tunnel.mjs`, the smoke scripts) read it rather than restating literals in
`package.json`. For `dev:kill`, derive the port list from the same source. At minimum, add a comment
in `scripts-info` noting `5173`/`8888`/`4173` are the vite / netlify-dev / perf-preview ports so the
mapping is discoverable.

#### Verification

Change the vite dev port and run `npm run dev` + `npm run dev:kill`; today the kill misses the new
port. After centralizing, both track the config.

---

### [P4][consistency] No `.editorconfig`; indent width `2` and print width `100` are restated in three files

**File(s):** `.prettierrc.json:3,6`, `dprint.json:1-2`, `.vscode/settings.json:4` (config) — pinned
at SHA f934d43

#### Problem

The same two formatting constants live in three places with three vocabularies: `.prettierrc.json`
(`tabWidth: 2`, `printWidth: 100`), `dprint.json` (`indentWidth: 2`, `lineWidth: 100`),
`.vscode/settings.json` (`editor.tabSize: 2` for markdown). There is no `.editorconfig`, so any
editor without the Prettier/dprint extensions gets no indentation guidance, and the `100`/`2` magic
numbers must be kept in lockstep by hand across formatter configs.

#### Proposed solution

Add a root `.editorconfig` (`indent_size = 2`, `max_line_length = 100`, `charset = utf-8`,
`insert_final_newline = true`) as the editor-agnostic source, and reference it in a comment from the
formatter configs. This doesn't remove the per-tool settings (each formatter needs its own) but
gives one canonical statement and covers editors without extensions.

#### Verification

Open a source file in a bare editor (no plugins) and confirm 2-space indent is applied from
`.editorconfig`. Confirm `100`/`2` still agree across `.prettierrc.json` and `dprint.json`.

---

### [P4][consistency] No `.nvmrc` / `.node-version` despite an `engines.node` floor

**File(s):** `package.json:5-7` (config) — pinned at SHA f934d43

#### Problem

`engines.node` is `">=22.13"`, and several scripts depend on version-specific behavior (the
`--experimental-strip-types` flags). But there is no `.nvmrc` or `.node-version` at the root, so
`nvm use` / `fnm`/`asdf`/Volta pick nothing up and contributors + tooling can silently run a
different major than CI. Given the strip-types staleness risk (separate finding), pinning the Node
version a contributor should use is load-bearing here, not cosmetic.

#### Proposed solution

Add a `.nvmrc` (or `.node-version`) pinning the exact supported Node line (e.g. the CI version).
Keep `engines.node` as the enforced floor and the version file as the "use this" hint.

#### Verification

`nvm use` in a fresh clone currently errors ("No .nvmrc file found"); after adding the file it
selects the pinned version. Confirm it matches whatever Node the CI/GitHub-Actions setup uses.

---

### [P4][consistency] `info` uses `npx scripts-info` though `scripts-info` is a declared dependency

**File(s):** `package.json:9,16,122` (scripts) — pinned at SHA f934d43

#### Problem

`"info": "npx scripts-info"` calls the binary through `npx` even though `scripts-info` is a
`devDependency` (`package.json:266`) already installed in `node_modules/.bin`. The bare
`scripts-info` would resolve the local binary directly; the `npx` wrapper adds a lookup/prompt path
for no reason. Meanwhile `dev:kill` (`npx kill-port …`) and `update:browserslist`
(`npx update-browserslist-db@latest`) *correctly* use `npx` for packages that are **not**
dependencies. So the same `npx` prefix means two different things across the script block, and the
one case that doesn't need it is the one that has it.

#### Proposed solution

Change `info` to `"scripts-info"` (local binary). Leave the genuine on-demand `npx` calls
(`kill-port`, `update-browserslist-db@latest`) as-is, and consider a brief note that `npx` in this
file signals "not a declared dependency".

#### Verification

`npm run info` still prints the script table. `ls node_modules/.bin/scripts-info` confirms the local
binary exists, so `npx` is redundant.

---

### [P4][consistency] Ignore-glob style differs across eslint / dprint / prettier for the same paths

**File(s):** `eslint.config.js:14-20`, `dprint.json:18-21`, `.prettierignore:1-9` (config) — pinned
at SHA f934d43

#### Problem

The three tools spell equivalent excludes differently: eslint uses `**/build/` and blanket
`android/` + `ios/`; dprint uses `web/build`, `android/**/build`, `ios/**/build`; `.prettierignore`
uses `**/build/` and blanket `android/` + `ios/`. The dprint narrowing is *intentional* (it must
still format generated `android/**/*.md`), but nothing in the files says so, so the divergence reads
as an accident and invites a "fix" that would either over- or under-format. Style also varies
(`**/build/` vs `web/build`) for what is meant to be the same directory.

#### Proposed solution

Normalize the glob form where the intent is identical, and add a one-line comment in `dprint.json`
explaining why its `android`/`ios` excludes are build-only (to keep formatting generated markdown
under those trees). This turns an apparent inconsistency into documented intent.

#### Verification

`npm run lint`, `npm run format:check`, `npm run format:md:check` all pass unchanged after
normalization — proving the globs were equivalent where merged and deliberately different where
commented.

---

### [P4][consistency] `.vscode/settings.json` wires a formatter only for markdown, not for code

**File(s):** `.vscode/settings.json:1-7`, `.vscode/extensions.json:1-3` (editor config) — pinned at
SHA f934d43

#### Problem

`extensions.json` recommends `dprint.dprint`, `esbenp.prettier-vscode`, and `svelte.svelte-vscode`,
but `settings.json` sets `editor.defaultFormatter` only for `[markdown]` (→ dprint). It never sets
Prettier as the default formatter for `.ts`/`.js`/`.json`/`.svelte`, nor `editor.formatOnSave`. A
contributor who installs the recommended extensions still gets no Prettier-on-save for code and may
default to VS Code's built-in formatter, producing diffs `format:check` then rejects.

#### Proposed solution

Add `editor.defaultFormatter: "esbenp.prettier-vscode"` for `[typescript]`/`[javascript]`/`[json]`
and `svelte.svelte-vscode` for `[svelte]`, plus `editor.formatOnSave: true`, so the committed
workspace settings match the CI formatters end-to-end.

#### Verification

Open a `.ts` file in VS Code with the recommended extensions and save an intentionally mis-formatted
line; today nothing reformats it. After the change, save reformats to match `npm run format:check`.

---
