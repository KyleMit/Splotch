# Popover API for the Actions Panel flyouts — re-evaluation evidence

> Working notes from the August 2026 pass on issue
> [#894](https://github.com/KyleMit/Splotch/issues/894), the re-evaluation gate on replacing the
> Brush Menu / Stroke Width flyouts' hand-rolled open state and outside-tap dismissal with
> `popover="auto"`. The standing decision lives in `docs/COMPATIBILITY.md`'s API risk register; this
> is the evidence chain behind it, including the measurements that decide it.

## Executive result

Neither branch of the gate opens.

The floor branch fails by a wide margin, and by more than the issue assumed: the Popover feature did
not reach Safari on iOS until **18.3**, not 17, so the gate's "Safari/iOS 17" line understates the
distance from the enforced iOS 16.4 floor by two major versions.

The progressive branch fails on placement. `popover` promotes the menu to the top layer, where its
containing block becomes the viewport rather than the `position: relative` trigger wrapper the three
existing placements are written against. Measured in Chromium, every layout lands off-target and two
land off-screen entirely. The only declarative repair is CSS anchor positioning, which reached
cross-engine support just seven months ago (Firefox 147, January 2026) and is further above the
floor than popover itself. A dual path would therefore carry **two placement systems**, not one
placement system plus a capability check — and because the native iOS floor is 16.4, the fallback
path would stay live on the flagship drawing device rather than fading out.

Two findings are worth acting on immediately, and neither needs popover. The custom flyouts did not
close on **Escape**, and no close path handed **focus** back to the trigger — measured, a keyboard
pick left `document.activeElement` on `<body>` for both flyouts. Spec'd popover behavior covers both
(light dismiss on Escape, focus restoration on hide), and they were the whole of what the
browser-managed path did strictly better. Both are now closed directly in `ActionsPanel.svelte`,
covered by `flows-palette-brush.spec.ts`.

## Support data vs. the enforced floor

Floor from `web/browserTargets.ts`: `chrome111, edge111, firefox114, safari16.4, ios16.4`.

| Feature                | Chrome/Edge      | Firefox          | Safari          | Safari iOS      | Baseline                       |
| ---------------------- | ---------------- | ---------------- | --------------- | --------------- | ------------------------------ |
| Popover                | 116 (2023-08-15) | 125 (2024-04-16) | 17 (2023-09-18) | **18.3**        | newly available **2025-01-27** |
| CSS anchor positioning | 125 (2024-05-14) | **147**          | 26 (2025-09-15) | 26 (2025-09-15) | newly available ~Jan 2026      |

Sources: `api.webstatus.dev/v1/features/popover` (the Baseline record — its `low_date` is set by the
iOS 18.3 ship date) and the repo's own `caniuse-lite` data for anchor positioning
(`css-anchor-positioning`, caniuse-lite 1.0.30001799). Popover reaches Baseline *widely available*
around mid-2027; anchor positioning around mid-2028.

The gap that matters is not the desktop one. The native iOS app serves the web bundle to every
device that can install it, so at the 16.4 deployment target the browser-managed path would never
run on iPhone or iPad — the platform the drawing experience is tuned for.

## Method

The harness and its driver are committed beside this document — `popover-probe/harness.html` and
`popover-probe/probe.mjs`, run with `node docs/scratchpad/popover-probe/probe.mjs` — so the re-entry
trigger below can be re-measured on that era's engines rather than rebuilt from this prose. They are
frozen evidence rather than maintained automation: nothing imports them, and no npm script runs
them. The harness *copies* the app's CSS and its custom-path behavior rather than importing them, so
it cannot fail when the app changes — it can only stop resembling it. Its copy is pinned to a named
commit (ab2c7c12e0c4); diff that against `HEAD` before trusting a fresh run.

The harness reproduced the real flyout DOM and the geometry-relevant CSS verbatim from `app.css` +
`ActionsPanel.svelte` — `.actions-panel` fixed to the bottom-left, the collapsing
`.actions-drawer-inner`, two `position: relative` `.flyout-wrapper`s, and the three `.flyout-menu`
placements (landscape above the trigger, portrait beside it, phone-portrait beside it as a column).
Three variants were driven through the same scripted interactions in Chromium 149 (headless,
Playwright), at three viewports:

* **custom** — the shipped app: `hidden` toggled from a `pointerup` activation, the document-level
  `pointerdown` outside-close, the Escape close, and `closeFlyout`'s focus hand-back. It tracks the
  component *including* the two fixes below, so the behavior table is a live parity check rather
  than a record of the pre-fix state.
* **popover** — the same markup with `popover="auto"`, shown and hidden imperatively from the same
  `pointerup` handler.
* **popover + anchor** — the popover variant with `anchor-name` / `position-anchor` and `anchor()`
  insets replacing the wrapper-relative placement.

The popover variants needed two CSS repairs before they even rendered plausibly, both worth noting
because they are adoption cost rather than harness noise:

* `.flyout-menu { display: flex }` outranks the UA sheet's `[popover]:not(:popover-open) { display:
  none }`, so a *closed* popover keeps laying out and covers its own trigger — Playwright's click
  was intercepted by the menu's first option.
* The UA sheet's `[popover] { inset: 0 }` leaves `top`/`right` set, over-constraining the author's
  `left`/`bottom` placement; the menu pins to the top edge until both are reset to `auto`.

## Findings

### Placement (menu box, viewport coordinates; trigger at x=100)

| Viewport               | custom   | popover                      | popover + anchor |
| ---------------------- | -------- | ---------------------------- | ---------------- |
| landscape 1024×768     | 100, 620 | 0, **−80** (off the top)     | 100, 620         |
| portrait 768×1024      | 168, 944 | **776**, 952 (off the right) | 168, 944         |
| phone portrait 390×844 | 168, 632 | **398**, 640 (off the right) | 168, 632         |

`popover` alone breaks all three placements: `bottom: calc(100% + 8px)` and `left: calc(100% + 8px)`
resolve against the viewport, so the menus leave the screen. With anchor positioning the geometry is
byte-identical to today's in every viewport — the declarative replacement genuinely exists, it just
needs the second, newer feature to work.

### Behavior parity

| Scenario                                  | custom                                                 | popover            |
| ----------------------------------------- | ------------------------------------------------------ | ------------------ |
| Outside tap dismisses                     | ✅ (document handler)                                  | ✅ (light dismiss) |
| Mutual exclusion (open one, other closes) | ✅ (shared state slot)                                 | ✅ (auto stack)    |
| Second tap on the same trigger closes     | ✅                                                     | ✅ — no reopen     |
| **Escape dismisses**                      | ❌ → ✅ **(gap, fixed here)**                          | ✅                 |
| **Focus returns to the trigger on close** | ❌ → ✅ **(gap, fixed here)**                          | ✅                 |
| Escapes the drawer's `overflow: hidden`   | ❌ (moot — flyouts only open while the drawer is open) | ✅                 |

The second-tap case is the one with a hidden dependency. `popovertarget` — the declarative trigger
relationship that carries the anti-reopen logic — activates on `click`, and ADR-0038 moved every
Actions Panel button to `pointerup` activation because cancelling a stylus tap's touch stream
suppresses the synthesized click on iPadOS. So adoption would drive popovers imperatively and rely
on the app's capture-phase `pointerup` handler running before the UA's light dismiss. It does in
Chromium (recorded order: `app:pointerup-activate` → `ua:toggle closed→open`), but that ordering is
not something the app gets to specify, and **WebKit could not be tested here** — this sandbox has
Chromium only, and WebKit is the engine that matters most for Splotch.

### Code ledger

Adoption removes the document-level `pointerdown` outside-close (about ten lines) and the `hidden`
plumbing. It adds: a capability probe; imperative `showPopover`/`hidePopover` driven from component
state plus a `toggle` listener syncing the browser's dismissals back into it (the two-way boundary
the issue warns about); the two UA-sheet repairs above; an anchor-positioned placement for engines
that have it; and the current wrapper-relative placement retained for every engine that does not —
which, at the iOS 16.4 floor, is every native install.

That is strictly more surface than it deletes, and the deleted part is the part that already works.

## Standing decision and its trigger

Keep the custom implementation. Revisit when **both** of the following hold, since popover without
anchor positioning cannot place these menus:

* the enforced floor reaches Chrome/Edge 116, Firefox 125, Safari 17, **iOS 18.3**; and
* the floor also reaches anchor positioning (Chrome 125, Firefox 147, Safari/iOS 26) — or a measured
  JS positioner is shown to be simpler than the CSS it replaces.

Both are gated by the native iOS deployment target, so the practical trigger is a decision to raise
`IPHONEOS_DEPLOYMENT_TARGET` to 18.3+ — a support-floor move that needs its own ADR under
`docs/COMPATIBILITY.md`'s rules. Nothing about this evaluation argues for raising it: the floor
exists to keep 2017-era hardware drawing, and a flyout that already works is not a reason to drop a
device.
