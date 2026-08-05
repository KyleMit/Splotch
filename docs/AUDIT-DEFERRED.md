# Audit — deferred findings

> Findings the scripted audit burndown (the `burn-down-audits` skill) moved aside instead of fixing
> — the verifier was unavailable, the implementation failed, or the change never passed adversarial
> review. Each needs human triage: re-stage it in `docs/AUDIT.md`, file it as an issue, or drop it.

The 2026-07-27 triage pass reviewed the 49 findings deferred up to that date and drained them from
this file: 30 FIX verdicts were re-staged in `docs/AUDIT.md` with resolution guidance, 9 OPTIONS
verdicts became `type:audit` + `needs-triage` GitHub issues (564-572), and 10 DROP verdicts were
retired with rationale. The disposition index (`docs/audit-deferred/triage/README.md`) and full
original texts remain in this file's git history — the triage directory was removed once every
verdict was dispatched.

The 2026-07-28 triage pass reviewed the 15 findings that arrived after that pass and drained them
too: 13 FIX and 2 DROP verdicts, each recorded as a standing decision doc in
`docs/audit-deferred/decisions/` (see its `README.md` for the verdict index and per-finding
rationale). Full original finding texts remain in this file's git history at commit 5b16292; the
rolled-back draft patches under `docs/audit-deferred/*.patch` are kept where a decision doc cites
them as reusable raw material.

Entries below arrived after those passes and are awaiting triage.

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

#### Why it was deferred

implementation failed

#### What was tried

Removed the personal device scripts and updated the authoritative mobile guidance, but the sandbox
denied writes to the tracked `.agents/skills/mobile` mirrors during `ruler:apply`. Those generated
files remain stale, so the full change cannot be delivered safely from this runner.

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

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `docs/DEPENDENCIES.md:29,109,175-190` still claims `@capacitor/filesystem` is installed, used by
  `folderSave.ts`, and should be kept; remove/update those stale inventory entries and the “already
  a dep” alternative.
* The changed Android and iOS native registrations are not covered by the verifier’s web type/unit
  gates; run the original finding’s `npm run test:android:device` smoke verification before
  approval.

#### What was tried

Removed the unused Capacitor filesystem dependency and its sole transitive package, then regenerated
Android and iOS registrations so the plugin is no longer bundled. The media plugin and all other
native registrations remain unchanged.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p3-dependency-split-capacitor-filesystem-appears-unused-no-js-import-any.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p3-dependency-split-capacitor-filesystem-appears-unused-no-js-import-any.patch`.

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

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `web/netlify.toml:26` still hard-codes `targetPort = 5173`, so changing `VITE_DEV_PORT` breaks
  `npm run dev:netlify` by sending its proxy to the old port; make this active config consume the
  centralized value as well.
* `.ruler/skills/mobile/android.md:118` still tells contributors that port 5173 is pinned in
  `web/vite.config.ts`, which is no longer the source of truth; update the generated skill source
  documentation to point to `scripts/lib/dev-ports.mjs` and regenerate its outputs.

#### What was tried

Centralized the Vite dev, Netlify-dev, and Vite preview ports in one ESM module. All executable
consumers now use the shared constants while preserving existing commands, overrides, and forwarding
behavior.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p3-maintainability-dev-preview-port-numbers-are-magic-values-scattered-a.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p3-maintainability-dev-preview-port-numbers-are-magic-values-scattered-a.patch`.

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

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `.prettierrc.json`, `dprint.json`, and `.vscode/settings.json` do not reference `.editorconfig` as
  the canonical source, so this change merely adds a fourth independent copy of the `2`/`100` values
  and leaves the original lockstep-maintenance problem unresolved.

#### What was tried

Added root EditorConfig defaults so EditorConfig-aware editors inherit the repository’s shared
spacing, line length, encoding, and final-newline preferences without formatter extensions.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p4-consistency-no-editorconfig-indent-width-2-and-print-width-100-are-re.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p4-consistency-no-editorconfig-indent-width-2-and-print-width-100-are-re.patch`.

### [Tooling] Make the session-audit conventions link resolve for Codex

**File(s):** `.ruler/skills/session-audit/SKILL.md` (shared conventions link),
`.agents/skills/session-audit/SKILL.md`

#### Problem

**Cost:** minor

The generated Codex skill links to `[.claude/audit-conventions.md](../../audit-conventions.md)`.
From `.agents/skills/session-audit/SKILL.md`, that relative target resolves to
`.agents/audit-conventions.md`, which does not exist. During this session the prescribed
`sed -n '1,320p' .agents/audit-conventions.md` read failed, and repository orientation had to be
used to recover the real `.claude/audit-conventions.md` path. Every Codex session that runs this
skill encounters the same broken reference.

#### Proposed solution

Change the shared source link in `.ruler/skills/session-audit/SKILL.md` to the provider-neutral
`../../../.claude/audit-conventions.md`, then run `npm run ruler:apply`. From both generated skill
locations, that path resolves to the repository's one directly maintained conventions file.

#### Verification

Run `npm run ruler:check`, then resolve the link from both `.agents/skills/session-audit/SKILL.md`
and `.claude/skills/session-audit/SKILL.md`; each should identify the existing
`.claude/audit-conventions.md` without a fallback lookup.

---

#### Why it was deferred

implementation failed

#### What was tried

Updated the shared source and generated Claude copy, but `npm run ruler:apply` could not write the
protected `.agents` tree in this nested sandbox. The Codex generated copy therefore remains stale,
so the full brief cannot be delivered here.

### [P5][type-safety] `AiImageResult` casts in event handlers

**File(s):** `web/src/lib/components/AiImageResult.svelte:42` — pinned at SHA f934d43

#### Problem

`handleImgLoad` does `const { naturalWidth: w, naturalHeight: h } = e.target as HTMLImageElement;`.
The cast is safe today (the handler is only wired to an `<img onload>`), but `as` bypasses the
checker and would silently mis-type if the handler were ever reused on a different element. Minor.

**State at triage (2026-07-27):** Still present, now at
`web/src/lib/components/AiImageResult.svelte:46-49`. The component was refactored since the pin
(constants hoisted, `closeAiResult` moved to `aiGeneration.svelte`), but the handler body is
unchanged and this is the component's only cast — `handleAnimationEnd` compares
`e.target === dialogEl` without one. The handler is bound once, on the hidden `.stage-sizer` img
(line 146).

#### Proposed solution

**FIX — clear winner.** Type the handler's `currentTarget` and drop the `as` cast.

```ts
function handleImgLoad(e: Event & { currentTarget: HTMLImageElement }) {
  const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
  if (w > 0 && h > 0) imgAspect = w / h;
}
```

`onload={handleImgLoad}` type-checks unchanged. Verify with `npm run check` and by opening an AI
result — the stage must still size to the loaded image's aspect.

**Alternatives weighed:** * **Typed `currentTarget` on the named handler (winner).** Svelte types an
`<img>`'s `onload` as `EventHandler<Event, HTMLImageElement>`, i.e. the event's `currentTarget` is
already `HTMLImageElement`. Declaring the parameter to match keeps the named handler, removes the
cast, and makes any future rebinding onto a non-img element a compile error. `load` doesn't bubble,
so `target` → `currentTarget` is behavior-identical here.

* **Inline arrow at the binding site** (`onload={(e) => handleImgLoad(e.currentTarget)}` with
  `handleImgLoad(img: HTMLImageElement)`). Equivalent safety, slightly more indirection in the
  template. Fine, but no advantage over the first.
* **Leave it.** Defensible for a P5 — the cast is provably safe today. But the fix is one line,
  strictly stronger, and removes an `as` that invites copy-paste into places where it isn't safe.

**Landing note:** Re-stage in `docs/AUDIT.md` as-is (updated line number 46), or fold into any
nearby edit to the component — it's a one-line change not worth its own PR.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

#### Why it was deferred

implementation failed

#### What was tried

The requested signature is not assignable to this Svelte version’s generic `onload` handler type, so
`npm run check` fails at the unchanged binding. I implemented the brief exactly and left the
worktree change in place, but cannot reach all required gates without changing the binding or
widening the handler type.

### [P1][duplication] Extract a shared segmented-control primitive — it now exists three times with drift

**File(s):** `web/src/lib/components/settings/AppearanceSection.svelte:32-47,92-138` ·
`web/src/lib/components/SettingsModal.svelte:222-238,443-490` ·
`web/src/lib/components/settings/ReportForm.svelte:112-125,233-267` — pinned at SHA f934d43

#### Problem

Three near-identical "iOS-style segmented control" implementations exist (theme picker, orientation
selector, report-kind picker), and the comments admit the copy-paste ("matching the Theme picker",
"mirrors the Appearance theme picker"). They have drifted: container radius `var(--radius-md)` vs
raw `10px`, option radius `9px` vs `var(--radius-sm)` vs `7px`, raised-card vs brand-fill active
treatment, `var(--font-size-sm)` vs raw `12.5px`. Proposed a `Segmented.svelte` primitive with
`options`/`selected`/`onSelect`, a `raised`/`filled` variant, and an allow-deselect flag.

**State at triage (2026-07-27):** Still three sites, still drifted — the finding fully holds, with
two updates since f934d43:

* **The orientation selector moved.** SettingsModal's compact layout was extracted into
  `web/src/lib/components/settings/CompactShell.svelte`; the `.orient-seg` control now lives there
  (markup 97-111, styles 162-219), comment still saying "matching the Theme picker in
  AppearanceSection". It also gained real deselect behavior: tapping the active side releases the
  rotation lock (`CompactShell.svelte:46-55`), so the `allowDeselect`/toggle mode is now a hard
  requirement, not a nicety.
* **One axis of drift was fixed by a token.** Both raised sites now share `--shadow-segment`
  (`web/src/lib/design/tokens.ts:101-104`, with a don't-converge comment), replacing the raw
  `box-shadow` the finding cited.

The remaining drift, verified at HEAD:

| Axis             | Theme (`AppearanceSection:93-139`) | Orientation (`CompactShell:169-219`) | Report-kind (`ReportForm:235-270`) |
| ---------------- | ---------------------------------- | ------------------------------------ | ---------------------------------- |
| Container radius | `var(--radius-md)`                 | raw `10px`                           | raw `10px`                         |
| Option radius    | raw `9px`                          | `var(--radius-sm)`                   | raw `7px`                          |
| Track            | `var(--slider-track)`              | `var(--slider-track)`                | `var(--surface)` + 1px `--border`  |
| Active           | surface card + `--shadow-segment`  | surface card + `--shadow-segment`    | `--brand` fill                     |
| Font             | `var(--font-size-sm)`              | raw `12.5px`                         | `var(--font-size-sm)`              |
| ARIA             | radiogroup/radio                   | group + `aria-pressed`               | radiogroup/radio                   |

`web/src/lib/components/design/` still holds only `Button`, `Disclosure`, `StatusMessage` — no
Segmented primitive exists.

#### Proposed solution

**FIX — clear winner.** Extract `web/src/lib/components/design/Segmented.svelte` beside
`Button.svelte`, styled once from tokens, with a `variant` for the active treatment and a `mode`
prop carrying the ARIA decision from the sibling entry "Two identical segmented controls use
inconsistent ARIA semantics". The design skill's own rule — "Extract a new primitive at the third
duplicate" — was written for exactly this case, and its Button table already names these three
controls as the pickers Button must not absorb.

Add `web/src/lib/components/design/Segmented.svelte`:

```svelte
<script lang="ts">
  let {
    options, // { value: string; label: string; icon?: CommonIconName; id?: string }[]
    selected, // string | null (null only meaningful in mode 'toggle')
    onSelect, // (value: string) => void — toggle mode call sites handle deselect themselves
    label, // aria-label for the container
    variant = 'raised', // 'raised' (theme, orientation) | 'filled' (report-kind)
    mode = 'radio', // 'radio' | 'toggle' — see the ARIA sibling entry
  } = $props();
