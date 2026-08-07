# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

That last line is the one this file kept failing. The 2026-07-28 comprehensive per-section audit
filed 649 raw findings here and they were worked as a standing backlog for ten days. Successive
burndown campaigns fixed roughly 300, and two `/vet-audits` passes drained the severity head into
issues #774–#785. On 2026-08-07 the remaining 346 were re-triaged against `main` and cut to 75; the
other 271 were deleted outright. The deletion was the point rather than a side effect — the
reasoning is in `docs/AUDIT-LOG.md` under 2026-08-07 · audit-triage, and every deleted finding
remains in this file's git history. The re-pinning below dropped 3 more, leaving 72 here.

The 2026-08-07 `burn-down-audits` campaign (PR #830) then fixed 29 of those with no drops and no
deferrals, which emptied the *Silent wrong output* group outright — its section is gone from the
list below, and `docs/AUDIT-LOG.md` carries the run's row. The compatibility-register drift guard
then removed one more resolved finding. This review dropped two more findings whose reports had
drifted out of date, leaving the 40 below.

**Citations are pinned to commit cd04c367 (2026-08-07), the current `main` head at the time of this
review.** They were originally taken at 9ae62ff1 (2026-07-28), then re-pinned to f5bf8767
(2026-08-06). Every cited line was re-derived against cd04c367 by following the referenced symbol or
content, not by preserving its old offset.

The 3 findings dropped during the re-pinning were the ones whose citations still resolved but whose
code no longer said what the finding described, because each had been fixed in the meantime:
create-adr's step 4 now reads "do not count files"; `MAX_HOT_RASTERS` no longer exists in the perf
harness; and `scripts/tests/dev-ports.test.mjs` now guards the dev/preview ports. Follow any
citation below directly; re-verify the surrounding code anyway.

The `##` sections below are **curated groups**, not the usual per-producer `## Source: <audit>`
sections — each names the criterion that earned its findings a place, because that criterion is the
argument for keeping them. A new producer still appends its own `## Source:` section as normal; the
two shapes coexist and the merge rules are unchanged. Priorities (P2–P5) are the original
within-section ranks and are not comparable across groups; the grouping supersedes them.

## App correctness that reaches users

Behaviour defects in shipped `web/src/` and native-shell code. These are the ones that would
eventually arrive as a bug report — but the reporter is a two-year-old, so they won't.

### [Architecture] Give `authorizeGenerationRequest` one failure channel instead of three exit modes

**File(s):** `web/src/lib/server/generationAuthorization.ts` (`authorizeGenerationRequest`, lines
17–57) @ cd04c367

**Priority:** P3

#### Problem

The function terminates through three different channels:

* returns a `GenerationAuthorization` object on success (lines 42–46, 56);
* **returns** a `Response` for throttling (lines 31, 39, 55);
* **throws** a SvelteKit `HttpError` for auth/config failures (line 34 `throw error(403, …)`, line
  41 `throw error(500, …)`).

The caller (`generate-image/+server.ts:113–118`) must know that the union return type only covers
two of the three outcomes and that a third escapes via exceptions — the signature
`Promise<GenerationAuthorization | Response>` under-describes the contract. Tests mirror the
awkwardness: some assert `result instanceof Response`, others `rejects.toMatchObject`. For a
first-time reader, the mixed convention obscures which failures are "expected flow" and which are
exceptional.

#### Proposed solution

Pick one convention. The lightest change is to throw nothing and return a discriminated union:

```ts
export type GenerationAuthorization =
  | { authorized: true; usingByok: boolean; effectiveKey: string; managedToken: string | null }
  | { authorized: false; response: Response };
```

with the 403/500 branches producing `{ authorized: false, response: json({...}, { status }) }` (or
keep `error()` throws for *both* 403/500 and throttling by throwing `HttpError`-shaped 429s — but
`throttled()` is the repo's canonical 429, so the return-based shape fits better). Tradeoff: the
route's `instanceof Response` check becomes a plain discriminant check, which is also more grepable.
Update `generationAuthorization.test.ts` accordingly.

### [Performance] Pinch move path allocates per pointermove, against the repo's hot-path rule

**File(s):** `web/src/lib/actions/pinchZoom.svelte.ts` (`centroid` lines 54–62, `recompute` lines
89–108, `local` lines 169–172) @ cd04c367; `web/src/lib/actions/spreadTracker.ts` (`points()` lines
20–22)

**Priority:** P4

#### Problem

The svelte rule file is explicit that gesture trackers are hot paths: "code reached per pointermove
… must not allocate arrays/objects". Each `pinchZoom` move allocates: `tracker.points()` builds a
fresh array (twice per move — `recompute` line 91 and inside `centroid`'s caller), `centroid`
returns a new object, `local` returns a new `Point`, `recompute` builds a new transform object, and
`apply` builds a template string. A prior commit (f3faf52) already removed one such allocation from
`spread()`, so the codebase treats this path as worth tightening; the remaining ones are the same
class. In fairness this runs only while pinching the AI preview (not while drawing), so the
practical stakes are modest — but the stated rule draws no such distinction, and the fix is cheap.

Secondary: the `rect ?? node.getBoundingClientRect()` fallbacks (lines 165, 171) are defensive
lazy-init on the move path — unreachable in practice (`rect` is always set by the `pointerdown` that
made `pointerCount > 0`), which the hot-path rule also calls out.

#### Proposed solution

Give the tracker a non-allocating iteration surface (e.g. `forEach(cb)` or reused first/second
accessors — it already has an allocation-free `spread()`); compute the centroid with a running sum
over that; reuse a scratch `Point`/transform object in `recompute`. Replace the `??` fallbacks with
a direct `rect!`-free structure: snapshot `rect` in `onPointerDown` and pass width/height/left/top
through the closure invariant (a comment stating the invariant beats a silent re-measure). Verify
with `npm run perf:*` only if the drawing path is ever routed through this tracker; otherwise a
before/after allocation check in DevTools is enough.

## Safety, resource, and ships-to-production

Unbounded work, unvalidated input reaching a shell, unpinned remote code, and files that reach the
production bundle or the clone weight without being needed there.

### [Performance] `generate-image` buffers up to 15 MB before rejecting an unsupported Content-Type on the raw path

**File(s):** `web/src/routes/api/generate-image/+server.ts` (`POST`, lines 120–125; raw
`readValidatedImage`, lines 77–84) @ cd04c367

**Priority:** P4

#### Problem

On the raw-body contract the MIME type is known from the header before any body byte is read
(`contentTypeOf(request)`, line 82), yet the allowlist check runs only after `readValidatedImage()`
has buffered the full body:

```ts
const { bytes: inputBytes, mimeType } = await source.readValidatedImage();
// An empty type is fine (default to PNG below); only reject a type that's
// present and not on the allowlist.
if (mimeType && !ALLOWED_IMAGE_TYPES.includes(mimeType)) {
  throw error(415, 'Unsupported image type');
}
```

A credentialed caller posting 15 MB of `application/octet-stream` costs a full buffer + copy on the
single synchronous Netlify function (the memory/DoS scenario `MAX_IMAGE_BYTES`'s own comment worries
about) before the cheap header check rejects it. The multipart path can't avoid buffering
(credentials live in the body), but the raw path — the current contract — can.

#### Proposed solution

Move the allowlist check inside each `readValidatedImage` thunk: the raw thunk checks
`contentTypeOf(request)` *before* `readBodyWithinLimit`; the multipart thunk checks `imageFile.type`
after the (unavoidable) parse. This also relocates the 415 beside the 413/400 it belongs with.
Gotcha: the raw path's status for "oversized AND unsupported" flips from 413 to 415 — update the
api-smoke expectation if it pins that combination (it currently only pins the multipart 415 case).

### [Performance] Service-worker precache includes assets the app never fetches (social og:image, generator source SVGs)

**File(s):** `web/vite.config.ts` (`workbox.globPatterns`, line 107) @ cd04c367

**Priority:** P3

#### Problem

`globPatterns: ['**/*.{js,css,ico,png,svg,webp,mp3,woff2,webmanifest}']` (line 107) sweeps
everything in the build output — including `static/` files that only exist for *external* consumers
and are never requested by the running app:

* `web/static/large-image.png` (556,002 bytes) — referenced only by `og:image`/`twitter:image` meta
  in `web/src/app.html:32,41`; fetched by link-unfurling scrapers, never by a browser session.
* `web/static/large-image.svg` (7,497 bytes) — input file for `scripts/gen-large-image.mjs:32`, not
  a runtime asset.
* `web/static/styles/source.svg` (55,652 bytes) — input for
  `tools/asset-gen/bin/gen-style-covers.mjs:102`, not a runtime asset.

That is ~620 KB of precache downloaded by every client that installs the SW, on top of the ~35 MB
the config already frets about ("a window.load registration would saturate a slow connection", lines
89–94). The config already demonstrates deliberate precache curation (`navigateFallback: ''`, html
excluded) — these files just slipped through the glob.

#### Proposed solution

Add `globIgnores: ['large-image.png', 'large-image.svg', 'styles/source.svg']` beside `globPatterns`
(workbox supports it at the same level), with a WHY comment ("social-card + generator inputs —
served, never fetched by the app"). If the generator-input SVGs move out of `static/` entirely (see
the next finding), only `large-image.png` needs ignoring. Verify by inspecting the emitted `sw.js`
precache manifest after `npm run build`.

### [Architecture] Generator input files live in web/static and ship to production

**File(s):** `web/static/large-image.svg`, `web/static/styles/source.svg` @ cd04c367

**Priority:** P3

#### Problem

Both SVGs are *inputs* to offline tooling, not app assets: `scripts/gen-large-image.mjs:32` reads
`web/static/large-image.svg` to replay strokes onto the live canvas, and
`tools/asset-gen/bin/gen-style-covers.mjs:102` reads `web/static/styles/source.svg` to generate the
style-cover webps. Neither is referenced by any runtime code path (only `scripts/image-audit.mjs:38`
— which has to special-case both in its `IGNORE` set precisely because they aren't app images).
Housing tool inputs in the production publish directory means they are served publicly, copied into
the web build, and precached (previous finding), and it muddies the otherwise-clean rule that
`static/` is "the files meant to be served verbatim" (`web/netlify.toml:16-17`). The native build's
`scripts/lib/native-export.mjs` already strips both inputs, so they no longer reach Android/iOS.

#### Proposed solution

Move `large-image.svg` beside its consumer (e.g. `scripts/assets/large-image.svg`) and `source.svg`
into `tools/asset-gen/` (its docs at `tools/asset-gen/docs/README.md:152` already describe it as a
committed pipeline input). Update the two generator paths and drop both entries from
`scripts/image-audit.mjs`'s `IGNORE` set. Gotcha: confirm neither URL is referenced externally
(nothing in-repo fetches them over HTTP).

### [Correctness] `install-maestro` pipes an unpinned remote script to bash and never verifies the pin took effect

**File(s):** `.github/actions/install-maestro/action.yml` (lines 7–13) @ cd04c367

**Priority:** P3

#### Problem

```yaml
- name: Install Maestro CLI
  shell: bash
  env:
    MAESTRO_VERSION: 2.4.0
  run: |
    curl -fsSL "https://get.maestro.mobile.dev" | bash
    echo "$HOME/.maestro/bin" >> "$GITHUB_PATH"
```

This is the one place in `.github/` that executes remote code without a pin: every external action
is SHA-pinned (and `scripts/tests/workflow-hygiene.test.mjs` enforces exactly that, rejecting any
`uses:` ref not ending in a 40-char SHA), yet whatever `get.maestro.mobile.dev` serves at run time
executes verbatim on the runner. The `MAESTRO_VERSION` env var pins the CLI *only if* the remote
script continues to honor that variable — if upstream renames it, the step silently installs latest,
and the action's own description ("Install the pinned Maestro CLI version") becomes false with no
failing signal. Both release-tag deploy smokes (`android-deploy.yml` line 55, `ios-deploy.yml`
line 32) depend on it at the most sensitive moment in the pipeline.

#### Proposed solution

Two independent, cheap hardenings:

1. **Assert the pin took:** after install, fail loudly on drift —
   ```bash
   installed="$("$HOME"/.maestro/bin/maestro --version 2>/dev/null | head -1)"
   [[ "$installed" == *"$MAESTRO_VERSION"* ]] || { echo "::error::Maestro $installed != pinned $MAESTRO_VERSION"; exit 1; }
   ```
2. Optionally, fetch the install script from Maestro's GitHub repo at a tagged ref (or vendor the
   ~30-line script into `.github/actions/install-maestro/`) so the executed bytes are pinned the
   same way every `uses:` ref already is.

Tradeoff: vendoring means occasionally refreshing the script; the version assertion alone converts
"silently wrong version" into a red job, which is most of the value.

### [Correctness] The E2E spec sanitizer admits leading-dash values and `..` traversal

**File(s):** `scripts/audit-burndown/burndown.mjs` (lines 714–719, 530–537) @ cd04c367

**Priority:** P4

#### Problem

```js
const e2eSpecs = (verify.structured.e2e_specs ?? []).filter(
  (spec) => typeof spec === 'string' && /^[\w./-]+$/.test(spec),
);
```

The comment says "Sanitize hard: these strings are LLM-authored and reach a shell" — and the class
does block shell metacharacters. But `-` and `.` are in the class unanchored, so `--grep-invert`,
`-x`, or `../../something.spec.ts` all pass and are joined straight into the shell command at line
362 (``runGate(`${E2E_CMD} ${specs.join(' ')}` …)``). A verifier that emits a flag-shaped "spec"
silently changes Playwright's behavior for the gate (e.g. inverting the filter), which corrupts the
gate's verdict rather than failing loudly. The verifier prompt says specs are "paths relative to
web/, e.g. `tests/flows-undo-persistence.spec.ts`" (verifier.md lines 63–64) — the sanitizer should
encode that shape.

#### Proposed solution

Tighten to the documented shape:

```js
const E2E_SPEC_SHAPE = /^tests\/[\w/-]+\.(spec|test)\.ts$/;
```

or minimally reject `spec.startsWith('-')` and `spec.split('/').includes('..')`. Log rejected values
(currently they vanish silently) so a misbehaving verifier is visible in run.log.

### [Correctness] overnight.mjs neither validates the count argument nor shell-quotes it

**File(s):** `scripts/audit-burndown/overnight.mjs` (lines 24, 51–52) @ cd04c367

**Priority:** P3

#### Problem

```js
const count = process.argv[2] ?? '600';
…
const envPrefix = [`MAX_ISSUES=${count}`, ...forwarded].join(' ');
const cmd = `env ${envPrefix} node scripts/audit-burndown/burndown.mjs`;
```

Two defects:

1. **No validation.** `npm run audit:burndown:overnight -- 6OO` (typo) launches a detached job whose
   `Number('6OO')` is `NaN`; burndown's `while (done < MAX_ISSUES)` (line 1138) is instantly false,
   so the run preflights green, detaches, prints the launch banner… and exits having done nothing,
   with only a `finished: 0 fixed` line in a log nobody is watching. scripts/CLAUDE.md requires:
   "validate inputs up front with a path-specific one-line error and a non-zero exit."
2. **Inconsistent quoting.** Every forwarded knob goes through `shellQuote` (line 48) but `count` is
   interpolated raw into a `shell: true` spawn (line 55). Operator-supplied, so not a security hole
   in practice, but an argument containing a space or metachar corrupts the command line silently
   instead of failing loudly.

The same `Number(...)`-NaN silence applies to `MAX_ISSUES`/`MAX_HANDLED`/etc. inside burndown.mjs
itself (lines 94–149), but the launcher is where a human types the value.

#### Proposed solution

```js
const count = process.argv[2] ?? '600';
if (!/^\d+$/.test(count) || Number(count) < 1) {
  console.error(
    `overnight: finding count must be a positive integer, got ${JSON.stringify(count)}`,
  );
  process.exit(2);
}
```

and `MAX_ISSUES=${shellQuote(count)}` in the prefix for symmetry with the forwarded knobs.

### [Correctness] android-emulator-smoke boot wait can spin forever and crashes opaquely when no serial matches

**File(s):** `scripts/android-emulator-smoke.mjs` (lines 70–73) @ cd04c367

**Priority:** P3

#### Problem

```js
await Promise.race([adb('wait-for-device'), emulatorCrash]);
while ((await adb('shell', 'getprop', 'sys.boot_completed')) !== '1') await sleep(2000);
emulatorProc.unref();
const serial = (await adb('devices')).match(/emulator-\d+/)[0];
```

Three issues:

1. The `getprop sys.boot_completed` loop (line 71) has no timeout. A boot that hangs (the exact
   hardware-accel misconfiguration this script preflights for at lines 25–38 is not the only way an
   emulator wedges) leaves `npm run test:android` spinning silently forever. `scripts/CLAUDE.md`
   says explicitly: "name polling budgets". The repo already has
   `pollUntil(callback, timeoutMs, intervalMs)` in `scripts/lib/proc.mjs` (lines 102–111) built for
   precisely this.
2. The `emulatorCrash` race only guards `wait-for-device` (line 70); the boot-completed loop and
   `adb devices` call are outside it. (A hard crash usually makes `adb` reject so the failure
   surfaces, but a crash that leaves adb responsive with no device does not.)
3. `.match(/emulator-\d+/)[0]` (line 73) throws a bare `TypeError: Cannot read properties of null`
   when no emulator serial appears — an opaque failure at the exact moment something already went
   wrong.

#### Proposed solution

Name a budget and use the existing helper:

```js
const BOOT_TIMEOUT_MS = 300_000; // cold emulator boot on CI-class hardware
const BOOT_POLL_INTERVAL_MS = 2_000;
const booted = await pollUntil(
  async () => (await adb('shell', 'getprop', 'sys.boot_completed')) === '1',
  BOOT_TIMEOUT_MS,
  BOOT_POLL_INTERVAL_MS,
);
if (!booted) throw new Error(`Emulator did not finish booting within ${BOOT_TIMEOUT_MS / 1000}s`);
```

For the serial, guard the match:
`const serial = (await adb('devices')).match(/emulator-\d+/)?.[0]; if (!serial) throw new Error('No emulator serial in adb devices output');`.

### [Maintainability] `dev:kill` executes `kill-port` via bare `npx` — an undeclared, unpinned dependency fetched at run time

**File(s):** `package.json` (line 16) @ cd04c367

**Priority:** P4

#### Problem

```json
"dev:kill": "npx kill-port 5173 8888",
```

`kill-port` is not in `devDependencies` (only `tree-kill` exists in `node_modules/.bin`), so `npx`
resolves it from the registry on each first use: the script needs network to run (it exists
precisely for when the local environment is wedged), executes whatever version is `latest` that day,
and is exposed to registry-side supply-chain swaps. The repo's own ESLint config bans the bare
`playwright` import specifically because "bare playwright is an undeclared transitive dependency"
(eslint.config.js lines 65–69) — the same principle applies to tooling invoked from scripts.

#### Proposed solution

Either pin it as a devDependency (`"kill-port": "^2"`) so `npx` resolves the local, locked copy — or
drop the dependency entirely with a tiny Node helper in `scripts/` (consistent with ADR-0017's
"platform-specific tools are invoked via Node helpers"): find the PID listening on 5173/8888 via
`lsof -ti :5173` / reading `/proc` and `process.kill` it. The helper route also removes the one
remaining scripted network dependency for a purely local operation.

### [Maintainability] Prune the full-resolution working-set images committed under ideas-exploration (~34 MB)

**File(s):** `tools/asset-gen/ideas-exploration/idea-16/work/` (~14 MB),
`tools/asset-gen/ideas-exploration/idea-15/{hotspots,compare,img,regionmean}/` (~11 MB, 285 PNGs),
plus smaller sets in `idea-18/work/`, `idea-2/`, `idea-12/img/` @ cd04c367

**Priority:** P2

#### Problem

`ideas-exploration/` weighs 62 MB. Its own README (lines 122–129) defines the per-idea contract:
`report.md`, `meta.json`, `code/`, and "`*.webp` … before/after evidence (≤560 px)". But several
ideas committed their entire full-resolution working sets wholesale:

* `idea-16/work/` — 14 MB of full-res takes and composites for an idea whose Status is **NOT
  PROMOTED**; the decisive evidence is already inlined at 480 px (report line 156–162 names the
  ≤480px webp files and then says "Full-resolution takes and all composites are in `work/`").
* `idea-15/` — 12 MB for another **NOT PROMOTED** idea: four image dirs (`hotspots/`, `compare/`,
  `img/`, `regionmean/`) full of uncompressed PNGs (285 PNGs totalling 29 MB across the folder vs 13
  MB for all 416 webps).
* A scripted cross-check found 442 image files (~34 MB) referenced by neither any `meta.json` (what
  `build-review.mjs` inlines into the dashboard) nor individually by any `report.md` — they are
  covered at best by a directory-level "everything else is in work/" sentence.

This is committed R&D scratch, so the bar is "dead weight worth pruning": every clone, and every
future `git` operation, carries 30+ MB of full-res exploration outputs whose conclusions are already
captured in the ≤560 px evidence, the reports, and the 5 MB dashboard.

#### Proposed solution

For each idea, keep exactly what the README contract promises — the report, meta.json, code, and the
small webp evidence the report/meta reference — and delete the wholesale full-res dirs (or, where a
dir genuinely earns its keep, downsize to ≤560 px webp like the rest of the folder). `idea-16/work/`
and `idea-15/`'s three of four PNG dirs are the big wins. Update the affected reports' "evidence
files" sections in the same commit. Gotcha: history still carries the bytes — that's acceptable; the
goal is checkout/clone weight and honoring the folder's own layout contract, not history rewriting.

### [Maintainability] idea-21 carries 12.6 MB of regenerable proof-sheet HTML for a LANDED feature

**File(s):** `tools/asset-gen/ideas-exploration/idea-21/farm-compare-46bc770.html` (6.9 MB),
`idea-21/farm-git-46bc770.html` (5.7 MB); smaller: `owl-tall-compare-34a606f-prerename.html`,
`owl-tall-compare-6e3f14f.html` @ cd04c367

**Priority:** P3

#### Problem

Idea 21's Status is LANDED: `--source git:<ref>` is now a first-class mode of
`bin/gen-coloring-book-proof-sheet.mjs` (report line 3). The folder nonetheless commits four
self-contained demo sheets, two of them whole-category farm sheets at ~6–7 MB each — 12.6 MB, the
single largest weight in `ideas-exploration/` (15 MB total). Unlike NOT-PROMOTED evidence, these
prove nothing that can't be reproduced in ~3 s offline by the shipped tool
(`npm run gen:coloring-book-proof-sheet -- farm --source git:46bc770`); the small `pair-*.webp`
crops and `overview-owl-compare.webp` already document the outcome visually. The repo also has a
designated home for keeper run outputs — `/scrapbook` (ADR-0059) — and these aren't published there
either; they're dead bytes in a frozen R&D folder.

#### Proposed solution

Delete the four HTML sheets (certainly the two farm ones) and let the report's "how to reproduce"
line plus the committed webp crops carry the record; update `idea-21/report.md` and the folder
README's layout note ("idea-21 carries generated comparison sheets") in the same commit. If one
exemplar sheet is genuinely worth keeping browsable, publish the smallest owl sheet via
`npm run scrapbook:publish` instead of storing it here.

## Cross-file agreement held by prose

CLAUDE.md is explicit that a "keep in sync with X" comment marks a defect rather than a mitigation.
Kept only where the two sides can diverge *silently* and ship — release versions, ESLint's paired
restricted-import blocks, policy values re-declared in specs. One of these has already drifted.

### [Testing] Version numbers must agree across three files but have no at-rest drift guard

**File(s):** `android/app/build.gradle` (lines 28–29) · `ios/App/App.xcodeproj/project.pbxproj`
(lines 315, 322, 337, 344) · `package.json` (line 3) @ cd04c367

**Priority:** P3

#### Problem

The same release identity lives in three places: `package.json:3` (`"version": "1.4.0"`),
`android/app/build.gradle:28–29` (`versionCode 6`, `versionName "1.4.0"`), and
`ios/App/App.xcodeproj/project.pbxproj` (`CURRENT_PROJECT_VERSION = 6;` at 315/337,
`MARKETING_VERSION = 1.4.0;` at 322/344). `scripts/release.mjs` (`bumpVersions`, lines 119–128)
writes all three in one transaction, and `android/CLAUDE.md` warns "Don't hand-edit
versionCode/versionName".

But the repo convention (root `CLAUDE.md`, "Cross-file agreement is never maintained by prose")
requires a drift-guard test when agreeing sites can't share code — exactly the situation here
(Groovy, pbxproj, JSON). The existing tests don't cover it: `scripts/tests/native-version.test.mjs`
reads both real files but only asserts the bump transforms are idempotent per file ("is
byte-identical when re-applying the committed version", lines 28–32 and 77–81) — it never compares
Android's committed version to iOS's or to `package.json`'s. A hand edit (or a partially applied
release script run, e.g. killed between `setAndroidVersion` and `setIosVersion`) desyncs the stores'
versions and nothing goes red until store submission.

#### Proposed solution

Add an at-rest agreement suite to `scripts/tests/native-version.test.mjs` (the file already loads
both real sources):

```js
describe('committed native versions agree', () => {
  it('android versionName === ios MARKETING_VERSION === package.json version', ...);
  it('android versionCode === ios CURRENT_PROJECT_VERSION', ...);
});
```

Parse with the same strict regexes the bump code uses (export them from
`scripts/lib/native-version.mjs` rather than duplicating). pbxproj carries each key twice (Debug +
Release); assert all occurrences are identical, not just the first match.

### [Testing] The `scripts` ↔ `scripts-info` contract (ADR-0019) has no drift guard

**File(s):** `package.json` (lines 8–166 vs 167–325) @ cd04c367

**Priority:** P3

#### Problem

CLAUDE.md's command section states the contract: "every new or renamed script gets a matching
one-line entry in the `scripts-info` block". With 157 scripts and 157 descriptions maintained as two
parallel JSON objects, that agreement is currently kept purely by discipline — nothing fails when a
script is added without a description or a description is orphaned by a rename. (Today the key sets
happen to match exactly; the *ordering* has already drifted — first divergence at index 45,
`preperf:ipad` vs `preperf:ipad:frames` — showing the two blocks are in fact edited independently.)
The repo convention says exactly this situation gets a drift-guard test, and `scripts/tests/`
already hosts the analogous guards (`workflow-hygiene.test.mjs`, `labels.test.mjs`,
`claude-permissions.test.mjs`).

#### Proposed solution

Add `scripts/tests/scripts-info.test.mjs` (runs under the existing `test:scripts` tier):

```js
const { scripts, 'scripts-info': info } = JSON.parse(readFileSync(pkgPath, 'utf8'));
it('every script has a scripts-info entry', () =>
  expect(Object.keys(scripts).filter((k) => !(k in info))).toEqual([]));
it('every scripts-info entry has a script', () =>
  expect(Object.keys(info).filter((k) => !(k in scripts))).toEqual([]));
```

Optionally assert matching key order so the two blocks read in parallel; that's a style choice — the
presence checks are the load-bearing part.

### [Maintainability] `COLOR_CHANGE_DEBOUNCE_SETTLE_MS` keeps cross-file agreement with the engine by prose, not import

**File(s):** `web/tests/helpers.ts` (lines 29–30) and `web/src/lib/drawing/engine.ts`
(`COLOR_CHANGE_DEBOUNCE_MS`, line 773) @ cd04c367

**Priority:** P2

#### Problem

`web/tests/helpers.ts:29–30` is a textbook instance of the pattern CLAUDE.md calls a defect ("A
'keep in sync with X' comment marks a defect, not a mitigation"):

```ts
// Must remain greater than the engine's COLOR_CHANGE_DEBOUNCE_MS (100).
export const COLOR_CHANGE_DEBOUNCE_SETTLE_MS = 150;
```

The engine's constant is module-private (`web/src/lib/drawing/engine.ts:773`:
`const COLOR_CHANGE_DEBOUNCE_MS = 100;`), so the agreement is maintained only by this comment —
which also restates the mutable value `(100)`, a second convention violation ("no restating mutable
facts … owned elsewhere"). If the engine debounce is ever raised past 150 ms, every spec that sleeps
`COLOR_CHANGE_DEBOUNCE_SETTLE_MS` (`flows-magic-brush.spec.ts:649`,
`flows-palette-brush.spec.ts:77`, `engine-pointer-recovery.spec.ts:61`) starts flaking or silently
testing inside the debounce window, with nothing failing loudly to point at the drift.

The suite already imports engine constants directly — `engine-pointer-recovery.spec.ts:3-9` imports
`EDGE_SWIPE_BAND_PX`, `POINTER_RESUME_GAP_MS`, etc. from `$lib/drawing/strokeMath` — so the import
path is proven.

#### Proposed solution

Export the constant from a side-effect-free module (either export it from `engine.ts` if importing
it doesn't drag in import-time side effects for the Playwright Node context, or move it to
`$lib/drawing/strokeMath.ts` beside the other pointer-timing constants and have `engine.ts` import
it). Then derive the settle value:

```ts
import { COLOR_CHANGE_DEBOUNCE_MS } from '$lib/drawing/strokeMath';
export const COLOR_CHANGE_DEBOUNCE_SETTLE_MS = COLOR_CHANGE_DEBOUNCE_MS + 50;
```

Gotcha: `engine.ts` touches DOM at module scope in places — verify it imports cleanly under
Playwright's Node transform before choosing it as the export home; `strokeMath.ts` is the safe host
(it is already imported by a spec today).

### [Maintainability] `generate-image.spec.ts` re-declares server policy values (rate limits, upload cap) instead of importing them

**File(s):** `web/tests/generate-image.spec.ts` (lines 19–22, 43–44) @ cd04c367

**Priority:** P2

> **Verified 2026-07-28** — `rateLimitPolicy.ts` is side-effect-free and `admin.spec.ts` line 2
> already imports a server module by relative path, so the proposed import is proven viable. The
> policy mirrors are on lines 19–21, and the upload-cap neighbor is on lines 43–44.

#### Problem

The testing rule says "Parametrized tests import the constant/manifest they exercise — never
re-declare the value." This spec re-declares three server policy values:

```ts
// Mirrors of generateToken / generateByok in src/lib/server/rateLimitPolicy.ts.
const GENERATE_LIMIT = 15;
const BYOK_LIMIT = 30;
```

(lines 19–21), and lines 43–44 hard-code the upload cap's neighbor:

```ts
// 16 MB — just over the 15 MB cap.
const tooBig = Buffer.alloc(16 * 1024 * 1024);
```

where the cap is `MAX_IMAGE_BYTES = 15 * 1024 * 1024` — a module-private const at
`web/src/routes/api/generate-image/+server.ts:25`.

`rateLimitPolicy.ts` is side-effect-free and exports `rateLimitPolicy.generateToken.limit` /
`.generateByok.limit`, and the same spec directory already imports server modules (`admin.spec.ts:2`
imports `SECURITY_HEADERS` from `../src/lib/server/securityHeaders`). If someone tunes a limit, the
burst tests fail with a confusing throttle mismatch instead of tracking the source; the "Mirrors
of…" comment is exactly the prose-sync pattern the conventions ban.

#### Proposed solution

```ts
import { rateLimitPolicy } from '../src/lib/server/rateLimitPolicy';
const GENERATE_LIMIT = rateLimitPolicy.generateToken.limit;
const BYOK_LIMIT = rateLimitPolicy.generateByok.limit;
```

For the upload cap, export `MAX_IMAGE_BYTES` from the `+server.ts` (the server rules already
sanction exporting contract values from `+server.ts` files) and use
`Buffer.alloc(MAX_IMAGE_BYTES + 1)`. Gotcha: confirm the `+server.ts` imports cleanly in the
Playwright Node context (it imports the AI provider seam); if it doesn't, move the cap into a small
`generateImagePolicy.ts` module the route imports.

### [Maintainability] Crayon stage vocabulary triplicated — and the samples.mjs copy already drifted (missing stage 6)

**File(s):** `tools/asset-gen/crayon-brush-samples/samples.mjs` (header lines 1–10, stage arrays
through line 174), `build-sheet.mjs` (`STAGES`, lines 26–57), `README.md` (table lines 16–23) @
cd04c367

**Priority:** P4

#### Problem

The stage list (prefix → name → what it pins down) exists three times: the README table,
`build-sheet.mjs`'s `STAGES` array, and `samples.mjs`'s header comment. The comment has already
drifted — it enumerates stages 1–5:

```js
// Reference sample specs for the crayon brush mode. Grouped in progressive
// stages so the set can be generated and reviewed incrementally:
//   1-  single lines (one crayon stroke per color)
//   …
//   5-  fills & swatches (area coverage, texture at a glance)
```

while the file itself defines `stage6` (macro close-ups, lines 160–172) and exports it in `SAMPLES`
(line 174), and the README/build-sheet both list six stages. This is the exact drift class the root
conventions call out (comments restating facts owned elsewhere; cross-file agreement by prose).

#### Proposed solution

Make `samples.mjs` the single owner: export a `STAGES` array (`[{ prefix, heading, blurb }]`) beside
`SAMPLES`, import it in `build-sheet.mjs`, and cut the header comment's stage enumeration down to
"grouped in progressive stages — see STAGES". The README table stays as human prose but then has one
code source to check against.

### [Maintainability] The supported Node floor (engines 22.13) is never exercised — CI hardcodes Node 24 with no tie to `engines`

**File(s):** `.github/actions/setup-node/action.yml` (line 19); `package.json` (lines 5–7);
`docs/CONTRIBUTING.md` (line 14) @ cd04c367

**Priority:** P3

#### Problem

The Node version is stated independently in at least four places with three different values:

* `package.json` engines: `"node": ">=22.13"` (line 6)
* `.github/actions/setup-node/action.yml`: `node-version: 24` (line 19) — every CI job (quality,
  tests, both deploy smokes, blobs smoke) runs on 24
* `docs/CONTRIBUTING.md` line 14: "**Node 22** via nvm" (22.0 does not satisfy engines). This was
  `README.md` line 39, "Node.js 22+ and npm", at 9ae62ff1; the README's prerequisites moved into the
  contributing guide before f5bf8767 and the version claim moved with them.
* `.codex/cloud/setup.sh`: 22.12 (previous finding)

Meanwhile the production Netlify build pins no `NODE_VERSION` in `netlify.toml`, so it runs
Netlify's platform default (a 22.x LTS). Net effect: **CI validates the whole suite on Node 24, but
the deploy — and the declared minimum — run on 22.x, which CI never touches.** A dependency or
script using an API that exists in 24 but not in 22.13 (the `--experimental-strip-types` behavior
itself differs across these majors) goes green in CI and breaks only at deploy or on a floor-version
dev machine. There is no comment in `action.yml` explaining why 24 was chosen over the floor, and no
drift guard connecting any of these sites — the repo's own convention says cross-file agreement is
kept by an imported constant or a drift-guard test, never prose.

#### Proposed solution

Pick one deliberate policy and encode it:

* Cheapest: point CI at the floor via `node-version-file: package.json` (setup-node resolves
  `engines.node`), so CI always tests the version the repo promises to support, and bumping the
  floor is a one-line `engines` edit. If testing the latest major is also wanted, that's a matrix
  decision worth a comment.
* If staying on a hardcoded 24 (e.g. "test what developers actually run"), add the WHY comment in
  `action.yml` and a drift-guard case in `scripts/tests/workflow-hygiene.test.mjs` asserting
  `node-version` ≥ the `engines` floor, so a future engines bump can't silently overtake CI.

Fix `docs/CONTRIBUTING.md`'s "Node 22" to match `engines` (or reword to "the version in package.json
`engines`" so it can't drift again).

### [Testing] Android minSdk floor ↔ COMPATIBILITY.md agreement is maintained by prose

**File(s):** `android/variables.gradle` (line 2) · `docs/COMPATIBILITY.md` (lines 18, 35–37, 95–99)
· `scripts/tests/android-config.test.mjs` (lines 14–29) @ cd04c367

**Priority:** P4

#### Problem

`docs/COMPATIBILITY.md` names `android/variables.gradle → minSdkVersion` as the authoritative source
of the "Android 7.0 / API 24+" support floor (its lines 18, 35–37, 95–99). The iOS side of the same
table got a real drift guard — `web/src/browserFloor.test.ts` parses `IPHONEOS_DEPLOYMENT_TARGET`
out of the pbxproj and compares it against `BROWSER_TARGETS`. The new
`compatibility-register.test.mjs` validates the separate API risk register's path/marker anchors,
not the platform-floor values. The Android side has no numeric agreement guard:
`scripts/tests/android-config.test.mjs` deliberately scopes its patterns to the *emulator* API level
("the API 24 minSdk floor … don't false-positive", lines 22–24), so nothing fails if
`minSdkVersion = 24` (`variables.gradle:2`) is raised while COMPATIBILITY.md, the store listing
floor, and the Maestro floor-run issues (\#483) still say 24. Per the cross-file-agreement
convention this is exactly the drift-guard-test case.

#### Proposed solution

Add a `describe('Android support floor single source')` block to `android-config.test.mjs`: parse
`minSdkVersion = (\d+)` from `android/variables.gradle`, and assert the contextual "API 24"/"Android
7.0 / API 24+" phrases in `docs/COMPATIBILITY.md` (and `.ruler/skills/mobile/android.md` if it
states the floor) match. Use the same allowlist + context-anchored-pattern approach the file already
established for the emulator level, so historical docs stay exempt.

### [Maintainability] `version.json` boundary string is declared in two places (emitter and fetcher)

**File(s):** `web/vite.config.ts` (`emit-version-json` plugin, lines 69–80) @ cd04c367

**Priority:** P3

#### Problem

The build emits the version endpoint at `vite.config.ts:76` (`fileName: 'version.json'`) and the app
fetches it at `web/src/lib/pwa/updates.ts:144`
(`await fetch('/version.json', { cache: 'no-store' })`). CLAUDE.md's rule for boundary strings —
"declared once, imported everywhere (tests deliberately excepted)" — applies squarely: both sides
are production code, and both *can* share a constant (vite.config.ts already imports sibling TS
modules, and Vite bundles the config with esbuild, so importing a side-effect-free module from
`src/` works). Today a rename on either side deploys cleanly and only fails at runtime as a
silently-dead stuck-client recovery path (updates.ts swallows the failed fetch at lines 154–156 by
design).

#### Proposed solution

Create a tiny constants module, e.g. `web/src/lib/pwa/versionEndpoint.ts` exporting
`export const VERSION_JSON_FILENAME = 'version.json';` (and optionally
`VERSION_JSON_PATH = '/' + VERSION_JSON_FILENAME`). Import it in both `vite.config.ts` and
`updates.ts`. Keep the module side-effect-free (no browser globals at top level) so the node-side
config import stays safe. The `updates.test.ts` literals (lines 132, 140) stay as literals per the
tests exception.

### [Maintainability] ESLint keeps two `no-restricted-imports` blocks in sync by comment instead of a shared constant

**File(s):** `eslint.config.js` (lines 56–72 and 141–169) @ cd04c367

**Priority:** P3

#### Problem

Because flat-config rule entries replace rather than merge, the repo-wide `playwright` import ban
must be restated inside the `web/src` runes-convention block. Today that agreement is maintained by
a pair of warning comments:

```js
// NOTE (flat-config gotcha): a later block that configures
// no-restricted-imports REPLACES this entry — the web/src conventions block below must
// carry the playwright path too.
```

and (lines 142–143) "this block must restate the repo-wide playwright ban from the root block
alongside its own paths." The `paths` entry for `playwright` — name plus message string — is
duplicated verbatim at lines 65–69 and 161–165. CLAUDE.md is explicit that "a 'keep in sync with X'
comment marks a defect, not a mitigation": whoever edits the ban's message (or adds a second
repo-wide banned import) must remember to touch both blocks, and nothing fails if they don't — the
web/src tree silently loses (or diverges from) the repo-wide ban.

The same file has a smaller triplication: the three `rateLimit` `no-restricted-syntax` selectors
(lines 88–100) differ only in `arguments.0.type` (`Literal` / `TemplateLiteral` /
`BinaryExpression`) and repeat the identical message three times.

#### Proposed solution

Hoist the shared entries to module scope and spread them:

```js
const PLAYWRIGHT_IMPORT_BAN = {
  name: 'playwright',
  message: 'Import from @playwright/test — bare playwright is an undeclared transitive dependency.',
};
```

used as `paths: [PLAYWRIGHT_IMPORT_BAN]` in the root block and
`paths: [ {…svelte/store…}, {…onDestroy…}, PLAYWRIGHT_IMPORT_BAN ]` in the web/src block. The
flat-config-replaces gotcha comment stays (it explains WHY the constant appears twice), but the
value itself can no longer fork. For the rateLimit selectors:

```js
const RATE_LIMIT_KEY_ARG_TYPES = ['Literal', 'TemplateLiteral', 'BinaryExpression'];
...RATE_LIMIT_KEY_ARG_TYPES.map((type) => ({
  selector: `CallExpression[callee.name="rateLimit"][arguments.0.type="${type}"]`,
  message: 'Build rate-limit bucket keys via src/lib/server/rateLimitKeys.ts (ADR-0014 shared-bucket contract).',
})),
```

### [Types] playwright.shared.ts config objects bypass excess-property checking when spread

**File(s):** `web/playwright.shared.ts` (`commonPlaywrightConfig` lines 6–11, `commonWebServer`
lines 55–86) @ cd04c367

**Priority:** P3

#### Problem

Both shared objects are plain untyped literals:

```ts
export const commonPlaywrightConfig = {
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  use: { baseURL: playwrightBaseURL },
};
```

They only ever reach Playwright via spreads (`...commonPlaywrightConfig` in
`playwright.config.ts:149` and `playwright.webkit-scratch.config.ts:12`; `...commonWebServer` in the
`webServer` blocks) — and TypeScript's excess-property check does **not** apply to spread-introduced
properties. A typo'd key here (`globalSteup`, `fullyParallell`) compiles clean in every consumer and
is silently ignored by Playwright at runtime — the exact failure mode the repo's "close finite value
sets in the type" convention exists to prevent, and the setup keys govern real behavior (a dropped
`globalSetup` just makes DEV_SERVER runs flaky).

#### Proposed solution

Constrain the declarations at the source with `satisfies`:

```ts
import type { PlaywrightTestConfig } from '@playwright/test';
export const commonPlaywrightConfig = { ... } satisfies PlaywrightTestConfig;
export const commonWebServer = { ... } satisfies Partial<NonNullable<PlaywrightTestConfig['webServer']>> & { url: string };
```

`satisfies` keeps the narrow inferred type (so `use.baseURL` stays a `string` literal type for
consumers) while making unknown keys a compile error.

### [Types] `payloadStore`'s narrowed schema silently mistypes the master-key row — document or restructure the dual-schema trick

**File(s):** `web/src/lib/secureStorage.ts` (`SecureDb`/`SecretPayloadDb` lines 34–46,
`getDb`/`payloadStore` lines 61–62) @ cd04c367

**Priority:** P4

#### Problem

The same IndexedDB store is typed two different ways: `getDb` sees `SecureDb`
(`value: CryptoKey | SecretPayload` — the truth: the store holds both the master key and secret
payloads), while `payloadStore` sees `SecretPayloadDb` (`value: SecretPayload` — a lie for the
`master-key` row):

```ts
const getDb = lazyIdbDatabase<SecureDb>(DB_NAME, STORE);
const payloadStore = idbKvStore<SecretPayloadDb>(DB_NAME, STORE);
```

The narrowing is a type assertion in module form — nothing stops `payloadStore.get(MASTER_KEY_ROW)`
from typechecking as `SecretPayload | undefined` while returning a `CryptoKey` at runtime. Today it
happens to be safe because secret names never collide with `'master-key'` and `webLoad` (lines
128–134) runtime-validates with `isSecretPayload` anyway — but neither the safety argument nor the
reason for two schemas is written down, in a file that otherwise explains every non-obvious decision
at length. Per the conventions, an unvalidated-looking narrow at a non-boundary needs either removal
or a WHY.

#### Proposed solution

Cheapest: a two-line comment on `SecretPayloadDb`/`payloadStore` stating the contract — "same store
as SecureDb, narrowed to the secret rows; safe because the secret name (`API_KEY`) never equals
`MASTER_KEY_ROW`, and webLoad still runtime-validates" — plus noting the payoff (put() through
`payloadStore` cannot write a CryptoKey). Stronger: type `payloadStore` against `SecureDb` and let
`webLoad`'s existing `isSecretPayload` guard do the narrowing; that deletes `SecretPayloadDb`
entirely at the cost of a wider `put` signature. Either resolves the silent mismatch; the comment
route preserves the current (real) typing benefit.

## Documentation that actively misdirects

Not cosmetic doc rot. Each of these is read by an agent or a contributor *as instruction* and sends
them somewhere wrong — a source map behind the code it describes, a retired API contract, a dead
link in every generated tree, prescribed scripts that do not exist.

### [Docs] architecture skill's "file-by-file source map" and route table have drifted well behind `web/src/`

**File(s):** `.ruler/skills/architecture/SKILL.md` (source map lines 62–135, route table lines
147–161, tech-stack lines 18–19 and 55–56, `server/rateLimit.ts` row line 133) @ cd04c367

**Priority:** P2

#### Problem

The skill advertises a "file-by-file source map of web/src/" (description, line 3) and is the
designated navigation reference, but large module families are absent or misdescribed:

* **`lib/drawing/`** — the map (lines 66–90) omits `aiImage.ts`, `aiImageResponse.ts`,
  `earlyBoot.ts` (the ADR-0072 pre-hydration boot the run-splotch skill leans on), `folderSave.ts`
  (named at line 81 as if mapped, but has no row), `magicBrush.ts`, and `perf.ts` (named at line 155
  of the profiling skill as the shared marks flag).
* **`lib/state/`** — omits `aiGeneration.svelte.ts`, `aiKey.ts`, `modal.svelte.ts`,
  `saveFolder.svelte.ts`, `ui.svelte.ts`.
* **`lib/actions/`** — lists only `dragToClear` and `modalDialog` (lines 105–106); missing
  `launchGuard`, `pinchTextZoom`, `pinchZoom`, `pointerCapture`, `scribbleGuard`, `spreadTracker`.
* **`lib/server/`** — the rows at lines 127–133 omit `http.ts` (the shared
  `throttled()`/`readJsonBody` helpers the api skill calls mandatory), `github.ts` (the ADR-0060
  seam), `config.ts`, `generationAuthorization.ts`, `rateLimitKeys.ts`, `rateLimitPolicy.ts`,
  `securityHeaders.ts`, `usage.ts`. The `server/rateLimit.ts` row (line 133) still reads "per-token
  rate limiting for the image generation endpoint" — it is the generic per-key sliding window
  backing seven endpoint policies in `rateLimitPolicy.ts`.
* **`lib/` top level** — no rows for `adminFormat.ts`, `aiCredential.ts`, `apiHeaders.ts`,
  `appVersion.ts`, `devHarness.ts`, `deviceInfo.ts`, `deviceReport.ts`, `errorLog.ts`, `fonts.ts`,
  `haptics.ts`, `idb.ts`, `idle.ts`, `imagePrefetch.ts`, `inviteLink.ts`, `latestRequest.ts`,
  `notchBand.ts`, `palette.ts`, `safeArea.ts`, `storageKeys.ts`, or the `plugins/` facades that
  mobile/native.md describes at length.
* **Route table** (lines 147–161) — missing `/api/report` and `/api/csp-report`, both live routes
  (`web/src/routes/api/report/`, `web/src/routes/api/csp-report/`) fully documented in the api
  skill.
* **Tech stack** — lines 18–19 say Vite "Injects three compile-time constants: `__APP_VERSION__`,
  `__BUILD_TIME__`, `__NATIVE_API_BASE__`"; `web/defines.ts` lines 17–22 define six, and the three
  omitted (`__IS_CAPACITOR__`, `__PERF_MARKS__`, `__DEV_HARNESS__`) include load-bearing gates other
  skills document (the tree-shaking gate in mobile/native.md lines 58–60 and the marks flag in
  profiling lines 152–157). Line 55–56 describes Maestro as "Android smoke test" only; the iOS smoke
  (`npm run test:ios`) has existed since the ios-deploy workflow landed.

An auditor or contributor using this map concludes files don't exist, or places new code where an
unlisted sibling already lives.

#### Proposed solution

Refresh the map against the actual tree (the listing above is the checklist), add the two missing
route rows, fix the `rateLimit.ts` description, say "six compile-time constants" (or name the file
`web/defines.ts` and drop the count per the no-mutable-facts convention), and mention iOS beside
Android in the Maestro bullet. Consider a drift-guard test comparing `ls web/src/lib` module names
against the map's cited paths so the next split fails CI instead of silently rotting — the repo's
own "cross-file agreement is never maintained by prose" convention applied to its own docs.

### [Docs] architecture route table describes generate-image's retired "base64 PNG" contract, contradicting the api skill

**File(s):** `.ruler/skills/architecture/SKILL.md` (line 150) @ cd04c367

**Priority:** P2

#### Problem

The `/api/generate-image` row says:

> Accepts a base64 PNG + style prompt, calls Gemini, returns the generated image.

The api skill (`.ruler/skills/api/SKILL.md` lines 48–65, ADR-0064) documents the current contract
precisely: **raw image bytes as the body** (WebP preferred, `Content-Type` allowlist, style as a
`?style=` query enum, credential in a header), with multipart as a labelled legacy shim. "base64
PNG + style prompt" matches neither the current nor even the legacy multipart shape, and two
generated instruction files now contradict each other on the same endpoint — the exact
"contradictory instructions" failure ruler exists to prevent.

#### Proposed solution

Rewrite the row to defer to the api skill for the contract, e.g.: "Serverless function (Netlify).
Raw drawing bytes in, stylized image out — see the `api` skill for the full contract. Token-gated +
rate-limited. Not bundled for native." Route-table rows shouldn't re-state wire details a sibling
skill owns.

### [Docs] mobile and profiling docs prescribe npm scripts that don't exist (`ios:run:choose`, `ios:run:ipad`, `npm run ios`)

**File(s):** `.ruler/skills/mobile/ios.md` (lines 65, 143),
`.ruler/skills/profiling/ipad-device-profiling.md` (line 605) @ cd04c367

**Priority:** P3

#### Problem

Three commands cited as the way to run the app on iOS hardware are not in `package.json`:

* `ios.md:65` — "or `npm run ios:run:choose` and choose the device at the prompt". No such script;
  the chooser behavior belongs to plain `ios:run` (scripts-info line 305: "prompting to choose the
  iOS simulator or connected device").
* `ios.md:143` — "covers all Debug builds — `ios:run`, `ios:run:ipad`, `cap:ios` Run". No
  `ios:run:ipad`; the real variants are `ios:run:emulator` and `ios:run:device` (package.json lines
  147–148).
* `ipad-device-profiling.md:605` — "Build + run the native app with marks on:
  `PERF_MARKS=true npm run ios`". No `ios` script; should be `ios:run`.

Each fails with `npm error Missing script` at the exact moment a user is mid-runbook with a device
cabled up. The repo's own guidance ("run `npm run info` before guessing at a script") exists because
of this class of drift — the docs shouldn't require it.

#### Proposed solution

Replace with the real script names (`ios:run`; `ios:run:emulator` / `ios:run:device`;
`PERF_MARKS=true npm run ios:run`). A tiny repo-script test that extracts `npm run <name>` tokens
from `.ruler/**` and asserts each (or its namespace prefix) exists in `package.json` scripts would
fence the whole category — this audit found these three by exactly that grep.

### [Docs] `.claude/rules/testing.md` misstates what `npm test` runs (omits `test:scripts`)

**File(s):** `.claude/rules/testing.md` (lines 22–23); `package.json` (line 46) @ cd04c367

**Priority:** P3

#### Problem

The path-scoped testing rule — loaded into context whenever an agent edits any test file — says:

```markdown
* `npm test` = `test:unit` + `test:asset-gen` + `test:e2e`; the native smoke tests (`test:android`,
  `test:ios`) are deliberately excluded (need an emulator/simulator + native toolchain).
```

but `package.json` line 46 is:

```json
"test": "npm run test:unit && npm run test:asset-gen && npm run test:scripts && npm run test:e2e",
```

The `test:scripts` tier (repo-automation tests in `scripts/tests/` — including the very
workflow-hygiene, labels, and claude-permissions tests that guard this section's files) is missing
from the rule. CLAUDE.md's command table has the correct four-tier description, so the two
instruction surfaces disagree, and an agent following the rule may conclude `scripts/tests/` is not
part of `npm test` and skip running it. This is also an instance of the repo's own comment
convention violation: the rule restates a mutable composition owned by `package.json` instead of
naming the owner.

#### Proposed solution

Update line 22 to include `test:scripts` — or better, stop enumerating: "`npm test` runs every CI
tier (see the `test` entry in package.json `scripts-info`); the native smokes (`test:android`,
`test:ios`) are deliberately excluded…". The pointer form can't drift when a fifth tier is added.
`.claude/rules/` is edit-in-place (not ruler-generated), so this is a direct one-file fix.

### [Docs] CONTRIBUTING.md "Release process" predates the three-phase model — it describes exactly the flow ADR-0077 was written to kill

**File(s):** `docs/CONTRIBUTING.md` (lines 226–230) @ cd04c367

**Priority:** P3

#### Problem

The section reads, in full:

```
See the `/release` slash command in `.claude/skills/release/SKILL.md`. The short version:
`npm run release` bumps the version, tags, and pushes; the `android-deploy.yml` CI workflow fires on
the tag.
```

Two problems:

1. **It omits phases 2 and 3.** `docs/adrs/0077-three-phase-release-verified-artifact-publish.md`
   and `releases/README.md:44–54` define shipping as three ordered phases — `/release` → `/build` →
   `/publish-artifacts` (`npm run release` / `android:bundle`+`ios:ipa` / `release:publish`) —
   precisely because the "release does everything" mental model shipped a stale 1.2.0 binary on the
   v1.4.0 GitHub Release. A contributor following CONTRIBUTING's "short version" stops after phase 1
   and leaves the GitHub Release permanently binary-less (`release.mjs` now "attaches nothing,
   unconditionally" per the ADR).
2. **The `android-deploy.yml` mention misleads.** In a section titled "Release process", "the
   `android-deploy.yml` CI workflow fires on the tag" reads as the deployment step. The workflow is
   a tag-gated *Maestro smoke test* ("Runtime smoke test for the Android *deployment*… Tag-only by
   design", `.github/workflows/android-deploy.yml:1–9`) — it deploys nothing; store artifacts are
   built locally by `/build`.

#### Proposed solution

Rewrite the section to mirror `releases/README.md`'s three-phase table (or simply link it as the
authoritative source and keep one sentence: "Shipping is three ordered phases — `/release`,
`/build`, `/publish-artifacts` (ADR-0077); see `releases/README.md`."). If the smoke test stays
mentioned, name it as such: "pushing the `v*` tag also triggers the Android/iOS launch smoke
workflows."

### [Docs] pr-screenshots links ADR-0046 one directory too shallow — dead link in every generated location

**File(s):** `.ruler/skills/pr-screenshots/SKILL.md` (line 22) @ cd04c367

**Priority:** P2

#### Problem

Line 22 links `[ADR-0046](../../docs/adrs/0046-pr-screenshot-hosting-via-orphan-branch.md)`. From
the generated `.claude/skills/pr-screenshots/SKILL.md` this resolves to `.claude/docs/adrs/…`, and
from `.agents/skills/pr-screenshots/` to `.agents/docs/adrs/…` — neither exists. Every other skill
in the tree that reaches the repo root uses three levels (`mobile/android.md:11` →
`../../../docs/COMPATIBILITY.md`, `burn-down-backlog:21` → `../../../.github/labels.yml`), so this
is a one-off typo, but it dead-ends the pointer to the ADR that holds "the full rationale, sources,
and rejected options" the skill explicitly declines to restate inline.

#### Proposed solution

Change to `../../../docs/adrs/0046-pr-screenshot-hosting-via-orphan-branch.md` and run
`npm run ruler:apply`. The relative-link drift-guard test proposed in the audit-conventions finding
would have caught this too.

### [Maintainability] Audit skills link `audit-conventions.md` with a path that is broken in the `.agents/` tree (and inside `.ruler/` itself)

**File(s):** `.ruler/skills/code-audit/SKILL.md` (line 63), `.ruler/skills/extract-audit/SKILL.md`
(line 53), `.ruler/skills/lighthouse-audit/SKILL.md` (line 112),
`.ruler/skills/session-audit/SKILL.md` (line 175), `.ruler/skills/dependency-health-audit/SKILL.md`
(line 229), `.ruler/skills/dependency-update-audit/SKILL.md` (lines 28 vs 125),
`.ruler/skills/workflow-audit/SKILL.md` (line 118) @ cd04c367

**Priority:** P2

#### Problem

Skills are copied verbatim into **both** `.claude/skills/<name>/` and `.agents/skills/<name>/`
(agent-files.md lines 10–11). Six audit skills link the shared conventions as
`[`.claude/audit-conventions.md`](../../audit-conventions.md)`. That relative path only resolves
from `.claude/skills/<name>/`; from `.agents/skills/<name>/` it points at
`.agents/audit-conventions.md`, which does not exist (`.agents/` contains only `skills/` and
`skill-notes/`), and from the `.ruler/` source itself it points at a nonexistent
`.ruler/audit-conventions.md`. A Codex session following the link (the explicitly supported consumer
per ADR-0058 and knowledge-map.md lines 3–5) hits a dead path for the conventions that define the
finding format, the AUDIT-LOG entry, and the self-heal rule.

The correct form already exists in the same tree — `dependency-update-audit/SKILL.md:28` uses
`(../../../.claude/audit-conventions.md)`, which resolves to the repo-root
`.claude/audit-conventions.md` from **both** generated locations — but the same file then uses the
broken `(../../audit-conventions.md)` form at line 125, so even one skill is internally
inconsistent.

#### Proposed solution

Normalize every audit-conventions link in `.ruler/skills/**` to the
`../../../.claude/audit-conventions.md` form (or drop the hyperlink and keep the plain backticked
path, which several skills — `vet-audits`, `fix-audits`, `skills-guide` — already do successfully).
A cheap drift-guard in `scripts/tests/` that resolves every relative markdown link in the generated
`.claude/skills/**` and `.agents/skills/**` and fails on a missing target would catch this whole
class (see also the pr-screenshots and knowledge-map findings below).

## Coverage gaps on load-bearing paths

Kept where the untested surface is one whose silent breakage is expensive and not otherwise
observable.

### [Testing] Run the self-contained API-contract smoke (`test:api:smoke`) in CI

**File(s):** `.github/workflows/test.yml` (`unit` job, lines 125–142; `test` job, lines 149–190);
`package.json` (line 88, scripts-info line 247) @ cd04c367

**Priority:** P2

#### Problem

The repo has a purpose-built, dependency-free gate for the `/api/*` contract:

```json
"test:api:smoke": "node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/api-smoke.mjs",
```

whose own scripts-info description (package.json line 247) says it is "self-contained: boots a
throwaway vite dev with test env, exercises the CORS/preflight contract + the admin auth flow + a
public oracle against the documented /api/* shapes, tears down (no Gemini/Blobs needed)". Nothing in
`.github/workflows/test.yml` runs it — the `unit` job runs `test:unit`, `test:asset-gen`, and
`test:scripts` (lines 125–142), while the sharded `test` job runs `test:e2e` and `test:driver:smoke`
(lines 149–179); no other workflow references `api:smoke`/`api-smoke` (grep of `.github/` returns
nothing). The driver smoke was added to CI at lines 173–179 precisely because "the gen:* generators
… never run elsewhere in CI, so this smoke keeps that module from rotting silently" — the identical
rationale applies to the API smoke, which `.claude/rules/server-api.md` (lines 45–47) relies on
developers remembering to run by hand after endpoint changes. A CORS/auth/shape regression on
`/api/*` currently ships with green CI and is only caught post-deploy by `blobs-smoke.yml` (which
tests one narrow thing: Blobs persistence).

#### Proposed solution

Add a step to the `test` job after the E2E run (it needs no browsers, so placement is flexible):

```yaml
# The /api/* contract (CORS, admin auth, oracle shapes) has no other CI
# coverage; self-contained — boots its own throwaway dev server.
- name: API contract smoke
  run: npm run test:api:smoke
```

Also consider folding it into `npm test` (package.json line 46) so the local composite matches; if
that is done, update the `test` scripts-info entry and CLAUDE.md's command table in `.ruler/` in the
same change. Gotcha: verify the throwaway vite dev server's port doesn't collide with the Playwright
`vite preview` server if steps ever run concurrently (they don't today — steps are sequential).
