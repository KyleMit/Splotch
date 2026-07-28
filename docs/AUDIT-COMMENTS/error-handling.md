# Audit comments — Error handling & correctness

14 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see
the README for what this archive is, the full run table, and the category index.

## PR [\#546](https://github.com/KyleMit/Splotch/pull/546) — Audit burndown: clear the staged docs/AUDIT.md backlog (2026-07-25)

### 44f80ad167e4 — [P3][error-handling] `applySnapshot` conflates transport status, JSON parsing, and four pieces of UI state mutation

**Issue**

```ts
async function applySnapshot(response: Response) {
  if (response.status === 401) { signOutLocally(...); return false; }
  const data = await response.json().catch(() => null);
  if (!response.ok || !isSnapshot(data)) {
    const text = responseError(data) ?? 'Something went wrong. Please try again.';
    if (authed) flash = {...}; else loginError = text;
    return false;
  }
  invites = data.invites; persistent = data.persistent; authed = true;
  return true;
}
```

One function decides auth-expiry policy, parses the body, branches error routing on whether the user
is `authed`, *and* commits four `$state` writes. The `if (authed) flash else loginError` routing
(which error surface to paint) is a UI concern tangled into what reads like a data-parsing helper, …

**Fix**

Extracted a pure `parseSnapshot(response)` returning a discriminated `SnapshotResult` (ok / expired
/ error), so response parsing and validation are independently testable and free of component state;
`applySnapshot` now only maps that result onto `invites`/`persistent`/`authed` and picks the error
surface. Its signature, the `Promise<boolean>` contract, and all three call sites are unchanged, and
the 401 decision stays inside `applySnapshot` since all three callers want identical
sign-out-locally behavior.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/admin.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/546#issuecomment-5081112829) · 2026-07-25
23:57:54 UTC</sub>

## PR [\#550](https://github.com/KyleMit/Splotch/pull/550) — Burn down staged audit findings (continuation 2) (2026-07-26)

### c543007599d6 — [P2][error-handling] `lazyIdbDatabase` memoizes a rejected open promise forever — one transient IndexedDB failure disables persistence for the whole session

**Issue**

```ts
let dbPromise: Promise<import('idb').IDBPDatabase> | null = null;
return () => {
  if (!dbPromise) {
    dbPromise = import('idb').then(({ openDB }) => openDB(...));
  }
  return dbPromise;
};
```

`if (!dbPromise)` treats a *rejected* promise as present (a rejected promise is truthy), so a
one-time `openDB` failure — a transient error, a locked DB during an upgrade, a private-mode hiccup
— is cached and every later call replays the same rejection. This contradicts the deliberate
recover-on-rejection pattern used everywhere else in the same storage layer:
`secureStorage.ts:60-63` nulls `masterKeyPromise` on catch, and `settings.svelte.ts:302-313` nulls
`folderSaveModule` on a failed import. `idb.ts` is the shared foundation for both `secureStorage` …

**Fix**

Reset the memoized IndexedDB open promise when opening fails so later calls can retry while
successful connections remain shared. Added a direct unit test covering the initial rejection,
successful retry, original-error propagation, and subsequent memoization.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084373397) · 2026-07-26
16:32:06 UTC</sub>

### 1db11a745037 — [P3][error-handling] `loadSecret` and `webLoad` collapse every failure into `null` — a decrypt/plugin error is indistinguishable from "no key stored"

**Issue**

`webLoad` catches a failed `crypto.subtle.decrypt` and returns `null` (line 105-107); `loadSecret`
wraps everything in a `try { … } catch { return null }` (line 141-143), with no log on either. So a
corrupt payload, a rotated master key, a Keychain error, or a genuinely-absent secret all surface
identically as "no credential." For the parent's API key / admin session that means a silent,
unexplained logout with zero diagnostic trail. The comment "master key missing/rotated or payload
corrupt — treat as no value" acknowledges lumping distinct failures together.

**Fix**

Secure-storage reads now reserve silent `null` for genuinely absent rows; malformed payloads,
decryption errors, and backend failures produce one warning at the shared recovery boundary while
still returning `null`. Tests cover silent absence, malformed data, and master-key replacement.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084374655) · 2026-07-26
16:32:25 UTC</sub>

### 19d1b130f34a — [P4][error-handling] `readBool` honors the fallback only for a *missing* key, not a *corrupt* value — inconsistent with `readInt`

**Issue**

```ts
const raw = localStorage.getItem(key);
if (raw === null) return fallback;
return raw === 'true';
```

A garbage value (`'1'`, `'yes'`, a half-written string) yields `false`, not the caller's `fallback`.
`readInt` (lines 144-153) deliberately falls back on unparseable/out-of-range values; `readBool`
does not, so the two helpers disagree on how to treat corruption. For a setting whose default is
`true`, a corrupt value flips it off rather than to the intended default.

