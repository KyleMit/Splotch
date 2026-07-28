# Audit comments — Documentation & discoverability

11 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see
the README for what this archive is, the full run table, and the category index.

## PR [\#552](https://github.com/KyleMit/Splotch/pull/552) — Audit burndown: clear the staged docs/AUDIT.md backlog (236 findings) (2026-07-27)

### b49ff0d78a23 — [P3][discoverability] `report.md` files carry no back-reference to their outcome (landed / open issue) or to the live code

**Issue**

`grep -li 'graduated|now live|landed in|promoted to'` across all 25 reports returns nothing. Each
report is a self-contained narrative of what was tried, but has no header line stating the final
disposition — whether it shipped (and where), was superseded, or remains an open `area:asset-gen`
issue. Combined with the stale README (P1), a reader has to reverse-engineer each idea's real-world
status by cross-referencing `bin/`/`lib/` and `docs/gemini-3.1-migration.md` themselves.

**Fix**

Added a one-line `Status:` banner under the title of all 25 `idea-*/report.md` files, with each
disposition derived from HEAD rather than guessed: LANDED lines name the script/doc that actually
exists (e.g. `bin/audit-night-halo.mjs`, `lib/page-notes.mjs`, `NIGHT_BG_LUMA_MAX_DEFAULT = 60`, the
proof sheet's `--source git:<ref>`), NOT PROMOTED lines name what superseded the approach (mostly
the 3.1 model swap and `docs/fresh-outline-regen.md`), and every referenced path was verified
present. `gh` is blocked in this sandbox, so the five still-open ideas (3, 8, 9, 14, 18) read
`Status: OPEN — … remains an area:asset-gen backlog item` with the HEAD evidence of absence instead
of an invented `#NNN`.

*Revised before approval:* Addressed all three review points on e44fafbe7759. idea-4's banner is now
NOT PROMOTED — neither proposal (deterministic sky normalizer, ≤50 gate) shipped, with the bgLuma
18–48 narrowing credited to the 3.1 wave and the 60 default stated as the current gate rather than
as this idea's outcome. idea-14's banner no longer contradicts pipeline.md: it now says the shipped
worst-tile keep gate (≥ 80%) is too coarse to flag local warp, matching the report's own finding
that the gate averaged the star-tall warp away. The five OPEN banners (3, 8, 9, 14, 18) drop the
"remains an area:asset-gen backlog item" claim; gh is blocked in this sandbox so real issue numbers
were unobtainable, and I took the reviewer's drop option rather than invent them — each banner still
cites HEAD evidence for why it is open. Re-verified 25 files with exactly one `^Status:` line each,
every referenced path present at HEAD, and dprint format:check clean.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `idea-4/report.md:3` — the banner labels the idea LANDED and credits
  `NIGHT_BG_LUMA_MAX_DEFAULT = 60` to it, but that constant's own comment in
  `tools/asset-gen/lib/night-scores.mjs:40` attributes it to the 3.1-migration bar, and the report's
  proposals (deterministic post-normalization, and a tightened ≤50 gate) both went unshipped;
  relabel as NOT PROMOTED, noting the 3.1 wave narrowed the spread (18–48,
  `docs/gemini-3.1-migration.md:24`) and the gate default now sits at 60.
* `idea-14/report.md:3` — "the registration gates still catch only global shifts
  (`../../docs/pipeline.md`)" is contradicted by the cited doc (`docs/pipeline.md:100`, worst-tile
  keep ≥ 80%) and by the report's own line 84, which says the shipped worst-tile gate saw the warp
  and averaged it away; reword to say the existing worst-tile keep gate is too coarse to flag local
  warp.
* The five OPEN banners (idea-3, idea-8, idea-9, idea-14, idea-18 `report.md` line 3) assert
  "remains an `area:asset-gen` backlog item" without the `#NNN` the finding's format calls for,
  leaving the reader unable to reach the tracked item — cite the actual issue number for each, or
  drop the claim where no issue exists.