</script>
```

Style once from tokens: `--slider-track` track, `--radius-md` container, `--radius-sm` options,
`--shadow-segment` on the raised active card, `--font-size-sm`, `--duration-fast` transitions, and
always `type="button"` (the theme picker currently omits it). `variant="filled"` changes only the
active treatment to `--brand`/`--on-brand`.

Deliberate normalizations to review in `/dev/design` and PR screenshots (per the `pr-screenshots`
skill), all nudges onto the token ramp: option radius 9px/7px → 8px, container 10px → 12px on two
sites, orientation font 12.5px → 13px, and the report-kind track converges from `--surface`+border
to `--slider-track` (the one visible change; convergence is the point of the primitive — if the
maintainer wants to keep the bordered look, it can ride the `filled` variant instead, but the lean
is full convergence). Don't pre-build a `size` prop for CompactShell's slightly tighter padding;
only add one if the normalized control breaks the 2×2 grid height.

Register the primitive in `/dev/design` and in the design skill's primitives table — edited at its
source `.ruler/skills/design/SKILL.md` (then `npm run ruler:apply`), never the generated copy — and
update Button's "not for pickers" row to point at Segmented.

**Alternatives weighed:** 1. **Extract a `Segmented.svelte` primitive (winner).** One
implementation, token-styled, fixes the keyboard/ARIA gaps (p4) in one place. Pros: kills the drift
permanently; three call sites shrink to a few lines each; the skill's third-duplicate rule and its
Button carve-out both point here. Cons: small visual normalization to review (below). 2. **Hoist
shared rules to `app.css` classes** (the `.flyout-menu` route). Rejected: the skill reserves that
for unscoped/imperative-DOM needs or canvas chrome that "hasn't earned a primitive yet" — these are
three structurally identical, component-scoped pickers on modal surfaces, and a class can't carry
the roving-tabindex behavior p4 requires. 3. **Leave as-is.** Rejected: the drift the shared-styling
comment was supposed to prevent has already happened, and a fourth copy is likely (any future
single-select setting).

**Landing note:** Re-stage in docs/AUDIT.md (or file as a `type:audit` issue) with the updated
file/line references above — SettingsModal citations are stale, the control is in
`CompactShell.svelte` now. Implement together with the sibling entry "Two identical segmented
controls use inconsistent ARIA semantics" (the `mode` prop is its decision); the sibling
`.setting + .setting` spacing entry is independent and can land separately.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

#### Why it was deferred

implementation failed

#### What was tried

Implemented the typed Segmented primitive and migrated all three pickers with preserved semantics,
normalized token styling, and design-gallery/docs registration. The required Codex skill mirror
remains incomplete because this sandbox denies writes to `.agents/skills`; the source and Claude
mirror updated, but `.agents/skills/design/SKILL.md` is stale.

### [P4][accessibility] Two identical segmented controls use inconsistent ARIA semantics (radiogroup vs group/pressed)

**File(s):** `web/src/lib/components/settings/AppearanceSection.svelte:32-45` (radiogroup/radio) ·
`web/src/lib/components/SettingsModal.svelte:223-237` (group + aria-pressed) — pinned at SHA f934d43

#### Problem

The theme picker exposes `role="radiogroup"` with `role="radio"`/`aria-checked` children while the
visually identical orientation selector uses `role="group"` with `aria-pressed` toggle buttons (the
report-kind picker is radiogroup again). Screen-reader users get inconsistent announcements for the
same idiom, and neither radiogroup implements the roving-tabindex/arrow-key navigation the role
implies. Whichever pattern the Segmented primitive standardizes on must be chosen deliberately —
proposed encoding the choice as a `mode: 'radio' | 'toggle'` prop.

**State at triage (2026-07-27):** The split persists, one file moved: the theme picker is unchanged
(`AppearanceSection.svelte:33-45`, radiogroup/radio/`aria-checked`); the orientation selector now
lives in `web/src/lib/components/settings/CompactShell.svelte:97-110` (`role="group"` +
`aria-pressed`); the report-kind picker is radiogroup/radio (`ReportForm.svelte:115-127`). Neither
radiogroup implements roving tabindex or arrow keys — every segment is a tab stop, so the role
promises keyboard behavior it doesn't deliver (an APG-pattern violation, not just inconsistency).

One material change strengthens the split-mode decision: the orientation control is now genuinely
deselectable — tapping the active side releases the rotation lock back to free rotation
(`CompactShell.svelte:46-55`), and a null selection ("neither locked") is a designed resting state.

#### Proposed solution

**FIX — clear winner.** The Segmented primitive (see the sibling entry "Extract a shared
segmented-control primitive") standardizes on **`radiogroup`/`radio` with roving tabindex and
arrow-key selection for mandatory single-select** (`mode: 'radio'` — theme picker, report-kind
picker), and **`role="group"` of `aria-pressed` toggle buttons for the deselectable case**
(`mode: 'toggle'` — the orientation pair). This finding is a design input to p1, not a separate
change; implement them together.

Encode the decision in the primitive's `mode` prop, per the sketch in the sibling
segmented-control-primitive entry:

* `mode: 'radio'` (theme, report-kind): container `role="radiogroup"` + `aria-label`; options
  `role="radio"`, `aria-checked`, roving `tabindex` (selected option — or first, when none — is `0`,
  the rest `-1`), ArrowLeft/Up and ArrowRight/Down move focus *and* selection with wrap, matching
  the APG radio-group pattern.
* `mode: 'toggle'` (orientation): container `role="group"` + `aria-label`; options are plain buttons
  with `aria-pressed`, all tabbable, no arrow-key handling. The call site keeps its
  deselect-on-reselect logic.

Do not fix the ARIA in place ahead of the extraction — patching roving tabindex into two bespoke
copies is throwaway work that p1 deletes.

**Alternatives weighed:** 1. **Radio for mandatory single-select, toggle for deselectable
(winner).** Matches WAI-ARIA APG guidance: the radio-group pattern is the canonical "choose exactly
one of a set" idiom — it announces position/set-size and checked state, and requires roving tabindex
(one tab stop; arrow keys move and select), which the primitive implements once. The orientation
pair cannot honestly be a radiogroup: clicking a checked radio never unchecks it, but tapping the
active orientation segment must release the lock, and "no segment active" is a legitimate persistent
state — that is two independent-ish toggle buttons (`aria-pressed`), grouped and labeled. Two of
three sites already use radio semantics, so this is also the smallest migration. 2. **`aria-pressed`
toggles everywhere.** Simpler (no roving tabindex; every segment tabbable). Rejected: "pressed"
misdescribes a mandatory pick-one set — a screen-reader user hears independent toggle buttons with
no one-of-N framing, and mutually exclusive auto-unpressing buttons are exactly the confusion the
radio pattern exists to avoid. 3. **`role="tablist"`.** Rejected: tabs switch visible panels; the
theme and report-kind pickers select a value, not a panel (the report form's textarea label changes,
but the control's meaning is a value choice). Misusing tablist would promise panel semantics that
don't exist.

**Landing note:** Fold into the p1 re-staged finding (or `type:audit` issue) as its ARIA/keyboard
acceptance criteria rather than filing separately — the decision here has no standalone
implementation.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `.agents/skills/design/SKILL.md:71` remains stale and omits the new `Segmented.svelte` primitive,
  while the `.ruler` source and Claude-generated copy were updated. Regenerate the provider outputs
  from `.ruler` so the Codex design skill matches its source.

#### What was tried

Introduced a shared segmented picker that provides roving keyboard radio behavior while preserving
the orientation selector’s pressed-toggle semantics. Updated Settings interaction coverage and
registered the new primitive in the design reference and styleguide.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p4-accessibility-two-identical-segmented-controls-use-inconsistent-aria.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p4-accessibility-two-identical-segmented-controls-use-inconsistent-aria.patch`.

