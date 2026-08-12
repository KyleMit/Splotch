# Handoff — iPad/WebKit validation

> 2026-08-12 · branch `codex/ipad-webkit-validation-handoff` · Reconcile and close the iPad, iPadOS
> Safari, native WKWebView, and desktop WebKit verification gaps called out in recent PR and issue
> bodies.

## Objective & non-goals

Determine which of the body-level validation gaps below still exist, run the smallest authoritative
checks for the survivors, and record the evidence where future readers will find it. Preserve the
distinction between desktop Playwright WebKit, iPad Safari, and the native Capacitor WKWebView.

**Non-goals:** do not reimplement the associated product changes by default, treat merged or closed
state as proof that device verification happened, rerun a superseded experiment, or post GitHub
updates before checking comments and later linked work for existing evidence.

## State

* Branch: `codex/ipad-webkit-validation-handoff`
* PR: none
* Files touched: this packet only

| Commit                  | What                                            |
| ----------------------- | ----------------------------------------------- |
| None before this packet | Research-only session; no product code changed. |

The inventory covers every PR and issue created from 2026-07-29 through 2026-08-12 whose body
explicitly called out missing iPad/WebKit verification, plus two qualified partial matches. GitHub
search returned 204 PRs and 133 issues in that interval; the bodies, creation dates, and current
open/closed/merged states below were checked on 2026-08-12.

### Direct body callouts