**Fix**

Corrupt persisted booleans now fall back unless they are canonical `true` or `false`, including the
pre-hydration first-paint parser. Added unit and browser-flow coverage ensuring a corrupt default-on
eraser setting stays available.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084376199) · 2026-07-26
16:32:48 UTC</sub>

### 34445be45974 — [P4][error-handling] A single `storageWarned` flag silences read *and* write warnings across each other

**Issue**

`storageWarned` is shared by `safeLocalStorage` (write) and `safeRead` (read). The first failure of
*either* kind sets it, so a later failure of the *other* kind is silent. A quota-exceeded write
followed by a security-error read (distinct problems) logs only the first, hiding the second failure
mode from the console entirely.

**Fix**

Separated storage mutation and read warning guards so each distinct failure reports once without
changing fallbacks or durable mirroring. Added coverage that throws both operations in one module
instance and confirms repeated failures remain suppressed.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084376645) · 2026-07-26
16:32:55 UTC</sub>

### 05ded79a19f9 — [P4][error-handling] `saveSecret` silently no-ops on an empty value, coupling "save" to truthiness

**Issue**

`if (!browser || !value) return;` — calling `saveApiKey('')` does nothing, neither saving nor
clearing. The intended clear path is elsewhere (`settings.setAiUserApiKey` branches to
`clearApiKey`, `settings.svelte.ts:218-221`), so `saveSecret` quietly assumes callers never pass
empty. A future caller expecting `save('')` to persist-or-clear gets a silent nothing.

**Fix**

Empty saves now use the existing best-effort clear path, preventing stale persisted credentials.
Added a regression test covering API-key removal and subsequent null loading.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts tests/admin.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084377602) · 2026-07-26
16:33:10 UTC</sub>

## PR [\#551](https://github.com/KyleMit/Splotch/pull/551) — chore(audit): burn down 126 staged findings (2026-07-26)

### 8e5c274ffdd1 — [P3][error-handling] Audits abort the whole run on one unreadable/missing asset

**Issue**

The generators wrap each page in `try/catch` and tally `failures` so one bad page doesn't kill a
category run (e.g. chalk:413-417, dark:433-436). The audits do not: a single corrupt webp or a race
with a half-written file throws out of the loop and aborts the entire catalog pass with a raw stack
trace, losing all results computed so far. For tools meant to double as CI checks over ~94 pages,
that's a fragile failure mode and gives no indication which page broke.

**Fix**

Added per-page error recovery to all four catalog audits so unreadable assets are identified without
aborting remaining work. Golden freeze/diff now retain successful scores, omit failed pages, finish
normal reporting, and exit non-zero when scoring errors occur.

*Revised before approval:* Golden freeze now refuses to overwrite the baseline when any page fails
scoring and reports that the existing file was preserved. Added isolated CLI regression tests
covering corrupt-page diagnostics, continuation, and non-zero exits across all four audits,
including golden diff and freeze preservation.

*Revised before approval:* Golden scoring now carries the exact errored page names into diff
reporting, so those pages retain their ERROR failure without being misclassified as missing quality
regressions. The regression test now asserts the error-only run reports zero regressions and no
synthetic missing-page entry.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `audit-golden.mjs` still writes `golden-scores.json` in `--freeze` mode when one or more pages
  error, replacing the complete baseline with a partial catalog; skip the write when `errors > 0` so
  a corrupt asset cannot silently discard baseline pages despite the non-zero exit.
* No regression tests exercise the new per-page error paths in the four audit scripts, including
  continuation after a corrupt page and the final non-zero exit, so this behavior can regress while
  the existing suite remains green.
* `audit-golden.mjs` treats every page that failed scoring as absent from the current catalog, so
  `--diff` falsely reports it as `page missing` and increments the quality-regression count in
  addition to the `ERROR`; track errored page names separately and exclude them from missing-page
  regressions.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086084225) · 2026-07-27
00:14:01 UTC</sub>

## PR [\#554](https://github.com/KyleMit/Splotch/pull/554) — Burn down staged audit findings (2026-07-27)

### ea4ba28e3c43 — [P3][error-handling] Give `loadInputs` and the replay/webinspector loaders friendly failures on missing/malformed input

**Issue**

`analyze.mjs:80` calls `statSync(target)` on the raw CLI arg — a nonexistent path throws a raw
`ENOENT` stack, not the usage message the function otherwise prints for a missing arg.
`JSON.parse(readFileSync(tracePath …))` (line 83) throws an unhelpful `SyntaxError` on a truncated
trace. `analyze-webinspector.mjs:37` does `JSON.parse(readFileSync(path)).recording` — a
valid-JSON-but-wrong-shape file yields `Cannot read properties of undefined (reading 'markers')`
downstream. `replay-scenario.mjs:53` parses the recording and immediately dereferences
`recording.events.length` (line 91) with no check that `events` is an array.

