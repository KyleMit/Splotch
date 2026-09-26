# Performance campaigns

Read this before preflight when the campaign runs under the performance profile, and only then. The
profile applies when the caller passes `profile=performance`, and also when any queued unit needs
the physical device rig or is a causal performance cluster, whether or not the caller named it. A
queue that mixes device work with device-free work is still a performance campaign: its device-free
units run as ordinary units in the device-free lane below.

Everything in `SKILL.md` still holds. This file adds only what device work needs.

## What a performance unit is

`improve-performance-matrix` owns what a performance unit is: one causal product cluster, proven
with faithful A/B evidence on the release-gate rows, under its evidence and physical-device rules.
The campaign supplies the queue, the merge-as-you-go loop, and the ledger around it. Each cluster is
a free-form unit: its spec is the cluster's hypothesis and target cells, it has no issue to claim or
close, and the performance tracking issue carries the ledger.

Never queue a unit whose only purpose is to refresh or re-verify cells that are already folded. When
a cell was captured does not matter. A product fix brings its own fresh capture. A change that may
invalidate a finding gets flagged in the ledger rather than rushed, and the release-gate age limit
(ADR-0175) catches the rest.

## Preflight additions

* **The device preflight is mandatory**, with the user present. Run `start-capture-session`, the
  full `perf:preflight` it names, and one known-good control capture while the user can still unlock
  a device, tap an automation grant, or reseat a cable. Grants expire overnight, so ask the user to
  leave the devices awake and unlocked. A unit whose device the preflight could not prove moves out
  of the queue now.
* **Ask about the human-only device steps first.** An OS update, a finger capture, or a watched
  probe changes which units can run, so settle them before the rig takeover rather than after.
* **Record the rig facts** that every device unit is handed: device ids, the resolved ports, each
  service the campaign owns (with its pid) or borrows, and the installed app build with its hash.

## Two lanes and the rig lock

Device units run one at a time in the device lane. Units that need no device may run beside them in
a device-free lane, but only behind one rig lock, because a capture measures input cadence on a
quiet host: a parallel `check`, `lint`, test suite, or build must never overlap a capture window.

Use one lock directory outside every worktree, such as the session's scratch directory:

* Acquire with an uncapped `until mkdir "$L" 2>/dev/null; do sleep 20; done`, and write an owner
  line only after that `mkdir` succeeds.
* Release with `rm "$L/owner"; rmdir "$L"`, on every path, failures included.
* A device unit holds the lock per capture window (a native build counts), and a device-free unit
  per heavy command. Nobody holds it across a CI or reviewer wait.
* Tell every unit that a device unit may hold the lock for an hour, so it plans for that wait.

On 2026-09-25 one unit's capped retry loop wrote its owner line without acquiring the lock, then
removed the directory, releasing a capture unit's lock mid-sweep. That left 34 minutes of Android
sweeps running beside host checks, and the one red they produced had to be recaptured.

## What each device unit is handed

* `docs/PROFILING-CAMPAIGNS.md`, to read in full before its first capture, and the
  `improve-performance-matrix` evidence rules.
* The current rig facts. Keep them current between units, because units change them: a native A/B
  replaces the installed app build, and a harness merge can change an instrument fingerprint, so a
  resumed `perf:campaign` then needs `--accept-instrument-change`. Hand over the open release-gate
  red count too, so the unit can report before and after.
* A timebox: when its device work must stop, and when its merge gate must finish, both ahead of the
  deadline reserve. Past that, a winning candidate ends as a draft PR carrying its A/B evidence.

## Rules during the run

* **Device loss ends device work.** When the rig drops and the documented non-human recovery does
  not restore it, stop capturing. Continue with queued units that need no device, or wrap up.
  Evidence-only or harness-only PRs are never a substitute for the product work the rig was meant to
  measure.
* **One gate gets a bounded share of the night.** After about eight hours on the same release-gate
  cell without it passing, record the best measured version as that cell's outcome and move on;
  further marginal tuning belongs to a later campaign that starts with a new hypothesis.
* **A product change that also runs on a device the campaign cannot capture uses `Refs`, not
  `Fixes`.** Name the cells it may move on that device as unvalidated, in the PR and on the issue.
* **The ledger separates product, harness, and evidence commits.**

## Morning report additions

* Say plainly whether any product change landed.
* Give the open release-gate red count before and after the campaign.
* End with the rig-state block from `start-capture-session`: devices, ports, owned versus borrowed
  services, the installed build, and anything left set on a device.