**Supervisor note** — a fix that writes 25 status banners is really 25 factual claims, and the
reviewer treated it that way. Its first two catches are the machine attributing outcomes to the
wrong cause: idea-4 was labelled LANDED and credited with a constant whose *own source comment*
attributes it to the 3.1 migration, and idea-14's banner contradicted the very doc it cited. Both
would have been plausible-sounding provenance baked permanently into a frozen archive — the kind of
error that gets cited later as fact.

Equally worth noting is what the implementer refused to do. `gh` is unavailable in the sandbox, so
the issue numbers the finding's format asked for were unobtainable; rather than invent
plausible-looking `#NNN` references, it took the reviewer's explicit drop option and cited HEAD
evidence of absence instead. Fabricated cross-references would have passed every gate and every
future reader.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5087763156) · 2026-07-27
05:54:50 UTC</sub>

## PR [\#561](https://github.com/KyleMit/Splotch/pull/561) — Burn down 114 staged audit findings (2026-07-27)

### 93887e18dcf7 — [P3][documentation] Stale/incorrect comment: `vitest-setup.ts` says "jsdom" but the environment is happy-dom

**Issue**

```ts
// The storage + state layers gate browser-only work behind `browser` from
// `$app/environment`. Under vitest (jsdom) we always want the browser code
```

The Vitest environment is `happy-dom` (`vitest.config.ts:21`), and both `.claude/rules/testing.md`
and ADR-0009 explicitly state the suite uses happy-dom, "not jsdom." A newcomer reading this setup
file is told the wrong DOM implementation — exactly the sort of detail (happy-dom vs jsdom API gaps)
that matters when debugging a test-only DOM failure.

**Fix**

Updated the Vitest setup comment to correctly identify `happy-dom`, matching the active test
environment while leaving the `$app/environment` mock unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5095463092) · 2026-07-27
18:51:53 UTC</sub>

### 8c21ede19cdd — [P4][documentation] Undocumented magic values in the PWA/webServer config (networkTimeoutSeconds, timeout, BUILD_TIME slice)

**Issue**

Several load-bearing numbers have no WHY comment, which is exactly the case the project convention
says warrants one:

* `web/vite.config.ts:137` `networkTimeoutSeconds: 5` — the NetworkFirst fallback window for
  navigation requests; nothing explains why 5s (vs the child waiting on a stalled network).
* `web/vite.config.ts:27` `new Date().toISOString().slice(0, 16)` — `16` is the magic length that
  trims to `YYYY-MM-DDTHH:MM`; the comment above explains BUILD_TIME's purpose but not the slice.
* `web/playwright.config.ts:104` `timeout: 180_000` — the webServer boot budget (build + preview);
  no rationale for 3 minutes, and it's duplicated in the scratch config.

**Fix**

Clarified the intentional minute-resolution build timestamp and cached-page fallback for stalled
navigation. Named the shared production build-and-preview startup allowance so its three-minute
budget remains explicit.