**Fix**

Updated all three performance CLI loaders to convert missing, unreadable, malformed, and
wrong-shaped inputs into concise path-specific failures. Replay recordings are now validated before
any output directory, build, or browser work begins.

*Revised before approval:* Added subprocess-level regression coverage for all eight friendly-failure
paths across the three performance CLIs. The tests require a nonzero exit, empty stdout, and exactly
one path-specific stderr line for missing, malformed, and wrong-shaped inputs.

**Adversarial review** — reviewer caught the following; addressed before approval:

* None of the new friendly-failure branches has regression coverage; add CLI tests for missing
  files, invalid JSON, missing `.recording`, and a replay recording without an `events` array,
  asserting a one-line contextual error and nonzero exit.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090792453) · 2026-07-27
11:35:24 UTC</sub>

### 34f250db20ad — [P4][error-handling] A single scenario's `settleColdTier` timeout aborts the whole undo run

**Issue**

`settleColdTier` throws when the cold tier never settles (line 282). It's called inside the scenario
loop (line 363) with no per-scenario try/catch, so one flaky scenario (a slow blob encode on a
loaded CI box) throws straight out of the `for (const sc of scenarios)` loop and skips artifact
writing for every scenario — including the ones that already completed. A multi-minute run is lost
to one late tier settle.

**Fix**

Undo profiling now records and reports skipped scenarios after individual failures, allowing later
scenarios and artifacts to complete. The cold-tier timeout can be forced through a profiling flag
while retaining the normal 10-second default.

*Revised before approval:* Added a script-level regression test that forces the cold-tier timeout,
verifies the skipped diagnostic in both artifacts, and confirms a later scenario still completes.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The timeout-recovery path in `scripts/perf/undo-scenarios.mjs:462-501` has no regression coverage:
  add a test that forces `settleColdTier` to time out and proves later scenarios plus both artifacts
  survive with the failed scenario’s diagnostic.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5091079038) · 2026-07-27
12:07:42 UTC</sub>

### 40824347bef4 — [P4][error-handling] `getWebviewPage`/`findWebviewSocket` use unlabeled retry magic and a fragile URL heuristic

**Issue**

`getWebviewPage` loops `for (let i = 0; i < 20; i++)` with a hardcoded `sleep(500)` and picks the
page via `pages.find((p) => !p.url().startsWith('about:')) || pages[0]` — the `20`/`500` (a 10 s
budget) are unnamed, and the `about:` filter silently falls back to `pages[0]` when every page is
`about:` (e.g. the WebView still booting), so it can hand `driveSession` a not-yet-navigated page
that then fails later at `waitForSelector('#drawingCanvas')` with a less clear error.
`findWebviewSocket` (25 s) and `getWebviewPage` (10 s) also express the same "poll with deadline"
pattern two different ways (deadline timestamp vs iteration count).

**Fix**

Added bounded shared polling for Android CDP discovery so only navigated WebView pages are selected,
preserving the existing socket and page timing budgets. Added mocked CDP regression coverage for
navigated-page selection and all-`about:` discovery failure.

*Revised before approval:* Reformatted the affected Android profiler and CDP regression test files
to meet the repository’s Prettier requirements; no functional behavior changed.

*Revised before approval:* Restored the timeout-boundary predicate check so a WebView socket or page
that appears during the final interval is still discovered. Updated the mocked CDP regression to
assert that final observation.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `scripts/lib/utils.mjs`: `pollUntil` returns after the final sleep without invoking the callback
  again, so `findWebviewSocket` now misses a socket appearing during the last one-second interval
  even though the old loop checked once more before enforcing its deadline. Poll the predicate at
  the deadline and update the page test instead of locking in the shortened observation window.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5091621312) · 2026-07-27
13:01:51 UTC</sub>

## PR [\#561](https://github.com/KyleMit/Splotch/pull/561) — Burn down 114 staged audit findings (2026-07-27)

### 8667e474cffa — [P2][error-handling] `session-start.sh` final `svelte-kit sync` is unguarded under `set -e`, contradicting the hook's best-effort intent

**Issue**

The hook opens with `set -euo pipefail` (line 2) and deliberately wraps the fragile `npm install`
step in a fallback so a failed lifecycle script "doesn't kill this hook silently, leaving the
session with no deps at all" (lines 25-33). But the final step is bare:

```bash
node scripts/web.mjs svelte-kit sync   # line 42 — no || guard
```

Under `set -e`, if `svelte-kit sync` exits non-zero (e.g. a transient generate failure, or a partial
`node_modules` from the `--ignore-scripts` fallback path just above), the whole SessionStart hook
exits non-zero. That is inconsistent with the philosophy the file itself states two steps earlier,
and with the sibling `.codex/cloud/*.sh` scripts, which `|| warn` every step. A missing …

