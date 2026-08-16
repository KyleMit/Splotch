# ADR-0120: The Native Smoke Is a Boot Check, Not a UI Flow

**Status:** Active **Date:** 2026-08 (amends [0008](0008-three-tier-testing-strategy.md))

## Context

The Maestro flow in `.maestro/smoke.yaml` is the third tier of ADR-0008 and the only test that
installs the built artifact on a device and launches it. `android-deploy.yml` and `ios-deploy.yml`
run it on `v*` tag pushes and on manual dispatch — tag-only because an emulator job and a macOS
runner are the most expensive things in this CI.

It kept growing past that launch check. Over time the flow opened Settings, drilled into About,
tapped the version string five times to reveal a hidden Admin link, followed it, and asserted the
admin console painted. Every one of those steps broke:

| Tag              | Broke at         | Because                                                                                                                       |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| v1.3.0 · 2026-07 | `tapOn: 'Admin'` | [ADR-0101](0101-admin-console-is-web-only-and-unlinked.md) deleted the reveal gesture, the link, and `/admin/native` outright |
| v1.4.0 · 2026-07 | `tapOn: 'About'` | the tab pager became a section list, so "Parent Center" no longer led anywhere                                                |
| v1.5.0 · 2026-08 | `tapOn: 'About'` | the list outgrew the fold — About is the last of eleven sections                                                              |

Three releases shipped through a red gate. Nothing surfaced it, because a tag push is the one CI
event with no audience: no PR to annotate, no reviewer waiting on checks.

Worth stating plainly: **the app was fine every time.** Build, install, launch and WebView render
passed in all three runs. What failed was the flow's model of a UI that had moved.

Two properties make this drift structural rather than careless. Maestro selects by accessibility
label from YAML, so nothing in the type system, the linter, or the E2E suite connects a selector to
the component that carries it. And its text selector matches the **whole** string, so a label that
merely gains a sibling inside the same element silently stops matching — the "About" hub row now
carries a "Version 1.5.0" subtitle, and that alone is enough. A local reproduction on an iPhone 17
Pro simulator confirmed the scroll reached the row and Maestro still would not match it.

**And on iOS the rows cannot be tapped at all, whatever they are called.** Dumping the hierarchy
with Settings open shows WebKit reporting frames for the hub rows in an unscrolled coordinate space:
each row comes back roughly 408pt tall, overlapping its neighbours, extending past the 402pt screen
width. "Tool Drawer" reports a centre of y≈185pt while it sits at y≈272pt, so Maestro taps the row
above it — observed, not inferred: the tap left the hub scrolled to the top having drilled into
nothing. Naming the row exactly (an `aria-label` carrying just the section label) fixes the *name*
and leaves the *frame* just as wrong, so it does not rescue the tap. This is the same wall commit
695a6762 hit in June, when tapping the About tab "never fires its click" in the WKWebView. Any
future attempt to drive this UI on iOS starts from here.

Alternatives considered:

1. **Repair the navigation and keep going.** Rejected: it is the fourth repair of the same class,
   and it leaves the feedback loop — break on a PR, learn at a tag — exactly as it was.
2. **Repair it, and add a drift-guard test over every string the flow names.** Rejected as the
   primary fix: a guard over a long flow has to model section lists, rendered copy, and heading text
   across many components, which is a second thing to keep true. Worth it only for a vocabulary
   small enough to state.
3. **Delete the native smoke entirely.** Rejected: it is the only check that the shipped `.aab` and
   `.ipa` boot at all. Its launch assertion never drifted — it caught nothing here because there was
   nothing to catch, not because it was weak — and losing it means a white screen on launch reaches
   store users.
4. **Keep one navigation: follow the About section's Privacy Policy link, so the store-required page
   is proven reachable on a device.** Rejected on evidence, not preference — the tap above cannot be
   landed on iOS. The property it was reaching for is real, and moves to the build instead (below).
5. **Trim the flow to the launch check and treat that as its whole job.** **Chosen.**

## Decision

The native smoke launches the installed app, waits for the UI to paint, and stops.

* `.maestro/smoke.yaml` is `launchApp` with `clearState`, `extendedWaitUntil` on the accessibility
  label of the corner Settings button (`web/src/lib/components/SettingsButton.svelte`), and a
  screenshot. Every navigation step is deleted, including the whole ADR-0101 admin sequence that had
  been driving a surface deleted months earlier.
* **This flow does not navigate the UI.** Coverage of what the UI *does* belongs in Playwright,
  which runs on every push and can select elements structurally instead of by label text. The
  question reserved for this tier is the one only a device can answer: does the shipped artifact
  boot and paint?
* `tools/tests/native-smoke-flow.test.mjs` reads both sides on every push. It fails when the flow
  selects a string no literal `aria-label` under `web/src` declares, and when a selector contains
  regex metacharacters — a `.*` on the end would let a label absorb a sibling and keep matching,
  which is exactly the failure that hid the About break. The guard is affordable *because* the flow
  is one selector long; alternative 2 is what it looks like when it isn't.
* Both deploy workflows file the failure. On a **tag** push (not a manual dispatch, where someone is
  already reading the result) a failing job opens a platform-specific issue via `gh`, or comments on
  the open one, so a red gate announces itself instead of waiting to be noticed. This is the same
  check-then-create shape `test.yml`'s post-merge WebKit gate uses, for the same reason.
* **Route reachability is asserted at build time instead**, in
  `tools/mobile/check-static-bundle.mjs` (`postbuild:cap`). `requiredNativePageProblems` already
  required `privacy.html` and `changelog.html` to survive `NATIVE_EXCLUDED_ROUTES` into the static
  export; `requiredNativePageLinkProblems` adds the half that was missing — a page that ships but
  that nothing links to is unreachable, and for the privacy policy reachability *is* the store
  requirement. It matches on the `href="…"` prefix in the client bundle's `.js` chunks, because the
  route manifest lists every route as a bare path whether or not anything links there, and a
  prerendered page contains its own path.

The invariant to keep: a failure here now means a genuine boot regression in the shipped artifact.
Adding a navigation step gives that signal back its old ambiguity, where red meant "the app is
broken" or "the UI moved" and only a human could tell which.

## Consequences

* \+ The gate reports on the app rather than on the flow's memory of the UI. Red means the shipped
  artifact does not boot.
* \+ The drift class is gone by construction: with no navigation, there is no section list, heading,
  or body copy left to rot against.
* \+ A red tag gate raises its own hand, closing the gap that let three releases ship past one.
* \+ Both jobs get shorter and steadier — no swipes, no scroll heuristics, no waiting on a modal to
  settle inside a WebView.
* − Real native-only UI regressions past the first paint are now uncovered on device. A tap that
  works in Chromium and dies in a WKWebView — the class ADR-0016's admin step was originally written
  against — will not be caught before release.
* \+ Route reachability moved to the build, where it is checked on every native build instead of
  once per release tag, and where it can be stated as a property rather than driven as a gesture.
* − Route reachability is now proven structurally rather than by rendering: the build asserts the
  page ships and that the bundle links to it, not that a WebView paints it when tapped.
* − The guard test knows one vocabulary, `aria-label` literals. A future step selecting rendered
  copy would need it extended, and the guard cannot tell that apart from a selector that is simply
  wrong.
