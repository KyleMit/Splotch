# Handoff — scoped pinch-zoom unlock

> 2026-07-22 · branch `claude/pinch-zoom-a11y-vkbl7s` · unlock browser zoom off the drawing page
> (tier 1) + scoped Parent-Center pinch zoom (tier 2), with automated tests; supersede ADR-0041 when
> done

## Objective & non-goals

Clear the recurring a11y-audit flag (`[user-scalable="no"]`, the only Lighthouse a11y deduction —
score 92) without giving toddlers a zoomable canvas:

* **Tier 1** — remove `user-scalable=no` and `maximum-scale=1.0` from the viewport meta
  (`web/src/app.html:12`; keep `width=device-width, initial-scale=1.0, viewport-fit=cover`). The
  drawing page stays zoom-locked by its existing element-level layers: `touch-action: none` on
  `body` (`web/src/app.css:209`) and the engine's touch `preventDefault`
  (`web/src/lib/drawing/engine.ts:1022`). `/privacy` (already `touch-action: auto` on itself,
  `web/src/routes/privacy/+page.svelte:135`) and `/admin` become genuinely browser-zoomable.
* **Tier 2** — give low-vision parents zoom *inside* the drawing page's parent-facing overlays via
  the existing scoped, transform-based `pinchZoom` action
  (`web/src/lib/actions/pinchZoom.svelte.ts`, currently only on the AI image preview). Target: the
  Parent Center content pane (`web/src/lib/components/ParentCenter.svelte`), incl. setup
  instructions. It resets when the overlay closes, so no zoom state ever leaks back to the canvas.