| Created | Item and current state                                                   | Verification gap recorded in the body                                                                                                                                     |
| ------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aug 12  | [PR #964](https://github.com/KyleMit/Splotch/pull/964) · open            | Only Chromium was installed; the AI-result sizing change was not exercised in WebKit.                                                                                     |
| Aug 11  | [PR #957](https://github.com/KyleMit/Splotch/pull/957) · merged          | Desktop WebKit passed, but the physical-iPad coloring/screenshot action sweep could not run because the iPad was locked.                                                  |
| Aug 11  | [PR #956](https://github.com/KyleMit/Splotch/pull/956) · closed unmerged | No WebKit/Safari environment was available; the supported-Safari side of the Fetch Priority experiment was not measured.                                                  |
| Aug 11  | [PR #947](https://github.com/KyleMit/Splotch/pull/947) · merged          | WebKit passed on an HTTP origin, but the native `blob:capacitor://` origin and a real end-to-end report remained unverified.                                              |
| Aug 11  | [Issue #949](https://github.com/KyleMit/Splotch/issues/949) · open       | The iOS object-URL flow is explicitly unverified because neither a simulator nor a device was reachable; the body contains the decisive console probe and real-iPad flow. |
| Aug 11  | [PR #943](https://github.com/KyleMit/Splotch/pull/943) · merged          | The popover trigger/light-dismiss relationship worked in Chromium, but WebKit was untestable in the sandbox.                                                              |
| Aug 10  | [PR #919](https://github.com/KyleMit/Splotch/pull/919) · merged          | WebKit was the engine exhibiting the Settings-fill failure, but the local WebKit project was untested; CI was named as the remaining check.                               |
| Aug 7   | [Issue #850](https://github.com/KyleMit/Splotch/issues/850) · open       | Whether `UIRequiresFullScreen` still enforces the intended orientation behavior under current SDK/iPadOS Split View was not confirmed.                                    |
| Aug 5   | [PR #790](https://github.com/KyleMit/Splotch/pull/790) · merged          | The Settings pinch result was measured in Chromium; iOS Safari was explicitly unverified.                                                                                 |
| Aug 5   | [PR #788](https://github.com/KyleMit/Splotch/pull/788) · merged          | The Clear-button Scribble guard was not verified with an Apple Pencil on real hardware.                                                                                   |
| Aug 3   | [PR #739](https://github.com/KyleMit/Splotch/pull/739) · merged          | Physical-iPad Safari and native WKWebView cold-open audio timing remained uncaptured; Mac WebKit was only a proxy.                                                        |
| Aug 3   | [PR #729](https://github.com/KyleMit/Splotch/pull/729) · closed unmerged | The earlier audio attempt records the same missing physical-iPad Safari/WKWebView timings and an offline registered device.                                               |
| Aug 2   | [PR #720](https://github.com/KyleMit/Splotch/pull/720) · merged          | Physical-iPad plus Apple Pencil verification remained the final check for reliable swatch taps.                                                                           |
| Aug 1   | [Issue #683](https://github.com/KyleMit/Splotch/issues/683) · closed     | The WebKit per-surface flush threshold had not been narrowed on a physical iPad; grid shapes were untested and the existing tile-count results were single runs.          |

### Qualified partial matches

| Created | Item and current state                                          | Qualification                                                                                                                                                               |
| ------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aug 1   | [PR #698](https://github.com/KyleMit/Splotch/pull/698) · merged | Its caveat says desktop WebKit catches catastrophes but does not replace real-iPad validation; it does not name a single missing product check.                             |
| Jul 31  | [PR #682](https://github.com/KyleMit/Splotch/pull/682) · merged | Extensive physical-iPad evidence existed, but the final recapture after later refinements could not start; the body deliberately retained older source-attributed evidence. |

## Decisions made (and why)

* Keep closed, unmerged, and merged items in the packet. The requested evidence is what their bodies
  disclosed at creation time, not their current mergeability.
* Keep both audio PRs. PR #739 revived PR #729 on the same evidence base, and each body
  independently preserves the physical-device gap. One current-head device run should reconcile
  both; do not run the abandoned head as a second product validation.
* Keep PRs #698 and #682 separate as qualified cases. The former states a fidelity limit rather than
  a failed check; the latter has real-device evidence but lacks the final recapture.
* Exclude generic statements such as "physical-device profiling was not run" when no particular
  iPad/WebKit result was identified, and exclude ordinary acceptance criteria that merely request a
  future device test.
* Treat desktop Playwright WebKit, MobileSafari, and the Capacitor WKWebView as different evidence.
  Passing one must not be reported as passing another.

## Unverified assumptions

* Only PR and issue **bodies** were audited, per the request. Comments, review threads, Actions
  artifacts, later commits, and linked follow-up PRs may already contain evidence that retires a
  gap.
* Current states were fetched on 2026-08-12, but no conclusion was drawn from state alone. In
  particular, closed Issue #683 and merged PR #682 may have been superseded by later iPad work.
* PR #919 may already have received the CI WebKit result it named as outstanding; its checks and
  merge commit were not audited.
* PR #956 and PR #943 describe rejected or deferred browser experiments. Their WebKit gaps may be
  intentionally dormant rather than work worth performing.
* The physical iPad, Apple Pencil, signing setup, native build, and Web Inspector connection have
  not been checked for availability in this session.

## Done & verified

* Queried the complete two-week interval in four bounded date slices to avoid GitHub's 100-result
  cap: 204 PRs and 133 issues.
* Scanned every returned body for explicit unverified, untested, unavailable-device, fidelity-limit,
  and missing-measurement callouts involving iPad, iPadOS/iOS Safari, WKWebView, or WebKit.
* Re-fetched the selected items to verify title, body, creation date, URL, and current state.
* Classified 14 direct matches and two qualified partial matches.
* No repository tests, device runs, CI checks, PR comments, or issue comments were performed.

## Risks & next 3 steps

1. **Reconcile before rerunning.** Read comments, linked PRs/issues, and later verification for all
   16 items. Mark each gap `retired`, `still live`, or `intentionally dormant`, with the exact
   evidence URL. Check PR #919's CI first and compare later iPad performance work against PR #682
   and Issue #683.
2. **Batch the surviving physical-device checks.** In one prepared iPad session, prioritize the open
   issues: run Issue #949's native object-URL probe and real report, then Issue #850's Split View
   and orientation matrix. If still live, add the context-loss action sweep (#957), pinch (#790),
   Clear and swatch Apple Pencil checks (#788/#720), and Safari/native cold-open audio timing
   (#739).
3. **Close the evidence loop.** Run only the surviving desktop WebKit checks (#964, #919, and any
   deliberately reopened #956/#943 experiment), then update the owning open issue or PR with exact
   environment and results. File a focused issue only when a merged PR has a live gap with no
   existing owner; do not use this transient packet as the backlog.

## Reread first

* [Mobile skill](../../.agents/skills/mobile/SKILL.md)
* [Profiling skill](../../.agents/skills/profiling/SKILL.md)
* [Testing skill](../../.agents/skills/testing/SKILL.md)
* [Physical-iPad profiling runbook](../PROFILING-IPAD.md)
* [Native architecture and storage](../MOBILE/native.md)
* [Browser/device compatibility contract](../COMPATIBILITY.md)
* [Issue workflow](../ISSUE-WORKFLOW.md)
