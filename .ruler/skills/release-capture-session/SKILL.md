---
name: release-capture-session
description: Release the physical iPad and Android capture rig — stop every capture-rig process any checkout of this repo owns (previews, probe hosts, Appium, the hold-awake watcher, inspector proxies, from this session or a previous one), drop the adb forwards they left, and put the phone back to its stock state, so the next start-capture-session begins from a clean rig. Use when asked to release, tear down, clean up, or reset the capture session or capture ports, to free the rig for a fresh session, or when a previous session's servers are still holding capture ports.
---

# Release capture session

The mirror image of `start-capture-session`. That skill reserves the rig and leaves it up when it
ends — verified and idle is its intended handoff, and `docs/PROFILING-CAMPAIGNS.md` says to leave
stay-awake, Appium, WebDriverAgent, and the preview serving *until a human says otherwise*. A user
explicitly invoking this skill is that human saying otherwise: it authorizes stopping capture-rig
processes owned by **every** checkout of this repo, not only this worktree, and reverting the phone
state the preflight wrote. Automatic skill loading alone is not that authorization — if the skill
loaded on its own, confirm before running the release.

What the authorization does **not** extend to, because the concurrent-worktree rule still holds:

* A listener from another project, or one whose working directory cannot be read. Unknown ownership
  is foreign ownership; the release reports it and leaves it running.
* The root-owned RemoteXPC tunnel (`tunnel-creation.mjs`). Stopping it needs a password and
  restarting it needs a GUI prompt an unattended session cannot answer. It is left up and the exact
  `sudo` command printed for the human.
* A live campaign or operator session. Killing one mid-cell corrupts what it was banking, so the
  release refuses and names the driver. Only pass `--stop-campaigns` when the user has said the
  campaign is abandoned.

## Run it

Run outside the sandbox with the runner's escalation mechanism, as the preflight is run: a sandboxed
`adb` cannot reach the host adb server, and a sandboxed `lsof` cannot read another user's process
working directories, so every listener would report as foreign and nothing would be released.

```sh
npm run perf:release -- --dry-run
```

Read the inventory before releasing anything. Each line carries a verdict — `ours`, `foreign`,
`tunnel`, or `campaign` — with the reason. Ownership is placement inside a checkout of this repo:
the main checkout, any worktree in `git worktree list`, or a pruned worktree whose process outlived
its directory. A `foreign` line naming a checkout you recognize means its cwd is unreadable from
where you are running; that is the sandbox, not a foreign process.

```sh
npm run perf:release
```

The order is deliberate. Drivers stop first (the `--hold-android-awake` watcher, and a campaign when
`--stop-campaigns` allows it) so nothing re-asserts what is being undone. Appium is drained next:
every WebDriverAgent session is `DELETE`d so WDA exits on the iPad, then the server is signalled.
Killing a forward under a live session once stranded a WebDriverAgent process on the device, and the
next launch failed with an error that named neither the port nor the stale process. Then the servers
— previews, probe hosts, floor controls, inspector proxies — each SIGTERMed as a process group and
SIGKILLed if it does not go. Anything still alive after that is listed under `STILL RUNNING` and the
command exits non-zero; do not report the rig released while that list is non-empty.

| Flag               | Effect                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `--dry-run`        | Inventory and verdicts only; stops nothing, writes nothing                                     |
| `--host-only`      | Stop host processes and drop forwards, but leave the phone's stay-awake, timeout, and rotation |
| `--stop-campaigns` | Also stop a live campaign or operator driver — only when the user has abandoned it             |
| `--json`           | Machine-readable report                                                                        |
| `--android-serial` | Pick the phone when more than one is attached                                                  |

## What the phone gets back

Unless `--host-only`, the release undoes every write `perf:preflight --wake-android` and
`--hold-android-awake` make, plus the rotation pair a crashed input check leaves pinned: stay-awake
off, the stock screen timeout (the preflight never records what it replaced),
`dumpsys battery
reset` for the forced-plugged override, and auto-rotate on. The adb forwards to
Chrome and WebView devtools sockets are removed; any other forward is listed and left.

**The consequence is the one the campaigns doc warns about: the phone will now sleep and lock.** A
locked phone with a passcode cannot be unlocked from the host, so the next `start-capture-session`
needs a person at the device. Say this in the wrap-up rather than leaving it to be discovered at the
next preflight. Nothing host-side changes the iPad: its Auto-Lock setting and the automation grant
are the human's, and the release only ends the WebDriverAgent sessions that were open.

## Ending

Finish with a **release-state block** in the reply, one line per row, so the next session inherits
facts rather than re-deriving them:

* what was stopped, by role and port, and which checkout owned it;
* what was left running and why — each foreign listener with its cwd, and the tunnel with the `sudo`
  command to stop it;
* anything blocked (a live campaign) and what the user decided about it;
* the phone: released to stock (and therefore will lock), or `--host-only` and still held awake;
* the adb forwards removed and any left.

A clean rig is the point: the next `start-capture-session` should find every canonical port free,
resolve nothing to an alternate, and prove the devices from scratch. If it does not, the survivor is
in this block.
