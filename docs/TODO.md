# TODO

> Work through these items one at a time with `/fix-next-todo-manual`, or clear the whole list autonomously with `/fix-next-todo-auto`.
> After each fix: remove the completed item and run relevant type checks or tests.
> In manual mode, do **not** `git add` or `git commit` — the user reviews the diff first. Auto mode commits to its own branch/PR.

## Code audit (2026-07)

Findings from a full-repo audit pass, ordered by impact. Bugs and correctness first,
then performance, then maintainability/architecture sweeps.

### Maintainability & architecture

- [ ] **[Types] String-union state typed only in comments; untyped props; duplicated `Platform` union** — File(s): `web/src/lib/components/parent/AiKeyManager.svelte` (18, 22, 26), `web/src/lib/components/parent/SetupInstructions.svelte` (9, 11, 21), `web/src/lib/notchBand.ts` (39)
  `let keyStatus = $state('idle'); // 'idle' | 'checking' | 'error' | 'success'` should be
  `$state<'idle' | 'checking' | 'error' | 'success'>('idle')` (same for `platform` and
  `installOs`) — the comment drifts silently and typos in comparisons type-check today. Give
  both components a `Props` interface like the rest of the tree, and `import type { Platform }`
  from `$lib/platform` instead of the hand-copied union in `notchBand.ts` (type-only imports
  are erased, so the file's no-plugin-import purity is preserved). Zero runtime change.

- [ ] **[Polish] Deduplicate repeated UI patterns** — File(s): `web/src/lib/components/admin/AdminConsole.svelte`, `web/src/routes/dev/ai-timer/+page.svelte`, `web/src/lib/components/parent/SettingsToggles.svelte`, `parent/AiKeyManager.svelte`, `parent/AboutTab.svelte`, `web/src/lib/components/ParentCenter.svelte`, `web/src/routes/dev/engine/+page.ts`, `web/src/routes/dev/ai-timer/+page.ts`
  Four small verbatim duplications worth one consolidation sweep: (a) the breadcrumb
  markup + full style block (including the 6-function icon-tint filter) is copy-pasted between
  AdminConsole and the ai-timer harness — extract a `Breadcrumb.svelte`; (b) the
  `.setting-group` rules are repeated across all three Parent Center tabs and the `.setting`
  card style across two (SettingsToggles + AiKeyManager; AboutTab has only `.setting-group`) —
  hoist into ParentCenter's style block with tightly-scoped `:global`, or a small wrapper
  component; (c) ParentCenter's close button has the shared `.modal-close-btn` class but uses
  a bespoke `×` glyph with its own typographic styles instead of the
  `<Icon name="close" class="modal-close-icon">` every other modal wraps, so the shared
  `.modal-close-icon` hover styling silently misses it; (d) both dev routes carry an
  identical `prerender = false` + `PUBLIC_ENABLE_DEV_HARNESS` 404-gate `load` — extract a
  shared `requireDevHarness()` since it's a security-relevant gate with two implementations.

## Sticky `:hover` on touch devices

iOS WebKit (and most touch browsers) apply `:hover` on tap and keep it stuck until
the user taps elsewhere. Any `:hover` rule that changes border/background/box-shadow
leaves the element looking active/highlighted after a tap. The fix is to wrap the
`:hover` rule in `@media (hover: hover)` so it only engages for true pointing devices.
Already fixed in `ActionsPanel.svelte` for `.action-button` and `.stroke-size-button`
(reference implementation). The items below are the remaining unguarded rules.

Priority is by how exposed each is on the native (touch) app: toddler-facing drawing
UI first, then Parent Center (reachable on-device), then web-only admin/dev/static
pages last.

### Toddler-facing drawing UI (highest priority — native touch app)

- [ ] **[Bug] Guard remaining ActionsPanel hover rules** — File(s): `src/lib/components/ActionsPanel.svelte`
  `.drawer-toggle:hover` (and its `:global(.drawer-toggle-icon)` variant) is still
  unguarded — same panel we just partly fixed. Wrap in `@media (hover: hover)`.

- [ ] **[Bug] Guard ColoringBook hover rules** — File(s): `src/lib/components/ColoringBook.svelte`
  `.coloring-back-button:hover` (+ icon variant) and `.coloring-tile:hover` change
  highlight state; a tapped coloring tile or the back button stays visually
  highlighted after selection. Wrap each in `@media (hover: hover)`.

- [ ] **[Bug] Guard ColorPicker hexagon hover** — File(s): `src/lib/components/ColorPicker.svelte`
  `.hexagon:hover` and `.hexagon:hover::after` highlight the hovered swatch. On touch
  the last-tapped color stays enlarged/highlighted. Note this component also has a
  JS-driven `class:hover={hoveredHex === hex}` path (line ~119) — verify the desired
  active state comes from the class, then guard the CSS `:hover` with `@media (hover: hover)`.

- [ ] **[Bug] Guard AiImagePrompt style-option hover** — File(s): `src/lib/components/AiImagePrompt.svelte`
  `.ai-style-option:hover:not(:disabled) .ai-style-thumb` and `… .ai-style-label`
  leave the last-tapped art-style option looking selected. Wrap in `@media (hover: hover)`.

- [ ] **[Bug] Guard AiImageResult download hover** — File(s): `src/lib/components/AiImageResult.svelte`
  `.ai-result-download:hover` changes background; sticks after tap on native. Wrap in `@media (hover: hover)`.

- [ ] **[Bug] Guard modal-close-btn hover** — File(s): `src/app.css`
  `.modal-close-btn:not(:disabled):hover .modal-close-icon` — global rule for the
  modal close button shown across native dialogs. Wrap in `@media (hover: hover)`.

### Parent Center (medium — reachable on-device)

- [ ] **[Bug] Guard ParentCenter hover rules** — File(s): `src/lib/components/ParentCenter.svelte`
  `.parent-help-button:hover` (+ icon variant) and `.parent-help-close:hover`.
  Wrap in `@media (hover: hover)`.

- [ ] **[Bug] Guard parent settings control hovers** — File(s): `src/lib/components/parent/ToggleRow.svelte`, `src/lib/components/parent/SetupInstructions.svelte`, `src/lib/components/parent/AiKeyManager.svelte`, `src/lib/components/parent/AboutTab.svelte`, `src/lib/components/TabPager.svelte`
  ToggleRow `.toggle-switch:hover` / `.toggle-switch.active:hover` / `.toggle-switch:disabled:hover`;
  SetupInstructions `.help-section summary:hover`; AiKeyManager `.access-code-submit:hover`
  and `.access-code-submit.forget:hover`; AboutTab link hovers; TabPager `:global(.tab-button:hover)`.
  Wrap each in `@media (hover: hover)`. (Link/`:disabled` hovers are low-risk but
  worth doing in the same sweep for consistency.)

### Web-only (lowest — desktop/mouse, not in native bundle)

- [ ] **[Polish] Guard admin/dev/static hover rules** — File(s): `src/lib/components/admin/AdminConsole.svelte`, `src/routes/privacy/+page.svelte`, `src/routes/dev/ai-timer/+page.svelte`
  AdminConsole (`a.crumb`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.invite-url`),
  the privacy `.back` link, and the dev ai-timer harness (`a.crumb`, `button`). These
  are web-only desktop surfaces so the sticky-hover bug is unlikely to bite, but
  guarding them keeps the pattern uniform. Low priority / optional.