*Revised before approval:* Qualified the stalled-navigation explanation so the five-second fallback
is stated to apply only when Workbox has a cached page available.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/vite.config.ts:147` incorrectly states that stalled navigations use the cached page after
  five seconds; Workbox continues waiting for the network on a cache miss, so qualify the fallback
  as applying only when a cached page exists.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5095463833) · 2026-07-27
18:51:57 UTC</sub>

### a7d1e5ed03e1 — [P4][documentation] Temporal wording in config comments will age ("now", "is now TypeScript")

**Issue**

```jsonc
// All of src/ is now TypeScript. Config files ... are unaffected by this.  (tsconfig.json:5)
```

Comments phrased as "now" / "is now" describe a transition rather than a stable state; a year on,
"now" is meaningless and the reader can't tell whether it still holds. The tsconfig comment's real
intent is "`allowJs: false` — src is TS-only." Similar transitional phrasing appears in the version
comment block.

**Fix**

Reworded the TypeScript-only policy comment to describe the lasting rule and its exemption for root
configuration and build scripts, without changing compiler options.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5095673448) · 2026-07-27
19:12:59 UTC</sub>

### 7bfaceba9329 — [P5][documentation] Misleading "matching PORT above" comment on the Playwright webServer

**Issue**

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

**Fix**

Removed the misleading Vite default-port claim from the Playwright server comment while preserving
the production-artifact and dev-harness guidance.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5095674226) · 2026-07-27
19:13:04 UTC</sub>

### b4546be7e915 — [P5][documentation] `ExportOptions.plist` lacks a pointer to who consumes it and when teamID matters

**Issue**

The file carries a commented-out `teamID` block with decent inline guidance, but nothing says which
command consumes `ExportOptions.plist` (`xcodebuild -exportArchive` / the `build` skill's IPA lane)
or that `method = app-store-connect` requires an authenticated App Store Connect session. A newcomer
finds a bare plist with no breadcrumb to the release flow it belongs to. The commented `teamID` also
duplicates a value that, if ever needed, would then live here *and* in signing config.

**Fix**

Added a root-dictionary breadcrumb identifying `npm run ios:ipa` / `xcodebuild -exportArchive` as
this plist’s consumer and directing release work to the iOS checklist. All existing export settings
and optional `teamID` guidance remain unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor follow-up:** changed the release-checklist breadcrumb from Codex's generated `.agents`
copy to the shared `.ruler` source of truth in 14c0da79.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5096619534) · 2026-07-27
20:44:30 UTC</sub>

### 1f5b18c543e8 — [P4][documentation] `Read(//tmp/**)` uses non-obvious double-slash absolute-path syntax with no explanation

**Issue**

```json
"Read(//tmp/**)"
```

The leading `//` is Claude Code's syntax for a filesystem-absolute path (so this grants reads under
`/tmp`, where the session scratchpad lives), but it reads like a typo (`/tmp` double-slashed) to
anyone not steeped in the permission grammar. A reviewer could "fix" it to `/tmp/**` and change its
meaning. It's the only absolute-path entry in the file and carries no context.

**Fix**

Documented that Claude Code’s double-slash permission is intentionally absolute for session scratch
files under `/tmp`, preserving the distinction from project-relative syntax.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097212711) · 2026-07-27
21:52:13 UTC</sub>

### 6f53d8e6066c — [P4][documentation] `session-start.sh` and `cloud-branch-preview.sh` aren't discoverable from the primary config/instruction files

**Issue**

CLAUDE.md documents the PostToolUse `format-edited-file.sh` hook by name but never mentions the two
SessionStart hooks. They are described in `docs/CLOUD/Claude.md`, but a contributor reading the main
instructions or `settings.json` has no in-place signal that two scripts run at every session start
(one of which injects a whole workflow prompt into context). The `settings.json` registration is
just two bare command paths (lines 19, 23) with no comment (JSON limitation).

**Fix**

Added cloud SessionStart hook guidance to the primary instructions, identifying their remote-only
guard and linking readers to the detailed cloud workflow documentation.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097382110) · 2026-07-27
22:13:41 UTC</sub>

### bedfa56f4595 — [P3][discoverability] README omits the `crayon-brush-samples` collection and how it's regenerated

**Issue**

The README's "Live URLs" section calls out how to regenerate the coloring-book proof sheets, the
icon gallery, and the model-eval report, but never mentions the `crayon-brush-samples/` collection —
even though it is a committed top-level collection with its own generators
(`tools/asset-gen/crayon-brush-samples/build-sheet.mjs` → `index.html`, `build-compare-sheet.mjs` →
`vs-current.html`). A newcomer who opens `scrapbook/crayon-brush-samples/` in the tree has, unlike
every other collection, no in-`scrapbook` pointer to what produced it or how to refresh it.

**Fix**

Documented the live crayon-brush reference collection and linked its regeneration guide. The README
now distinguishes the reference contact-sheet builder from the shipping-brush comparison builder.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5098411699) · 2026-07-28
00:30:05 UTC</sub>

## PR [\#583](https://github.com/KyleMit/Splotch/pull/583) — Burn down staged audit findings with Codex (2026-07-28)