### [P1][duplication] White/dark ink keyline CSS is triplicated across ActionsPanel, BrushMenu, and StrokeWidthMenu

**File(s):** `web/src/lib/components/ActionsPanel.svelte:772-787`,
`web/src/lib/components/BrushMenu.svelte:155-170`,
`web/src/lib/components/StrokeWidthMenu.svelte:175-190` — pinned at SHA f934d43

#### Problem

The four-declaration keyline trick (`stroke` + `stroke-width: 2px` + `paint-order: stroke` +
`vector-effect: non-scaling-stroke`, in a `#000` white-ink flavor and a `--dark-ink-keyline`
dark-ink flavor) is pasted into three components, identical comments included. ActionsPanel and
BrushMenu target `svg path[fill='currentColor']`; StrokeWidthMenu widens to `svg path`. Changing the
width, tokenizing the `#000`, or adjusting the selector means editing three files that must not
drift. Proposed promoting the pair to global utility classes in `app.css`.

**State at triage (2026-07-27):** Still triplicated — six rules, 24 declarations. Verified at HEAD:
`ActionsPanel.svelte:766-781`, `BrushMenu.svelte:66-81`, `StrokeWidthMenu.svelte:87-102`, each with
the same explanatory comment pair. All three components toggle the classes declaratively
(`class:white-stroke` / `class:dark-stroke` at `BrushMenu.svelte:29-30`,
`StrokeWidthMenu.svelte:36-37`, `ActionsPanel.svelte:279-280,303-304`); no other file uses either
class.

The drift since f934d43 makes the fix *more* natural, not less:

* The shared flyout shell was extracted to `app.css:242-335` (`.flyout-menu`/`.flyout-option`), and
  the design skill's global-class table registers it. The comment at `app.css:243-244` says each
  component keeps "only what genuinely differs — the eraser-mode sizing and the
  white-stroke/dark-stroke keylines". But the keylines *don't* differ: all six rules carry identical
  declarations; only StrokeWidthMenu's selector varies.
* That selector variance has a concrete cause: the `size-1..5` icons carry `fill="currentColor"` on
  the `<svg>` root, not the `<path>` (e.g. `web/src/lib/icons/size-3.svg`), so
  `path[fill='currentColor']` can't match them. The eraser-size icons use `<circle>` with
  `--paper`/`--hole-stroke` fills and are correctly untouched by either selector (and ActionsPanel
  drops the keyline flags while erasing anyway).
* `--dark-ink-keyline` is a real token (`web/src/tokens.css:110,153,197` — transparent in light
  mode), so the dark rule stays inert in light mode wherever it lives.

Conventions check: `.claude/rules/svelte.md` says "No global CSS except genuine cross-component
tokens", but the design skill (SKILL.md, "Shared *global* patterns" table and the paragraph below
it) explicitly carves out app.css classes for "chrome that several components share verbatim but
that hasn't earned a primitive yet" — and these exact components are its named example consumers.
The finding's approach fits the repo's conventions precisely.

#### Proposed solution

**FIX — clear winner.** Hoist the `.white-stroke`/`.dark-stroke` keyline rules to `web/src/app.css`
as global classes beside the `.flyout-menu` chrome that was already hoisted there since the pin,
using a union selector so StrokeWidthMenu's icon variant needs no asset edits. This is the design
skill's own documented pattern for exactly this situation ("hoist the shared *rules* to `app.css`
with a comment naming the consumers"), and the finding's alternative — tagging the icon SVGs — is
strictly more churn.

In `app.css`, directly after the `.flyout-option` rules:

```css
/* Ink keylines shared by ActionsPanel's trigger buttons, BrushMenu, and
   StrokeWidthMenu: ring currentColor icon parts so white ink reads on the white
   cards (#000 is a deliberate one-off — black reads against every pen color and
   both papers) and near-black ink reads on dark cards (--dark-ink-keyline is
   transparent in light mode, so the dark rule is inert there). paint-order
   draws the stroke behind the fill; non-scaling-stroke pins it to 2 screen px
   across very different viewBoxes. The second selector branch catches the
   size-N icons, which carry fill="currentColor" on the svg root, not the path. */
.white-stroke :is(svg path[fill='currentColor'], svg[fill='currentColor'] path) {
  stroke: #000;
  stroke-width: 2px;
  paint-order: stroke;
  vector-effect: non-scaling-stroke;
}

.dark-stroke :is(svg path[fill='currentColor'], svg[fill='currentColor'] path) {
  stroke: var(--dark-ink-keyline);
  stroke-width: 2px;
  paint-order: stroke;
  vector-effect: non-scaling-stroke;
}
```

