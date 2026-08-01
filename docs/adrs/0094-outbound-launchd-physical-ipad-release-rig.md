# ADR-0094: Run the Physical-iPad Release Rig as an Outbound launchd Publisher

**Status:** Active **Date:** 2026-08

## Context

ADRs 0079, 0083, and 0090 made physical-iPad engine and real-screen measurements executable, but
they still ran only when a person remembered the command. Shared CI cannot reproduce ADR-0085's
WebKit surface-flush cliff because it needs the real Apple GPU and display process. A scheduled rig
therefore needs the tethered Mac and iPad, repeated samples, and durable output.

Two orchestration models were considered:

* A public-repository self-hosted GitHub Actions runner would provide dispatch and an Actions UI,
  but it introduces an inbound arbitrary-code execution boundary on a maintainer's Mac. Restricting
  triggers to release tags and manual dispatch reduces exposure but does not make the host an
  appropriate general runner.
* A user launchd agent can poll trusted refs, execute only code already on `main` or an exact `v*`
  tag, and push a report through the existing scrapbook path. It has no listener and needs only the
  repository's normal outbound Git credential.

The physical measurements also need repeat discipline. The ADR-0085 follow-up showed materially
different tail values between identical single captures, so a quick scheduled tier may reduce
scenario coverage but cannot reduce the repeat count below three.

## Decision

Use the outbound launchd push model implemented by `scripts/install-ipad-release-rig.mjs` and
`scripts/perf/ipad-release-rig-job.mjs`. Do not register this public repository on the Mac as a
self-hosted runner.

Two user agents run from a dedicated clean clone:

* Sunday at 03:00, the fast job runs `multi-finger` and `crayon-scribbles` three times on current
  `origin/main`.
* Daily at 04:00, the release poll checks for an unseen `v*` tag. It creates a detached temporary
  worktree at that exact tag, installs its locked dependencies, runs every engine scenario three
  times, and runs the real production-route frame sweep with `perf:ipad:frames --drive` three times.
  A recorded completed-tag set prevents measuring the same release twice and queues every unseen tag
  oldest-first when multiple releases arrive between polls. Installation seeds that set with the
  releases that already exist, so enabling the rig does not backfill project history.

`scripts/perf/ipad-release-rig.mjs` is the measurement boundary. It resolves the selected device's
`ProductType` through `ideviceinfo` and rejects a configured-model mismatch, fewer than three
repeats, missing physical-device identity/model, incomplete scenario sets, zero commit samples,
device or OS drift, console errors, and hand-driven output in the unattended full tier. The
instrumented client exposes its compile-time app version and build time through the existing
release-stripped profiling seams. Every device page must match the bundle the rig just built, so an
old service-worker client or an uninstrumented/release bundle fails before publication.

Successful output is normalized by `scripts/perf/ipad-release-report.mjs`, then a freshly fetched
detached publication worktree promotes it through `npm run scrapbook:publish`, indexes it under
`scrapbook/performance/ipad-release-rig/`, commits, and pushes `HEAD:main`. The worktree is
discarded on success or failure, so a rejected push or intermediate generation error cannot dirty or
advance the control clone. The result records capture date, app version, commit and optional release
tag, neutral rig label, measured device model, iPadOS version, suite, scenario set, and repeat
count. The UDID remains only in the mode-0600 launchd configuration and ephemeral raw captures; the
personal device name remains only in raw captures. Both are removed from every Pages-ready JSON and
HTML artifact.

Security and operating invariants:

* The clone must be clean, on `main`, and fast-forwardable to `origin/main`. Release code must be an
  ancestor of `origin/main`. Tags are fetched into a dedicated remote-tracking namespace, so a
  deleted or locally invented tag cannot become scheduled executable input.
* The remote URL must not contain an embedded credential. Use SSH or the macOS credential helper;
  tokens never enter plist arguments, environment variables, repository files, or logs.
* The launch agents expose no port and accept no inbound job payload. Persistent logs redact the
  device UDID and replace the personal device name with a generic physical-device label.
* The iPad remains a physical hard gate. A disconnected/locked/backgrounded device fails the job; no
  simulator fallback exists.

## Consequences

* \+ Release-device evidence is collected and published without a person at the keyboard, while
  exact-tag provenance keeps a later `main` commit from being mislabeled as release evidence.
* \+ Fast cadence saves hardware time by cutting scenarios while retaining the three-repeat floor;
  full release runs preserve every scenario and the real-screen tier.
* \+ The machine has no public-repository runner listener or broad inbound execution surface.
* \+ Pages-ready reports remain comparable months later because device, OS, source, suite, and
  repeat metadata travel with the measurements.
* − The Mac must be awake with a logged-in user session, and the tethered iPad must remain unlocked
  with Safari foregrounded and Web Inspector enabled. launchd cannot bypass iOS device security.
* − The job needs outbound Git fetch/push access and executes `npm ci` in a trusted measurement
  checkout and disposable publication worktree; dependency installation can fail independently of
  the measurement.
* − `perf:ipad:frames --drive` gives reproducible unattended real-screen frame evidence but not a
  physical finger's coalescing/pressure signature. Trusted-input investigations still use
  `perf:ipad:xcuitest` under ADR-0084/0090.