### 3ea6bd1ab737 — [P1][discoverability] README scoreboard and "do first" list are stale — most ideas already graduated into the live pipeline, but nothing here says so

**Issue**

The ideas-exploration README presents all 25 ideas as an open backlog "intended for a follow-up
session to review and decide what to promote," with a prioritized "do first" list of patches to
land. That follow-up already happened — most ideas shipped into `bin/`/`lib/` or were closed by the
gemini-3.1 regeneration wave — so a newcomer reading the README would re-do finished work.

**State at triage (2026-07-27):** The finding still holds at HEAD, but the ground shifted materially
since f934d43:

* Commits e44fafb and b49ff0d (2026-07-27) added a curated `Status:` disposition line to the top of
  **every** `idea-N/report.md` — a three-value vocabulary of **LANDED** (13: ideas 2, 7, 10, 11, 12,
  …

**Fix**

Updated the exploration record with authoritative current statuses, promotion counts, report
pointers, and a concise retrospective. Updated the Ruler source so generated orientation docs direct
readers to the status lines and scoreboard.

*Revised before approval:* Regenerated both checked-in asset-generation orientations from the
updated `.ruler` source so they now direct readers to report statuses and the README scoreboard.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The `.ruler` source was updated, but the checked-in generated orientations were not:
  `tools/asset-gen/AGENTS.md:128` and `tools/asset-gen/CLAUDE.md:126` still say finished
  patches/assets are waiting to be promoted. Run the repository’s ruler workflow and commit both
  regenerated files.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5100497543) · 2026-07-28
05:55:33 UTC</sub>

## PR [\#589](https://github.com/KyleMit/Splotch/pull/589) — Drain audit-deferred decision docs: implement the triaged fixes (2026-07-28)

### Finding 11 of 15 — `android:allowBackup="true"` unexplained for a kids app — ✅ FIXED

**Decision doc:** `android-allowbackup.md` (verdict FIX) · **Priority:** P4

#### What changed

* `android/app/src/main/AndroidManifest.xml` — `android:allowBackup` flips `true` → `false` with a
  WHY comment: drawings migrate via the photo gallery (MediaStore, outside app-private data),
  Keystore-bound secure-storage secrets can't restore onto another device anyway, and the plaintext
  AI access token must not be copied into cloud backups. No
  `fullBackupContent`/`dataExtractionRules` added — per the doc, plain `false` covers minSdk 24
  through target 36 when nothing is worth selectively keeping.
* `.ruler/skills/mobile/android.md` (+ regenerated `.claude`/`.agents` mirrors) — the decision is
  recorded as a checked **Backups disabled** item in the mobile skill's Families-policy (kids
  compliance) checklist.

#### Adversarial review

Independent reviewer with no implementer context: **APPROVE.** Notably, it fact-checked every claim
in the manifest comment against the actual codebase rather than taking the rationale on faith:
gallery saves via `@capacitor-community/media` confirmed in `screenshot.ts`, Keystore binding
confirmed in `secureStorage.ts`, the AI access token confirmed as a real credential sent to the
hosted API and mirrored into SharedPreferences, and the IndexedDB save path confirmed web-only.
Mirrors verified byte-identical, reproducibly regenerated by ruler (the prior burndown attempt's
only failure was environmental — its sandbox couldn't write the `.agents/` copy). One wording nit
taken before commit: the comment's closing sentence tightened from "Child data never leaves the
device" to "No child data leaves the device via backup", since the AI button and gallery saves are
documented, deliberate egress paths elsewhere in the same manifest.

#### Verification

Manifest well-formed per xmllint · `ruler:check` in sync · `format:check` clean. The doc's on-device
`bmgr backupnow` check isn't runnable in this sandbox (no Android toolchain/device) — manifest
change verified by inspection, as the doc anticipated.

#### Drained

Deleted `docs/audit-deferred/decisions/android-allowbackup.md` (this finding had no draft patch).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/589#issuecomment-5103719432) · 2026-07-28
11:46:19 UTC</sub>
