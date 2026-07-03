# TODO

> Work through these items one at a time with `/fix-next-todo-manual`, or clear the whole list autonomously with `/fix-next-todo-auto`.
> After each fix: remove the completed item and run relevant type checks or tests.
> In manual mode, do **not** `git add` or `git commit` — the user reviews the diff first. Auto mode commits to its own branch/PR.

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