Then delete the six component rules (and their now-redundant `:global()` wrappers and comment
copies), fix the two stale comments — `app.css:243-244` ("what differs" is now only the eraser-mode
sizing) and `ActionsPanel.svelte:763-764` ("the matching keyline rules … live in
BrushMenu/StrokeWidthMenu") — and register `.white-stroke`/`.dark-stroke` in the design skill's
global-class table, edited at its source `.ruler/skills/design/SKILL.md` followed by
`npm run ruler:apply`.

**Alternatives weighed:** 1. **Hoist to `app.css` with a union selector (winner).** One rule pair
covers all three components; the icon variance is absorbed by adding `svg[fill='currentColor'] path`
as a second branch. Verified safe at HEAD: no other icon rendered inside these controls (`pen`,
`crayon`, `magic-brush`, `eraser`, `line-weight`, `line-weight-eraser`, `eraser-size-*`) puts
`fill="currentColor"` on the svg root, so the branch matches exactly the `size-*` icons and nothing
else. Zero asset churn. 2. **Hoist plus retag `size-1..5.svg`** (the finding's suggestion) so one
`path[fill='currentColor']` selector suffices. Works, but edits five assets and requires a
`gen:icons` pass, for the same rendered result; the union selector's second branch with a one-line
comment is cheaper and self-explanatory. 3. **Leave in place.** Rejected: the app.css comment
already mislabels the keylines as "genuinely differs", which is exactly the drift-inviting state the
finding warns about.

**Landing note:** Re-stage in docs/AUDIT.md (or file as a `type:audit` issue) with the updated line
references and the union-selector approach above — it is a small, self-contained CSS move with a
screenshot checklist, well suited to a single PR (use the `pr-screenshots` before/after table).

#### Verification

per the finding still applies: `grep -rn "paint-order" web/src` collapses to the two app.css rules;
in `run-splotch`, check white ink and (dark theme) near-black ink on the brush trigger, open brush
menu, stroke trigger, and open stroke menu — including that the stroke menu's size lines keep their
keyline (that's the union-selector branch working).

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `.agents/skills/design/SKILL.md` remains stale after `.ruler/skills/design/SKILL.md` registered
  the new global classes; run `npm run ruler:apply` and commit the generated Codex copy so all
  ruler-managed outputs stay synchronized.

#### What was tried

Centralized the ink-keyline rules in `app.css` with the selector union needed for both icon
structures, removing all six component-local copies. Registered the global classes in the design
guidance and updated the raw-hex allowlist to reflect their new ownership.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p1-duplication-white-dark-ink-keyline-css-is-triplicated-across-actionsp.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p1-duplication-white-dark-ink-keyline-css-is-triplicated-across-actionsp.patch`.

### [P1][consistency] Unify the two error-response shapes across the API surface

**File(s):** `web/src/lib/server/http.ts:9-15,22-27`;
`web/src/routes/api/generate-image/+server.ts:17-19,71,72,92,111,143`;
`web/src/lib/server/generationAuthorization.ts:32,60`;
`web/src/routes/api/report/+server.ts:73,78,89,104`;
`web/src/routes/api/verify-access-code/+server.ts:26,30`;
`web/src/routes/api/verify-key/+server.ts:20,24` — pinned at SHA f934d43

#### Problem

Endpoints emit two incompatible JSON error shapes with no rule for which: `{ ok: false, error }`
(from `throttled()`, `verify-access-code`, `verify-key`, `report`) versus SvelteKit's `{ message }`
(every `throw error(...)` in generate-image / `generationAuthorization`, plus `readJsonBody`'s 400).
The same endpoint can return both — in `report`, a malformed body yields `{ message }` while a
missing `kind` yields `{ ok: false, error }` — so a client cannot parse a 400 without sniffing the
shape. The API skill even advertises "clients surface the `error` field directly", which is false
for every `error()`-thrown response.

**State at triage (2026-07-27):** Still fully present at HEAD. The routes drifted since f934d43
(`asRecord`/`stringField` helpers, `rateLimitPolicy`/`rateLimitKeys` extraction,
`config.geminiApiKey()`), but none of that touched the error shapes. The client-facing
`throw error(...)` inventory at HEAD:

* `generate-image/+server.ts` — 400 ("Missing image" ×2), 413 ("Image is too large" ×3), 415
  ("Unsupported image type"), 422 (safety refusal), 502 (upstream failure)
* `generationAuthorization.ts` — 403 ("Invalid access token"), 500 (missing `GEMINI_API_KEY`)
* `http.ts` `readJsonBody` — 400 ("Expected a JSON body"), reachable from every JSON endpoint
* `admin/tokens/+server.ts` — 401 ("Unauthorized") (documented in the API skill as `{ message }`;
  not in the finding's file list but part of the same inconsistency)

`csp-report` is a deliberate exception: its 413/415/204 responses are bodyless by design (browsers
ignore the response) and should stay exempt.

**Wire-compat check (the deployed-native-app hazard):** unification is safe. What clients parse
today, verified at HEAD:

* generate-image — `readAiImageResponse` (`web/src/lib/drawing/aiImageResponse.ts`) branches on
  status only (422 → safety, 429 → throttled) and reads the body via `.text()` into a `detail` that
  `aiImage.ts` only ever logs to the console. Shipped native/multipart clients run the same parser.
  No client reads `message`.
* verify-access-code / verify-key — `aiCredential.ts` reads `data.error` with a `.catch(() => ({}))`
  fallback; a `{ message }` 400 today yields `undefined` and generic copy, so switching it to
  `{ ok, error }` strictly improves what the client can show.
* report — `ReportForm.svelte` reads `data.error` with a fallback string; same strict improvement.
* admin 401 — the native admin page (`routes/admin/native/+page.svelte:79`) branches on
  `response.status === 401` and never reads that body.

No deployed client parses `{ message }`, so no app-store release needs to precede the change.

**Prior attempt / why it was deferred:** "Implementation failed": the code change itself was
implemented and verified, but Ruler regeneration could not update `.agents/skills/api/SKILL.md`
because the burndown's nested sandbox denied writes under `.agents/`, leaving the doc-sync half of
the change incomplete. No reviewer objection was recorded and no patch was kept. In a normal session
`npm run ruler:apply` writes both generated trees fine — the blocker does not exist outside that
sandbox.

#### Proposed solution

**FIX — clear winner.** Normalize every client-facing JSON error to `{ ok: false, error }` via a
`fail()` builder plus a thin per-route wrapper that converts thrown SvelteKit `HttpError`s at the
handler boundary. The deferred run's only blocker was environmental (a sandbox that couldn't write
`.agents/`), not a design or review objection, and the wire change is verifiably safe for every
deployed client.

In `web/src/lib/server/http.ts`:

```ts
export function fail(status: number, error: string, headers?: HeadersInit): Response {
  return json({ ok: false, error }, { status, headers });
}

export function apiHandler(handler: RequestHandler): RequestHandler {
  return async (event) => {
    try {
      return await handler(event);
    } catch (err) {
      if (isHttpError(err)) return fail(err.status, err.body.message);
      throw err; // genuinely unexpected → SvelteKit 500 + handleError, as today
    }
  };
}
```

Then: reimplement `throttled()` on top of `fail()` (adding the `Retry-After` header); wrap every
`/api/*` handler export in `apiHandler(...)` — including `admin/login` and `admin/tokens`, so the
401 also becomes `{ ok: false, error: 'Unauthorized' }` (client-safe per the check above) — except
`csp-report`, which keeps its documented bodyless responses (leave it unwrapped, or wrapped is
harmless since it throws nothing).

Doc sync in the same change (the part the sandbox blocked): update `.ruler/skills/api/SKILL.md` (the
"clients surface the `error` field directly" claim becomes true; the admin 401 example body; note
csp-report's bodyless exemption) and add the `fail()`/`apiHandler` convention to
`.claude/rules/server-api.md` (direct-edited, not generated), then `npm run ruler:apply`.

Extend `scripts/api-smoke.mjs` with the assertion the finding asked for: every JSON failure body it
already exercises (403 invalid token, 400 missing image, malformed-body 400, admin 401) is
`{ ok: false, error: string }`.

Sequencing within C11: land this first — the contract-types finding
([issue \#567](https://github.com/KyleMit/Splotch/issues/567)) wants an
`ApiError = { ok: false; error: string }` type that is only truthful once this ships. Findings 2 and
3 (helper extractions) are independent.

**Alternatives weighed:** 1. **`fail()` + a handler-boundary wrapper (winner).** Add
`fail(status, error, headers?)` to `http.ts` and a small `apiHandler()` that catches thrown
`HttpError`s and re-emits them through `fail()`. Throw-based control flow stays exactly as written —
`readJsonBody`'s signature, generate-image's deferred `readValidatedImage` thunk, and
`generationAuthorization`'s throws all survive unchanged — and the invariant is enforced in one
place that new endpoints inherit. 2. **Convert every throw site to a returned `fail()` Response (the
finding's original proposal).** Same wire result, but it threads `Response` unions through
`readJsonBody`, the image-reading thunk, and `authorizeGenerationRequest`'s already-union return
type — more churn, and nothing stops the next endpoint from reintroducing a bare `throw error(...)`.

Option 1 wins on churn and on making the shape a guarantee rather than a convention.

**Landing note:** Re-stage in docs/AUDIT.md with the wrapper approach and the doc-sync + smoke-test
additions folded into the brief; no patch exists to apply. Land before the contract-types finding.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

#### Why it was deferred

implementation failed

#### What was tried

Implemented `fail()`/`apiHandler()`, wrapped every listed API handler, and updated contract coverage
and conventions so thrown `HttpError`s use `{ ok: false, error }`. However, `npm run ruler:apply`
could not update the sandbox-protected `.agents/skills/api/SKILL.md`, leaving that required
generated copy incomplete.

### [P4][duplication] Reload-side-effect pair (`refreshState = 'idle'; window.location.reload()`) is repeated across three lifecycle paths

**File(s):** `web/src/lib/pwa/updates.ts:164-166,184-186` — pinned at SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p4-duplication-reload-side-effect-pair-refreshstate-idle-window-location.patch

#### Problem

The "commit the reload" step — reset the update state machine, then `window.location.reload()` — is
written out twice (in `onControllerChange` and in `checkForUpdates`' owed path), and the inverse
"defer instead" transition is a third inline copy. The discipline "always reset state before
reloading" is enforced only by copy-paste; a future path that reloads without resetting would strand
the state machine.

**State at triage (2026-07-27):** The file moved (`web/src/lib/updates.ts` →
`web/src/lib/pwa/updates.ts`) and the state machine was renamed
(`refreshState`/`'idle'`/`'deferred'` → `updateReload`/`'none'`/`'owed'`), but the duplication holds
at HEAD: the reset-and-reload pair sits at `updates.ts:162-163` (`onControllerChange`) and
`updates.ts:193-194` (`checkForUpdates`' owed path); the deferral transition is inline at
`updates.ts:158-160`. The draft patch was cut against the post-rename code — `git apply --check`
passes at HEAD, and its `reloadForUpdate()` covers exactly the two reload sites. Note two *other*
`updateReload = 'none'` writes at lines 173 and 185 are rollback-without-reload paths (postMessage
failure, activation-recovery timeout) and must stay out of the helper.

**Prior attempt / why it was deferred:** The implementer extracted `reloadForUpdate()` for the two
reload sites but never delivered a fix round for the reviewer's one unresolved objection: the
deferral transition (`updateReload = 'owed'`) stayed inline in `onControllerChange`, so the
finding's requested centralization of *both* lifecycle outcomes was incomplete. The reviewer
prescribed the remedy verbatim: extract and call a `deferReload()` helper alongside
`reloadForUpdate()`.

#### Proposed solution

**FIX — clear winner.** Apply the draft patch (it applies cleanly at HEAD) and add the one helper
the reviewer demanded — a `deferReload()` for the `updateReload = 'owed'` transition — so both
lifecycle outcomes are named, not just the reload.

Apply the patch with `git apply`, then satisfy the objection:

```ts
function deferReload() {
  updateReload = 'owed';
}

const onControllerChange = () => {
  clearTimeout(recoveryTimer);
  if (!canvasState.canvasEmpty) {
    deferReload();
    return;
  }
  reloadForUpdate();
};
```

Leave the two rollback resets (lines 173, 185) inline — they reset *without* reloading and belong to
neither helper. Verification: `npm run check` + `npm run test:unit` — the existing reload-count and
defer assertions in `web/src/lib/pwa/updates.test.ts` cover both helpers with no test edits.

**Alternatives weighed:** 1. **Apply the draft + add `deferReload()` (winner).** The reload
extraction is done and passed type-check/unit/lint gates; the residual objection is a three-line
helper. Honest caveat: at HEAD the `'owed'` assignment occurs exactly once, so `deferReload()`
centralizes nothing today — its value is that the state machine's two legal outcomes become named,
greppable moves, which is the invariant the finding is about and the condition the recorded review
made explicit. 2. **Apply the draft as-is and argue the objection down.** Rejected: re-litigating a
recorded objection over three lines costs more than writing them, and an unnamed inline transition
next to a named one reads as an accident. 3. **DROP as P4 noise.** Rejected: the patch exists,
applies cleanly, and already passed the driver's gates — the marginal cost from here is one tiny
helper, and the reload-count assertions in `updates.test.ts` (`toHaveBeenCalledTimes(1)` at lines
197, 216, 340) verify it for free.

**Landing note:** Re-stage in `docs/AUDIT.md` as "apply the draft patch, then extract
`deferReload()` for the inline `'owed'` transition in `onControllerChange`" — cite the reviewer's
objection as the acceptance criterion. Independent of the other C12 findings (different file; no
ordering constraint).

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* Extract the inline `updateReload = 'owed'` transition in `onControllerChange` into a
  `deferReload()` helper and call it there; `web/src/lib/pwa/updates.ts:164` still leaves one of the
  finding’s two lifecycle outcomes unnamed and repeats the exact unresolved defect from the prior
  attempt.

#### What was tried

Centralized the update reload lifecycle in `reloadForUpdate`, ensuring both controller-change and
deferred-update paths clear the state before reloading.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p4-duplication-reload-side-effect-pair-refreshstate-idle-window-location-2.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p4-duplication-reload-side-effect-pair-refreshstate-idle-window-location-2.patch`.

### [P2][architecture] Scatter of platform/device utilities across `lib/` root hurts grepability — group under one folder

**File(s):** `web/src/lib/platform.ts`, `deviceInfo.ts`, `deviceReport.ts`, `orientation.ts`,
`safeArea.ts`, `haptics.ts`, `notchBand.ts` (whole files) — pinned at SHA f934d43

#### Problem

Seven closely related "what device/platform am I on and how do I adapt" modules sit loose in the
`lib/` root among unrelated utilities. They form a natural import cluster (`deviceInfo`,
`orientation`, `haptics`, `notchBand` all lean on `platform.ts`; `safeArea` feeds
`notchBand`/layout), but answering "where does the app detect iOS / read insets / lock rotation?"
requires already knowing each filename. Proposal: group them under `lib/platform/` (or `device/`)
with an index re-export; pure move, no behavior change.

**State at triage (2026-07-27):** The finding fully holds at HEAD: all seven files still sit loose
in `web/src/lib/` (confirmed by listing), alongside topic folders that already exist for other
clusters (`pwa/`, `plugins/`, `boot/`, `audio/`, `ai/`, `design/`, …) — `updates.ts` itself moved
into `lib/pwa/` since the pin, so the repo is actively converging on this layout. Import churn
measured at HEAD: `$lib/platform` has 21 importers; the six siblings total ~15 (`deviceInfo` 1,
`deviceReport` 4, `orientation` 2, `safeArea` 3, `haptics` 3, `notchBand` 2). The `architecture`
skill's file map lists only `platform.ts` and `orientation.ts` — the other five are entirely absent,
which strengthens the grepability claim (the map won't help you find them either).

**Prior attempt / why it was deferred:** Implementation *succeeded* functionally — cluster moved,
consumers and tests rewired, the `.ruler/` architecture source updated — but the sandbox could not
write `.agents/skills/` when running `npm run ruler:apply`, so the generated Codex mirror of the
architecture skill stayed stale and the change was rolled back rather than land with drifted
generated output (which `npm run ruler:check` gates in CI). An environmental blocker, not a design
objection.

#### Proposed solution

**FIX — clear winner.** Move the cluster to `web/src/lib/platform/` with `index.ts` carrying the
current `platform.ts` exports (so the `$lib/platform` specifier and its 21 importers don't change),
siblings imported by full path, and — the part the failed attempt could not finish — regenerate the
ruler output so the Codex architecture mirror isn't left stale. The design already survived
implementation; only the environment killed it.

Redo the validated move in an environment where `npm run ruler:apply` can write both generated trees
(a normal checkout can). Concretely: `git mv` the seven modules (+ their colocated `*.test.ts`
files: `platform.test.ts`, `platform.osLabel.test.ts`, `deviceReport.test.ts`, `safeArea.test.ts`,
`notchBand.test.ts`) into `web/src/lib/platform/`, rename `platform.ts` → `platform/index.ts`,
update the ~15 sibling-import sites, update the `.ruler/` sources (the architecture skill's file map
— adding the five currently-missing modules while there — and the `web/src/.ruler/AGENTS.md` line
that names `lib/platform.ts`), run `npm run ruler:apply`, and commit the regenerated output.
Verification: `npm run check`, `npm test`, and `npm run
ruler:check` green — the last one is
precisely the gate the failed attempt could not satisfy.

Sequencing within C12: land the Orientation-type patch (see the sibling entry
"`Orientation = 'portrait' | 'landscape'` is redeclared in ~8 places") **before** this move — that
draft patches `web/src/lib/platform.ts` by path and stops applying once the file is renamed. This
move then carries the canonical `Orientation` export along into `platform/index.ts` with no further
edits, and the `$lib/platform` import specifier in all its consumers survives unchanged.

**Alternatives weighed:** 1. **`lib/platform/` with a detection-only `index.ts` (winner).**
`platform.ts` becomes `platform/index.ts` verbatim; `$lib/platform` keeps resolving for all 21
importers with zero edits. Siblings move to `platform/deviceInfo.ts` etc. and their ~15 import sites
update to `$lib/platform/<name>`. Colocated tests move along. Deliberately *not* an
everything-barrel: re-exporting `orientation.ts` from the index would route `state/settings` →
`storage` → `$lib/platform` → `orientation` → `state/settings` into an import cycle
(`orientation.ts` imports `$lib/state/settings.svelte`). Detection-only index avoids that class of
cycle entirely. 2. **Same move, folder named `device/`.** Rejected: `$lib/platform` is the
established specifier (21 importers, ADR-0013, the CLAUDE.md src map, and the `Platform` type all
say "platform"); `device/` would force edits at every one of those sites for a name that is no more
accurate. 3. **Status quo + complete the `architecture` skill file map instead.** Cheaper, and the
map *should* list all seven files regardless — but rejected as the resolution: it fixes the skill,
not the grep (`ls web/src/lib` and editor fuzzy-find still interleave the cluster with
`idle.ts`/`storage.ts`/`imagePrefetch.ts`), and the finding's brief explicitly accepts the one-time
churn.

Membership judgment calls, decided: include `deviceReport.ts` — it is the client/server-shared shape
of device info (imported by `/api/report`), and server code importing `$lib/platform/deviceReport`
is fine since the module is deliberately dependency-free; keeping it beside `deviceInfo.ts` (which
imports its type) beats stranding it. Include `haptics.ts` — it is "adapt output to the platform"
and imports `platform.ts`.

**Landing note:** Re-stage in `docs/AUDIT.md` as the move described above, with an explicit
acceptance criterion of `npm run ruler:check` passing (the recorded failure mode), and ordered after
the Orientation-type patch lands.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* The relocation leaves durable references to removed paths in `.ruler/skills/api/SKILL.md`, several
  ADRs, `docs/COMPATIBILITY.md`, `docs/CONTRIBUTING.md`, `web/src/app.d.ts`, and
  `web/src/lib/state/books.ts`; update them to `platform/index.ts` or `platform/<module>.ts` as
  appropriate, then regenerate the `.agents` and `.claude` mirrors.
* Four committed patches under `docs/audit-deferred/` still reference the removed root modules and
  fail `git apply --check`, including the explicitly sequenced Orientation-type patch;
  retarget/regenerate the `p2-complexity`, `p2-duplication-orientation`, `p2-type-safety`, and
  `p4-accessibility` patches for `$lib/platform/*` and the relocated file paths.

#### What was tried

1. Moved the seven platform/device modules and their colocated tests into `lib/platform/`,
   preserving `$lib/platform` through `index.ts` and updating explicit sibling consumers. Updated
   the specified Ruler architecture and mobile sources to document the consolidated cluster.
2. Updated every reviewer-identified durable reference to the relocated `platform/index.ts` or
   explicit platform sibling path, including accurate compatibility line anchors. Refreshed the API
   skill source and writable generated mirror so the outer Ruler pass can complete both provider
   mirrors.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-architecture-scatter-of-platform-device-utilities-across-lib-root-hur.patch`
(2 commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-architecture-scatter-of-platform-device-utilities-across-lib-root-hur.patch`.

### [P2][duplication] `Orientation = 'portrait' | 'landscape'` is redeclared in ~8 places

**File(s):** `web/src/lib/notchBand.ts:38`, `web/src/lib/state/layout.svelte.ts:4`,
`web/src/lib/orientation.ts:5`, `web/src/lib/state/books.ts:49`, `state/canvas.svelte.ts:18`,
`drawing/engine.ts:258`, `components/SettingsModal.svelte:60`, `tests/global.d.ts:48` — pinned at
SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p2-duplication-orientation-portrait-landscape-is-redeclared-in-8-places.patch

#### Problem

The literal union `'portrait' | 'landscape'` is declared independently eight times — as
`Orientation` twice (`notchBand.ts`, `layout.svelte.ts`), as `OrientationLockType`
(`orientation.ts`), as `BookOrientation` (`books.ts`), and inlined anonymously in four more spots.
Any widening (e.g. `'square'`) touches every copy and there is no single grep target. Proposal: one
canonical `export type Orientation` in `platform.ts`, imported everywhere; keep
semantically-distinct aliases as `type X = Orientation` where the name adds meaning.

**State at triage (2026-07-27):** All eight duplication sites hold at HEAD (verified by grep):
`notchBand.ts:38`, `layout.svelte.ts:4`, `orientation.ts:5`, `books.ts:50`, `canvas.svelte.ts:26`,
`engine.ts:262`, `tests/global.d.ts:49`, and — the one drift — the `SettingsModal.svelte` copy now
lives in the extracted `components/settings/CompactShell.svelte:29` (`LockedOrientation`). The draft
was cut after that extraction: it targets `CompactShell.svelte`, and `git apply --check` passes at
HEAD. It adds `export type Orientation` to `platform.ts:52` beside `Platform`, converts all eight
consumers to type-only imports, keeps the meaningful aliases (`BookOrientation`,
`OrientationLockType`, `LockedOrientation`) as `= Orientation`, and preserves `notchBand.ts`'s
type-only-import purity (no runtime `platform.ts` import reaches the pure layer).

**Prior attempt / why it was deferred:** The implementer delivered the full consolidation but no fix
round for the one unresolved objection, which is cross-patch, not in-patch: the separately deferred
draft
`docs/audit-deferred/p2-complexity-effect-bodies-use-bare-member-access-statements-purely-to.patch`
(a) adds `import { layout, type Orientation } from '$lib/state/layout.svelte'` in
`ClearButton.svelte` — an export this patch deletes — and (b) still carries
`type OrientationLockType = 'portrait' | 'landscape'` in its rewritten `orientation.ts` hunks. The
reviewer required that reapplicable draft be updated to use the canonical type from `platform.ts`.

#### Proposed solution

**FIX — clear winner.** Apply the draft patch as-is — it applies cleanly at HEAD and is complete for
this finding. The reviewer's sole objection was about collateral damage to a *different* deferred
draft; satisfying it means rebasing that sibling patch, not changing this one.

Apply the patch with `git apply` — no edits. Record the objection's remedy against the
*effect-bodies* deferred finding, where the work actually lands: rebase that patch so it reads

```ts
// ClearButton.svelte
import type { Orientation } from '$lib/platform';
import { layout } from '$lib/state/layout.svelte';

// orientation.ts (its rewritten header)
import type { Orientation } from '$lib/platform';
type OrientationLockType = Orientation;
```

Sequencing within C12: land this **before** the platform-folder move (the sibling entry "Scatter of
platform/device utilities across `lib/` root") — the draft patches `web/src/lib/platform.ts` by path
and stops applying once that file becomes `platform/index.ts`. The move then carries the canonical
type along, and every `from '$lib/platform'` import this patch adds survives the move unchanged, so
the two land coherently in this order with no rework.

**Alternatives weighed:** 1. **Apply the draft, then rebase the effect-bodies sibling draft
(winner).** This patch passed type-check, unit-test, and lint gates and needs zero content changes.
The objection is mechanical: in the effect-bodies patch, change `ClearButton.svelte`'s type import
source from `$lib/state/layout.svelte` to `$lib/platform`, and keep
`type OrientationLockType =
   Orientation` (importing it) in its `orientation.ts` hunks — its
current hunks also carry the old literal as context, so they conflict outright once this lands; a
3-way rebase of that patch is needed regardless. 2. **Re-export `Orientation` from
`layout.svelte.ts` as a compatibility shim** so the sibling draft applies untouched. Rejected: it
preserves the second grep target the finding exists to remove, and the sibling draft still conflicts
on its `orientation.ts` context lines anyway — the shim buys nothing. 3. **DROP.** Rejected: all
eight copies are live at HEAD, the fix is done and green, and the canonical home (`platform.ts`) is
exactly where the C12 folder finding wants the platform vocabulary to live.

**Landing note:** Re-stage in `docs/AUDIT.md` as "apply the draft patch as-is, before the
platform-folder move; then rebase the effect-bodies draft per the recorded objection (import
`Orientation` from `$lib/platform`, drop its literal redeclarations)".

#### Verification

per the original brief: `git grep "'portrait' | 'landscape'"` returns only `platform.ts`'s single
definition, and `npm run check` passes (the patch already met this at the driver's gates).

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* Rebase
  `docs/audit-deferred/p2-complexity-effect-bodies-use-bare-member-access-statements-purely-to.patch`:
  its `ClearButton.svelte` hunk still imports `Orientation` from the now-removed `layout.svelte.ts`
  export, and its `orientation.ts` hunk still redeclares `'portrait' | 'landscape'`; both must use
  the canonical type from `$lib/platform`.

#### What was tried

Added the canonical `Orientation` type to `platform.ts` and replaced all eight duplicate unions with
type-only imports or meaningful aliases. Updated `ClearButton.svelte` to import the canonical type
after removing the duplicate layout export, without changing runtime behavior.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-duplication-orientation-portrait-landscape-is-redeclared-in-8-places-2.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-duplication-orientation-portrait-landscape-is-redeclared-in-8-places-2.patch`.

### [Testing] `blitPaperRect` and `ensurePaperCovers` have no unit coverage

**File(s):** `web/src/lib/drawing/undoHistory.ts` (`blitPaperRect`, lines 224–238;
`ensurePaperCovers`, lines 160–186); `web/src/lib/drawing/undoHistory.test.ts` @ 9ae62ff1

**Priority:** P4

#### Problem

Two exported functions with real logic never appear in the unit suite beyond `freshHistory()`'s
single setup call to `ensurePaperCovers(64)` (test line 110):

* `blitPaperRect` clamps the rect to the paper (lines 227–230), early-returns on degenerate results
  (line 231), and forces `source-over`/alpha-1 under save/restore — none asserted. Its rect math is
  the commit-reconcile path (`engine.ts` line 642) and the rect-limited undo repaint (line 1087).
* `ensurePaperCovers`' grow path (lines 174–185) — copying the existing drawing into the grown
  canvas, `Math.max` dimension logic, the no-shrink early return (line 173) — is untested; a
  regression there loses drawings on window resize/rotation.

Both are exercisable with the existing recording canvas stub (drawImage copies `_content`; the stub
already counts `drawImageCalls`).

#### Proposed solution

Add: (a) `blitPaperRect` with an off-paper rect → no draw; a straddling rect → clamped clear+draw
(assert via `drawImageCalls` and target `_content`); (b) draw → `ensurePaperCovers(larger)` →
`repaintedContent` still shows the stroke, and `ensurePaperCovers(smaller)` is a no-op. If the
recording stub needs source-rect awareness for the clamp assertions, extend `drawImage` to record
its arguments — a smaller change than it sounds since the stub already exists.

#### Why it was deferred

failed adversarial review

Reviewer's unresolved objections:

* Add an `ensurePaperCovers` test in `web/src/lib/drawing/undoHistory.test.ts` that calls it with a
  smaller side after growth and proves the call neither copies/replaces the paper nor loses its
  existing content; the original finding explicitly identifies the no-shrink early return as
  uncovered, and this range still does not exercise it.
* `web/src/lib/drawing/undoHistory.test.ts` never proves that `ensurePaperCovers(128)` actually
  expands the paper or that the later smaller request preserves that expanded extent; an
  implementation that copies into another 64×64 canvas would pass. Assert behavior in the newly
  covered region, such as a `blitPaperRect` beyond coordinate 64 succeeding after growth and still
  succeeding after the smaller request.
* The straddling `blitPaperRect` case only exercises right/bottom clipping because its origin is
  positive, leaving the `Math.max(0, x/y)` left/top clamps identified by the original finding
  uncovered. Add a negative-origin straddling case, or make the existing rectangle cross both paper
  edges and assert the fully clipped arguments.
* The no-shrink assertion in `web/src/lib/drawing/undoHistory.test.ts` reuses a target already
  containing `#a`, so if the smaller request incorrectly shrinks the paper, the second out-of-bounds
  blit no-ops and the assertion still passes; use a fresh/cleared target and assert the post-request
  blit occurs at coordinates beyond 64.

#### What was tried

1. Added focused `blitPaperRect` coverage for off-paper no-ops, edge clipping with committed-content
   copying, and isolated canvas composite/alpha state. Extended only the shared canvas harness
   recording needed to assert those behaviors.
2. Added a no-shrink regression test proving that a smaller `ensurePaperCovers` request after growth
   neither copies nor loses the committed paper content.
3. Expanded the paper-growth test to prove coordinate 64 is usable after growth and remains usable
   after a smaller request. Updated clipping coverage to assert a rectangle crossing all four paper
   edges is fully clamped.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/testing-blitpaperrect-and-ensurepapercovers-have-no-unit-coverage.patch` (3
commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/testing-blitpaperrect-and-ensurepapercovers-have-no-unit-coverage.patch`.

### [Testing] screenshot.ts has zero unit coverage despite containing pure, unit-testable logic

**File(s):** `web/src/lib/drawing/screenshot.ts` (`timestamp`, lines 7–11; `saveImageBlob`, lines
71–92; `getPolaroidFrameOffset`, lines 105–111) @ 9ae62ff1

**Priority:** P4

#### Problem

The sibling modules in this section all have colocated tests (`folderSave.test.ts`,
`paperView.test.ts`, `strokeMath.test.ts`), but `screenshot.ts` has none, and it contains exactly
the kind of logic the testing rules assign to Vitest:

* `timestamp()` — a pure formatter whose zero-padding and `YYYY-MM-DD_HH-MM-SS` shape downstream
  filenames (and the `folderSave.ts` line 126–127 comment's "second-resolution" collision reasoning)
  depend on. A regression to unpadded fields breaks filename sorting silently.
* `saveImageBlob`'s web dispatch chain (lines 85–91): folder write attempted first, `true`
  short-circuits the download, `false` falls back to `triggerDownload` + `URL.revokeObjectURL`. This
  branching is the seam between two tested modules and is itself untested — `folderSave.test.ts`
  tests below it, `aiImage.test.ts` mocks it away above.
* `getPolaroidFrameOffset` (pure given a `DOMRect` and window size).

#### Proposed solution

Add `screenshot.test.ts` (happy-dom, since the module's imports touch `document` at load): assert
`timestamp()` against a mocked `Date`; mock `./folderSave` and `./engine` to drive `saveImageBlob`
through the folder-hit, folder-miss→download, and native branches (`__IS_CAPACITOR__` is
compile-time `false` under Vitest web config — the native branch may need the test to stay web-only,
which is fine and worth a comment). If the architecture split proposed above happens first, the
naming/download utils test drops to `// @vitest-environment node`.

#### Why it was deferred

verifier gave no usable brief

### [Types] Style plumbing widens the closed `StyleName` union back to `string` mid-flight

**File(s):** `web/src/lib/drawing/aiImage.ts` (`buildRequest`, lines 151–154) and
`web/src/lib/ai/prompt.ts` (`buildPromptForStyle`, lines 7–10) @ 9ae62ff1

**Priority:** P4

#### Problem

CLAUDE.md: closed value sets are "threaded end to end — never bare `string`… plus a runtime
fallback." `generateAiImage` correctly accepts `style?: StyleName | ''` (line 201), but the very
next hop drops the union:

```ts
function buildRequest(
  uploadBlob: Blob,
  style: string,
): { endpoint: string; headers: Record<string, string>; body: Blob };
```

(lines 151–154). Similarly
`buildPromptForStyle(style: string | null, suffixes: Record<string, string>)` (`prompt.ts` lines
7–10) types both parameters loosely and re-derives membership at runtime via `Object.hasOwn` — on
the *server* that's a legitimate boundary (the style arrives as an unvalidated query param), but the
suffix map could still be typed as the concrete `STYLE_SUFFIXES` shape without breaking the
asset-gen import (the module stays dependency-free; a generic constraint is erased by
`--experimental-strip-types`).

#### Proposed solution

Type `buildRequest`'s `style` as `StyleName | ''` (zero-cost, one token). For `prompt.ts`, keep
`style: string | null` (genuine boundary input) but tighten the map:
`buildPromptForStyle<S extends Record<string, string>>(style: string | null, suffixes: S)` — or
simply accept `Readonly<Record<string, string>>` and leave a WHY comment that `style` is
deliberately unvalidated because the server treats an unknown style as "no suffix". The current code
half-implies that policy; the type should state it.

#### Why it was deferred

verifier gave no usable brief

### [Maintainability] Three hand-rolled copies of the iOS-style segmented control — extract a design primitive

**File(s):** `web/src/lib/components/settings/AppearanceSection.svelte` (`.theme-picker`, lines
33–47 markup, 89–135 styles), `web/src/lib/components/settings/CompactShell.svelte` (`.orient-seg`,
lines 97–111 markup, 169–219 styles), `web/src/lib/components/settings/ReportForm.svelte`
(`.report-kind`, lines 115–128 markup, 235–270 styles) @ 9ae62ff1

**Priority:** P2

#### Problem

The same segmented-control widget is implemented three times inside this one section, and two of the
copies openly admit it in comments:

* `AppearanceSection.svelte:89`:
  `/* iOS-style segmented control: the active segment reads as a raised card. */`
* `CompactShell.svelte:169`:
  `/* iOS-style segmented control, matching the Theme picker in AppearanceSection. … */`
* `ReportForm.svelte:235`:
  `/* Bug / feature segmented control — mirrors the Appearance theme picker. */`

Each copy re-declares the flex row + `--slider-track` well + padded segments + active raised card +
hover rules, but they have already drifted: the theme picker uses `border-radius: var(--radius-md)`
outer / `9px` inner with `--shadow-segment`; CompactShell uses `10px` outer / `var(--radius-sm)`
inner, `12.5px` font, and `touch-action: manipulation`; ReportForm uses a bordered `--surface` well,
`10px`/`7px` radii, **no** `--shadow-segment` on the active segment, and a filled `--brand` active
state instead of the raised-card look. The accessibility patterns diverge too: two are
`role="radiogroup"`/`role="radio"`+`aria-checked`, one is `role="group"`+`aria-pressed`.
"Matching"/"mirrors" comments are cross-file agreement by prose — exactly what CLAUDE.md calls a
defect, and the drift shows the prose isn't holding.

The design-system tree (`web/src/lib/components/design/`) already exists for this (Button,
Disclosure, StatusMessage), and `web/src/lib/design/tokens.ts:108` even documents `--shadow-segment`
as "the tight lift on the selected segment of a segmented toggle (theme, …)" — the vocabulary
anticipates a shared primitive that never got built.

#### Proposed solution

Add `web/src/lib/components/design/SegmentedControl.svelte`, generic over the option value:

```svelte
<script lang="ts" generics="T extends string">
  interface Option { value: T; label: string; icon?: CommonIconName; id?: string }
  interface Props {
    options: Option[];
    selected: T | null;          // null = nothing active (CompactShell's unlocked state)
    onSelect: (value: T) => void;
    ariaLabel: string;
  }
</script>
```

The primitive owns the well, segment chrome, active state, and the radiogroup/radio ARIA wiring;
call sites keep sizing tweaks via a forwarded `class`, the established Disclosure pattern.
CompactShell's "tap the active side to release" behavior stays in its `onSelect` handler.
ReportForm's filled-brand active style can either adopt the raised-card look (visual consistency
win) or pass a variant — decide with the `design` skill open. Note the a11y wrinkle:
`selected: null` with `role="radio"` is legal (no radio checked), so CompactShell's `aria-pressed`
variant can be dropped.

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `docs/adrs/0071-design-token-single-source.md:152-155` still states "The report-kind row
  (`ReportFields`) stays native radios on purpose … `SegmentedPicker`'s `<button role="radio">`
  markup cannot [submit without JavaScript] — that one hand-rolled picker is a deliberate carve-out,
  not a migration gap." That is now false; amend the picker amendment to record that `inputName`
  gives the primitive a native-radio skin and the report-kind row migrated onto it.
* `.ruler/skills/design/SKILL.md:116-117` still tells the reader "(The report-kind row stays
  hand-rolled on native radios so the `/feedback` form posts without JavaScript)", and the
  `SegmentedPicker.svelte` row of that same table (lines 118-121) lists
  `mode`/`variant`/sizes/`fill` but not the new `inputName` prop. Fix both in the `.ruler/` source
  and run `npm run ruler:apply` so `.claude/skills/design/SKILL.md` and
  `.agents/skills/design/SKILL.md` regenerate.
* `docs/COMPATIBILITY.md:128` locates the CSS `:has()` usage at
  `lib/components/report/ReportFields.svelte:190` ("focus ring around the report-kind label"); that
  selector now lives at `web/src/lib/components/design/SegmentedPicker.svelte:136` and applies to
  every native-radio picker, not just the report kind. Update the row's file:line and description.
* ReportFields' `@media (max-width: 400px)` tightening (gap/padding shrink, `font-size-xs`,
  `white-space: nowrap`) was deleted with no equivalent in the primitive or at the call site, and
  `SegmentedPicker` forwards no `class` prop. `.segment.md .option` is `font-size-sm` with
  `min-width: 0` and no nowrap/ellipsis, so on a ~320-360px viewport the two long labels
  ("Something's broken", "I have an idea") can wrap to two lines in both `/feedback` and the
  settings Send Feedback card — the exact narrow-phone case the removed comment says was handled
  deliberately. Restore the tightening (a forwarded `class`, an extra size, or a `:global()`
  override in `ReportFields`) and cover it with a narrow-viewport assertion, since no current spec
  exercises it.

#### What was tried

Gave SegmentedPicker an opt-in `inputName` prop that renders its options as a native
`<input type="radio">` group inside the same track/option chrome (shared with the button skin via a
snippet), so the feedback kind picker can drop its hand-rolled copy without losing no-JS form
submission. ReportFields now renders it with the default `segment` variant — the choose-one skin,
matching Appearance/CompactShell — and `/feedback`'s `:global()` radius overrides are deleted since
the primitive's md/sm radii already land in the page's one radius family.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/maintainability-three-hand-rolled-copies-of-the-ios-style-segmented-cont.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/maintainability-three-hand-rolled-copies-of-the-ios-style-segmented-cont.patch`.

### [Readability] AiKeyManager's open-effect calls `latest.begin()` for its side effect only, behind a pointless alias

**File(s):** `web/src/lib/components/settings/AiKeyManager.svelte` (`$effect`, lines 62–70) @
9ae62ff1

**Priority:** P3

#### Problem

```ts
$effect(() => {
  const isOpen = open;
  latest.begin();
  if (isOpen) {
    platform = getPlatform();
    keyInput = '';
    resetKeyFeedback();
  }
});
```

Two readability problems. First, `latest.begin()` is called with its return value (`{ id, signal }`)
discarded — the *actual* intent is "abort any in-flight verify whenever the modal opens or closes,
and invalidate its `isCurrent` token", but nothing says so; `begin` reads like the start of a
request, so a discarded `begin()` looks like a half-finished refactor or a bug. Second,
`const isOpen = open` exists (presumably) to establish the reactive read before the early-branch,
but `open` is read in the `if` anyway, so the alias adds nothing — the untracked-reads subtlety it
hints at doesn't apply here.

Compare `ReportForm.svelte:50–52`, which handles the same prop with a bare `if (open) reset();` and
no abort — the asymmetry (does ReportForm leak an in-flight submit across close? it deliberately
doesn't abort, or it was missed?) is unanswerable from the code.

#### Proposed solution

Give the abort a name on the `LatestRequest` interface — e.g. add `cancel(): void` to
`web/src/lib/latestRequest.ts` (aborts the controller and bumps the counter, same as `begin` minus
the handout) — and write the effect as:

```ts
$effect(() => {
  latest.cancel(); // opening or closing obsoletes any in-flight verify
  if (open) {
    platform = getPlatform();
    keyInput = '';
    resetKeyFeedback();
  }
});
```

Then decide whether `ReportForm` should do the same on close (it probably should — a success message
from a submit that finished after close would greet the next open, except `reset()` on open happens
to clear it; a one-line comment either way).

#### Why it was deferred

fix broke the test suite

The driver's gates were red at the final round: npm run test:unit && npm run test:scripts && npm run
test:asset-gen is red.

Reviewer's unresolved objections:

* The finding's second half is unimplemented:
  `web/src/lib/components/settings/ReportForm.svelte:44-46` still has a bare
  `$effect(() => { if (open) reset(); })` with no `latest.cancel()` and no comment, so the
  AiKeyManager/ReportForm asymmetry the finding called out — does closing leak an in-flight submit?
  — is still unanswerable from the code. Either add `latest.cancel()` on open/close there too, or
  add the one-line comment saying why ReportForm deliberately relies on `reset()`-on-open instead of
  aborting.
* `ReportForm.svelte:50` calls `latest.cancel()`, which aborts the AbortController whose signal is
  passed to the report `fetch` (`ReportForm.svelte:74`) — so reopening Settings during an in-flight
  submit kills the POST, directly contradicting the comment three lines above it that says a sent
  report "must be left to land" (reachable in the wide/tablet layout, where ReportForm stays mounted
  across close).
* `LatestRequest` needs a bump-only invalidation for ReportForm's case — increment `current` so a
  late result fails `isCurrent(id)` without touching the controller — and `ReportForm.svelte:50`
  should call that instead of the aborting `cancel()`; alternatively drop the `cancel()` call and
  rewrite the comment to state the real chosen behaviour, but the current pairing of abort + "do not
  abort" comment cannot stand.
* The new abort-on-reopen behaviour in ReportForm is untested: there is no ReportForm component test
  anywhere, and the only test added covers the `latestRequest` primitive. Add coverage for the
  reopen-during-submit path once the intended behaviour is settled.

#### What was tried

1. Added a `cancel()` method to `LatestRequest` that performs the abort + counter bump without
   handing out an id/signal, and switched `AiKeyManager`'s open/close effect to call it, so the
   intent (obsolete any in-flight verify) is named rather than implied by a discarded `begin()`
   return; also dropped the `isOpen` alias, which read `open` no differently than the `if` below it.
   Covered `cancel()` with a unit test asserting the in-flight request goes stale, its signal
   aborts, and a later `begin()` still yields a strictly increasing id.
2. Implemented the finding's deferred second half in ReportForm.svelte. Rather than either option
   the reviewer offered, I invalidate the in-flight submit on open only: `reset()`-on-open leaves a
   real race uncovered (submit → close → reopen → type → the stale response passes `isCurrent` and
   its success branch sets `message = ''`, wiping freshly typed text), so a comment claiming the
   status quo is deliberate would document a bug as intent; but cancelling on close would abort a
   POST that files a GitHub issue, making delivery nondeterministic, which is why AiKeyManager (an
   idempotent verify) can abort and this cannot. A comment records that asymmetry and its reason, so
   the question the finding raised is answerable from the code. Verified with npm run check,
   test:unit (1157 passed), eslint, format:check, and the flows-settings + feedback E2E specs (18
   passed). Flagged one gap: no test covers the ReportForm race itself — it is E2E-shaped and
   outside the brief's acceptance criteria, offered to add it.
3. All three review points addressed. (1) Confirmed the abort empirically with a throwaway probe
   spec: at 1dde25b, reopening Settings mid-submit failed the report POST with net::ERR_ABORTED and
   it never finished — the reviewer was right and my earlier "it may unmount first" reasoning was
   wrong. (2) Took the reviewer's second alternative (drop the cancel() call, rewrite the comment)
   rather than adding a bump-only invalidate(), because the probe also showed SettingsModal resets
   view='hub' on reopen and mounts one section at a time, so ReportForm unmounts and the next visit
   gets a fresh createLatestRequest() — an invalidate() call site would change no outcome, i.e.
   speculative surface. This retracts 1dde25b's claimed stale-response-wipes-typed-text race, which
   requires the instance to survive the reopen. (3) Added E2E spec 'reopening Settings mid-submit
   leaves the sent report to land' to flows-settings.spec.ts asserting the held POST's outcome is
   exactly ['finished'], and verified it is a real guard by restoring cancel() and watching it fail
   with net::ERR_ABORTED. Generalized openAiSettings into openSettingsSection instead of copying the
   helper. Verified: npm run check (0 errors), test:unit (1157 passed), eslint, format:check,
   flows-settings at --repeat-each=3 (33 passed). latestRequest.ts unchanged from 12d47ad. Flagged
   that reset()-on-open now looks vestigial but left it, as proving it dead spans the compact/phone
   shells and is outside this finding's scope.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/readability-aikeymanager-s-open-effect-calls-latest-begin-for-its-side-e.patch`
(3 commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/readability-aikeymanager-s-open-effect-calls-latest-begin-for-its-side-e.patch`.

### [Maintainability] Off-scale hardcoded font sizes where the token scale is the convention

**File(s):** `web/src/lib/components/SettingsModal.svelte` (lines 271 `24px`, 277 `20px`, 441
`15px`), `web/src/lib/components/settings/CompactShell.svelte` (line 193 `12.5px`),
`web/src/lib/components/settings/SetupInstructions.svelte` (lines 239 `24px`, 280 `20px`) @ 9ae62ff1

**Priority:** P4

#### Problem

`tokens.css:37–43` defines a seven-step type scale (`--font-size-xs` 12px … `--font-size-3xl` 28px)
and these same files use it dozens of times — then break out into raw pixels in six places: the
SettingsModal `h2` at `24px` and `20px`, the sidebar nav item at `15px`, CompactShell's segment
label at `12.5px`, and SetupInstructions' chevron at `24px` / check at `20px`. Three of these
(`15px`, `12.5px`, `24px`) don't even exist on the scale, so they can't be a token-name-forgotten
slip — they're ad-hoc sizes that silently fork the type ramp. The `design` skill owns this
vocabulary ("read before … picking a color/size"), and a mixed file (tokens on line 388, raw px on
line 441 of the same component) is the worst of both: a reader can't tell which sizes are decisions
and which are drift.

#### Proposed solution

Audit each against the scale with the `design` skill open: `20px` and `24px` headings likely become
`--font-size-2xl` (22px) or justify a new heading token; `15px` nav items are a hair off
`--font-size-lg`/`md` and almost certainly round to one; `12.5px` rounds to `--font-size-sm` (13px)
or `--font-size-xs` (12px) — CompactShell is space-constrained, so verify in the landscape-phone
viewport. Any size that genuinely must stay off-scale gets a local named custom property with a WHY
comment (the `--drawer-transition` pattern from the svelte rules). Same treatment for the
`install-check`'s `font-size: 20px`.

#### Why it was deferred

verifier unavailable
