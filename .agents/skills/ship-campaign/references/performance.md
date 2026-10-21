# Performance campaigns

Read this before preflight when the campaign runs under the performance profile, and only then. The
profile applies when the caller passes `profile=performance`, and also when any queued unit needs
the physical device rig or is a causal performance cluster, whether or not the caller named it. A
queue that mixes device work with device-free work is still a performance campaign: its device-free
units run in the device-free lane below.

Everything in `SKILL.md` still holds. This file covers only what running device units in an
unattended queue adds. What a device session needs to know lives where every one reads it: the
`profiling` skill and `docs/PROFILING.md` for the evidence a performance unit must carry and the
device traps. A performance cluster is a free-form unit: its spec is the cluster's hypothesis and
the number that would change the decision, and the performance tracking issue carries the ledger.

## Preflight additions

* **Prove the devices with the user present.** Install a probe Release and run one known-good
  control replay on each device while the user can still unlock it, end Guided Access, or reseat a
  cable. Ask the user to leave the devices awake and unlocked. A unit whose device the preflight
  could not prove moves out of the queue now.
* **Settle the human-only device steps first.** An OS update, a finger capture, or a watched probe
  changes which units can run tonight, so ask about them before proving the devices.

## Two lanes and the rig lock

Device units run one at a time in the device lane. Units that need no device may run beside them in
a device-free lane, but only behind one rig lock, because no capture may overlap heavy host work.

Use one lock directory outside every worktree, such as the session's scratch directory:

* Acquire with an uncapped `until mkdir "$L" 2>/dev/null; do sleep 20; done`. Only after that
  `mkdir` succeeds, write an owner line naming the unit, the purpose, and the time.
* Release with `rm "$L/owner"; rmdir "$L"`, on every path, failures included.
* **Only the orchestrator reclaims a stale lock, and never a waiter.** A unit killed mid-window
  leaves the directory behind, and the uncapped loop would then wait forever. Whenever a unit ends,
  however it ends (a report, a quarantine, or a crash), check the lock. If its owner line still
  names that unit, remove it. A directory with no owner line means a holder died between its `mkdir`
  and writing the owner line, which it does immediately. If it still has no owner line a minute
  later, remove it too. A waiter cannot tell a crashed holder from a long capture, so it keeps
  waiting.
* A device unit holds the lock per capture window (a native build counts), and a device-free unit
  per heavy command (`check`, `lint`, a test suite, a build). Nobody holds it across a CI or
  reviewer wait.
* Tell every unit that a device unit may hold the lock for an hour, so it plans for that wait.

On 2026-09-25 one unit's capped retry loop wrote its owner line without acquiring the lock, then
removed the directory, releasing a capture unit's lock mid-sweep. That left 34 minutes of Android
sweeps running beside host checks, and the one red they produced had to be recaptured.

## Rig facts are campaign state

Units change the rig for the units after them: a native A/B replaces the installed app build. Keep
these facts current in one place, and hand every device unit the current copy along with the device
ids, the resolved ports, and which services the campaign owns or borrows.

Give every device unit a timebox: when its device work must stop, and when its merge gate must
finish, both ahead of the deadline reserve. A candidate that wins but runs out of time ends as a
draft PR carrying its A/B evidence.

## Rules during the run

* **Device loss ends device work.** When the rig drops and the documented non-human recovery does
  not restore it, stop capturing. Continue with queued units that need no device, or wrap up.
  Evidence-only or harness-only PRs are never a substitute for the product work the rig was meant to
  measure.
* **One target gets a bounded share of the night.** After about eight hours on the same performance
  target without reaching it, record the best measured version as its outcome and move on; further
  marginal tuning belongs to a later campaign that starts with a new hypothesis.
* **The ledger separates product, harness, and evidence commits.**

## Morning report additions

* Say plainly whether any product change landed.
* Give each target's measured number before and after the campaign.
* End with the rig's state: each device, whether it is attached and unlocked, and the build
  installed on it.
