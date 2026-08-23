---
name: start-capture-session
description: Take over the physical iPad and Android capture rig at the start of a performance session — run the preflight, prove both devices will actually accept a capture, reclaim contended ports, and load the traps that produce plausible wrong numbers. Use before any physical-device profiling, capture campaign, or performance matrix run, and when picking up devices a previous session was using.
---

# Start capture session

There is one iPad and one Android phone, so capture sessions run **in sequence, not in parallel**. A
session that starts takes the rig over completely; the previous one is finished.

## Take the rig over

```sh
npm run perf:preflight -- --wake-android --verify-android-input --verify-ios-launch
```

Do not skip the two verifications on the grounds that the devices "were working a minute ago".
Everything else the preflight checks is host-side, and that is exactly how a blocked device reports
ready: enumeration, `ideviceinfo`, the tunnel, and every port check pass without ever launching an
app or delivering a touch.

| Flag                     | Proves                                                                         |
| ------------------------ | ------------------------------------------------------------------------------ |
| `--wake-android`         | The phone is awake and stays awake. **The only flag that writes to a device.** |
| `--verify-android-input` | A real touch reaches a page at usable cadence — about 20 s                     |
| `--verify-ios-launch`    | The iPad will accept a WebDriverAgent session — about a minute                 |

Fix whatever it blocks on before capturing anything. A blocked preflight exits non-zero and names
the cause; two of the likely ones need a human at the device and cannot be cleared from the host —
**Guided Access** (triple-click the side button, enter the passcode, End) and a locked phone.

## Reuse what cost a human, reclaim what is cheap

The repo's concurrent-worktree rule — never stop a listener another session owns — is written for
parallel agents sharing a host. **It does not govern the device rig**, which has one owner at a
time. The distinction that does apply is cost:

* **Reuse the RemoteXPC tunnel** wherever it is running, no matter who started it. It is root-owned
  and its password prompt goes to a GUI dialog an unattended session cannot answer.
* **Reclaim everything cheap** — preview servers, probe hosts, your own Appium. Leaving a stranger's
  idle server on the canonical port and shifting to the next one is how a host accumulates litter
  across sessions.

The preflight resolves every port for you and prints what it reused, restarted, or shifted. Take its
answers rather than hardcoding ports.

## Read before capturing

Read [`docs/PROFILING-CAMPAIGNS.md`](../../../docs/PROFILING-CAMPAIGNS.md) completely. It is the
catalogue of ways a campaign produces **numbers that look fine and are wrong** — every trap in it
was earned, and none of them raise an error. Read
[`docs/PROFILING-IPAD.md`](../../../docs/PROFILING-IPAD.md) as well before any on-device iPad
capture, and the `profiling` skill for what each `perf:*` command measures.

For a full cross-target snapshot rather than a single capture, continue with the
`run-performance-matrix` skill once this preflight is green.

## While capturing

* **Never run anything heavy on the host.** The host drives the input; competing work changes input
  cadence, which is a measured variable rather than a detail.
* **Serialize captures**, but keep both devices awake — the idle one still has to be ready when its
  turn comes, and reachable afterwards for a follow-up question.
* **Read the fidelity verdict before the result.** A capture that parses is not a capture that can
  be scored. A cell that fails input fidelity must not be scored at all, however plausible its
  number looks.
* **Do not tear the rig down when a capture ends.** A campaign is many captures, and clearing
  stay-awake between them is what put the phone to sleep mid-campaign once already.

## Ending the session

Leave the rig up unless you are told otherwise — the next session takes over and re-asserts what it
needs anyway. What does **not** clean itself up is the state `--wake-android` wrote: the phone keeps
`stayon` and a 30-minute screen timeout until something changes them back. Say so when you hand off,
rather than leaving a phone that behaves oddly for reasons nobody can trace.