* **On completion**: write a superseding ADR via `/create-adr` and mark ADR-0041 **Superseded** —
  ADR-0041 explicitly anticipated this change ("Rejected alternative: scope the zoom lock to the
  canvas only… should be revisited and superseded"). Update every comment that cites the page-wide
  lock: `web/src/app.html:5`, `web/src/lib/components/aiPreview.ts:26`,
  `web/src/lib/actions/pinchZoom.svelte.ts:17`, `web/tests/multitouch.spec.ts` header — grep
  `ADR-0041` and `user-scalable` repo-wide.

**Non-goals:** no browser-viewport zoom anywhere on `/` (see decision below); no pinch-zoom of the
canvas *content* as a drawing feature (tier 3 — rejected for the 2+ audience); do not weaken the
`touch-action: none` / engine `preventDefault` layers — after tier 1 they are the *only* lock.

## State

Planning-only handoff — **no implementation commits yet**. Branch `claude/pinch-zoom-a11y-vkbl7s`
contains only this doc. The analysis it records came from reading the current `main`-derived tree;
no files touched.

## Decisions made (and why)

* **Per-route split, not per-region-within-`/`.** There is **no JS API to reset browser zoom** — if
  browser zoom were allowed only in a Parent-Center overlay, a parent who zooms and closes it leaves
  the *page* (canvas) zoomed with no programmatic recovery, which is exactly the disorientation
  ADR-0041 guards against. Hence: browser zoom stays fully off on `/` (element-level), and overlays
  get app-controlled CSS-transform zoom instead (tier 2).
* **Removing the meta attributes is what clears the audit.** Lighthouse/axe flag the meta tag itself
  (`user-scalable=no` *or* `maximum-scale` < 5) and never test gesture behavior; element-level locks
  neither trigger nor clear it. Both attributes must go.
* **The meta is already mostly decorative on iOS Safari** (it has ignored `user-scalable=no` for
  pinch since iOS 10), so in-browser iOS behavior barely changes — layers 2–3 are today's real lock.
* **`touch-action` multi-finger veto makes the canvas lock robust:** a browser pinch proceeds only
  if *every* touch point lands in a region allowing it; one finger on `touch-action: none` vetoes
  the gesture. Supported for pinch suppression well below the repo floor (Safari 16.4 / Chrome 111 —
  `docs/COMPATIBILITY.md`).
* **Tier 2 reuses `pinchZoom` rather than a new mechanism** — it's confined to one element, keeps
  the surface un-transformed for stable coordinates, and resets via `enabled`/`resetKey`
  (`web/src/lib/components/AiImageResult.svelte:114` is the wiring + CSS worked example).

## Automated testing plan (required part of the work)

* **E2E (Playwright, `web/tests/`):**
  * Meta assertion: viewport meta contains neither `user-scalable=no` nor `maximum-scale` — follow
    the meta-checking pattern in `web/tests/page.spec.ts:13`.
  * Canvas still zoom-proof: extend `web/tests/multitouch.spec.ts` (its spread-gesture strokes
    already prove drawing wins) to also assert `window.visualViewport.scale === 1` after the spread,
    and fix its header comment (it currently credits `user-scalable=no`).
  * Tier 2: open Parent Center, synthesize a two-pointer pinch on the content pane, assert the
    target gets a `transform`/`.zoomed` class, then close + reopen and assert it reset.
  * `/privacy`: assert the page is zoom-permitting (e.g. computed `touch-action` of its scroll
    container is `auto`).
* **Unit (Vitest):** `createPinchZoom` math is already covered
  (`web/src/lib/components/aiPreview.test.ts:82`); extend only if tier 2 adds options (e.g. a
  min/max scale or double-tap reset for text panes).
* **Lighthouse:** after tier 1, run the `lighthouse-audit` skill and confirm the a11y score reaches
  100 on both form factors (was 92 with the single `[user-scalable]` deduction); commit the report
  per that skill's flow.
* Gate: `npm test` + `npm run check` green before PR.

## Unverified assumptions

* Removing the meta causes **no behavior change on `/` in real mobile browsers** — reasoned from
  spec + floor, not device-tested. Specifically check iOS Safari **double-tap smart zoom** with only
  `touch-action: none` in play; if it sneaks through, add a `gesturestart` `preventDefault` fallback
  (page-level, `/` only).
* **Native shells (WKWebView / Android WebView) currently respect the meta**, so tier 1 needs a
  native regression pass (Maestro smoke or manual — `testing` + `mobile` skills). Capacitor may have
  its own webview zoom behavior/config; not investigated.
* Zoomed `/admin` renders acceptably — `web/src/lib/safeArea.ts:27` notes fixed positioning resolves
  against the *layout* viewport, so pinch-zoomed fixed UI can look odd. Parent-only page; cosmetic
  issues are acceptable, breakage is not.
* Playwright can synthesize a real two-pointer pinch for the tier-2 test (may need CDP
  `Input.dispatchTouchEvent`; `multitouch.spec.ts` sidesteps this via the `/dev/engine` harness's
  synchronous multi-stroke API — a `/dev` harness hook for Parent Center zoom is a fallback).
* `/admin` has no `touch-action` ancestor lock of its own (only `/`'s body rule was audited closely)
  — verify `touch-action` on admin's containers before asserting it zooms.

## Done & verified

* Nothing implemented or run yet beyond code reading. Analysis verified against source: the three
  lock layers, the audit trigger, `pinchZoom`'s scoping, and floor support are all cited to
  file:line above. No test suite was run this session.

## Risks & next 3 steps

Risks: toddler-facing regression if the element-level lock has a hole the meta was papering over
(mitigate with the multitouch E2E + on-device check); native shells silently relying on the meta;
tier 2 gesture conflicting with Parent Center scrolling (the pinchZoom action only intercepts at
`pointerCount >= 2` or while zoomed — verify scroll still works one-fingered).

1. **Tier 1:** edit the `app.html` meta + its comment, update the `multitouch.spec.ts` comment, add
   the meta + `visualViewport.scale` E2E assertions, run `npm test` / `npm run check`, commit.
2. **Tier 2:** wire `use:pinchZoom` into the Parent Center content pane (pattern from
   `AiImageResult.svelte:114`, incl. its `touch-action`/`.zoomed` CSS notes), reset on close via
   `enabled`/`resetKey`, add the E2E (+ any unit) coverage, commit.
3. **Close out:** run `lighthouse-audit` to confirm 100, do the on-device/native checks under
   Unverified assumptions, then `/create-adr` for the superseding ADR (mark 0041 Superseded, sweep
   the `ADR-0041`/`user-scalable` references). PR with `pr-screenshots` conventions (UI-visible
   change: show Parent Center zoomed state).

## Reread first

* `docs/adrs/0041-lock-viewport-zoom-for-toddlers.md` — esp. the rejected-alternative section this
  work implements
* `web/src/app.html:5-13` · `web/src/app.css:190-213` · `web/src/lib/drawing/engine.ts:1022`
* `web/src/lib/actions/pinchZoom.svelte.ts` · `web/src/lib/components/aiPreview.ts:90` ·
  `web/src/lib/components/AiImageResult.svelte:114`
* `web/src/lib/components/ParentCenter.svelte` (tier-2 target)
* `web/tests/multitouch.spec.ts` · `web/tests/page.spec.ts:13`
* `docs/COMPATIBILITY.md` · skills: `testing`, `lighthouse-audit`, `mobile`, `create-adr`,
  `pr-screenshots`