**Fix**

Made the final SvelteKit sync non-fatal while printing an actionable warning that tells users to
rerun the exact sync command before checking the project.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5096804580) · 2026-07-27
21:04:34 UTC</sub>

### 07668b554f7d — [P3][correctness] Deep-linking via `hashchange` (or back/forward) leaves `document.title` stale

**Issue**

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

**Fix**

Moved the proof-sheet title update outside the hash-write guard so hash edits and browser history
keep the tab title synchronized with the displayed category, without changing existing hash
behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5098266901) · 2026-07-28
00:09:26 UTC</sub>

### e3b56da58d3e — [P4][correctness] Initial load rewrites the URL to `#farm` and pushes a history entry

**Issue**

On first load with no hash, `show(indexFromHash())` runs with `indexFromHash()` returning `0`, and
because `skipHash` is falsy it executes `location.hash = cat.id` (line 226) since `'' !== 'farm'`.
So opening the bare hub URL immediately mutates the address bar to `…/index.html#farm` and, because
assigning `location.hash` creates a new history entry, adds a spurious Back-button stop before the
page the user actually arrived from. The shareable/canonical URL a visitor copies also silently
gains a `#farm` they didn't choose.

**Fix**

Initial hub canonicalisation now replaces the current history entry, preventing a bare proof-sheet
URL from adding an extra Back-button stop while preserving user navigation behavior.

*Revised before approval:* Added a browser regression spec that serves the committed proof-sheet
hub, verifies its Farm initialization and title from a bare URL, and proves Back returns directly to
the preceding page.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The history behavior in `scrapbook/coloring-book-proof-sheets/index.html` has no regression
  coverage; add a browser test that enters the bare hub from another page, verifies Farm/title
  initialization, and confirms Back returns directly to the prior page.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5098268762) · 2026-07-28
00:09:45 UTC</sub>

## PR [\#589](https://github.com/KyleMit/Splotch/pull/589) — Drain audit-deferred decision docs: implement the triaged fixes (2026-07-28)

### Finding 3 of 15 — `bumpAndroidGradle`/`bumpIosPbxproj` unanchored global regexes — ✅ FIXED

**Decision doc:** `native-version-regexes.md` (verdict FIX) · **Priority:** P2

#### What changed

* `scripts/lib/native-version.mjs` — the bare greedy `/versionName.*/g`-style rewrites are replaced
  by a shared line-based `bumpLines` helper: strict whole-line assignment patterns rewrite only
  recognized lines (indentation preserved), and a fail-closed guard throws on any *other* line
  containing the token. So `versionNameSuffix`, inline comments on the assignment, assignment-shaped
  text in comments, compact pbxproj dictionaries, and duplicate assignments all fail loudly with an
  actionable error naming the token, the file, and the fix — instead of being silently rewritten or
  skipped. Android requires exactly one match per token; iOS rewrites all build configurations
  (Debug + Release). The header's stale "byte-identical to capacitor-set-version" claim is gone.
* `scripts/tests/native-version.test.mjs` (new) — 11 tests run against the *real committed*
  `build.gradle` and `project.pbxproj`: correct bump with indentation preserved, byte-identical
  output when re-applying the committed version (proves today's release output is unchanged), and
  throw cases for `versionNameSuffix`, full-line comments, inline comments, duplicates, missing keys
  (both platforms), and compact pbxproj dicts.

#### Adversarial review

Independent reviewer with no implementer context: **APPROVE.** Verified the patterns against the
real committed native files and the sole caller (`scripts/release.mjs`); confirmed all five prior
burndown objections resolved empirically via probes (inline comment → throws; comment-block
assignment → loud duplicate error on Android, iOS declared out of scope per the doc; compact dict →
throws; the broken block-comment masker is gone by deletion; strings containing the token trip the
guard). Two nits, both addressed in a follow-up round:

1. The inline-comment-on-the-assignment-line case the doc claimed was test-covered had no test →
   test added.
2. When a token's only occurrence was an unrecognized shape, the misleading "Could not find" error
   fired before the actionable "Unrecognized line…" one → guard reordered; the new test asserts the
   actionable message surfaces (proving the reorder is effective, since that case previously
   produced zero strict matches).

#### Verification

`npm run test:scripts`: 167/167 pass (10 new tests + 1 from the review round). Byte-identical
re-apply tests on the committed native files prove release behavior is unchanged. Formatting clean
under Prettier and dprint.

#### Drained

Deleted `docs/audit-deferred/decisions/native-version-regexes.md` and its stale draft patch
`p2-cross-platform-bumpandroidgradle-bumpiospbxproj-regexes-are-unanchore.patch`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/589#issuecomment-5102862197) · 2026-07-28
10:17:56 UTC</sub>
