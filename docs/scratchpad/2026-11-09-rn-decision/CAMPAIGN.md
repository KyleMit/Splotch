# RN go/no-go decision campaign (2026-11-09 → ~11-14)

Every subagent in this campaign reads this file first. Refs #2690.

## The decision

Pick **one** architecture for web, Android and iPad: the React Native app (Expo, Skia, React Strict
DOM) or the shipping SvelteKit + Capacitor app. Never a mix. The owner, Claude and Codex decide it
together on day 5, aiming for the highest quality for users at a maintenance cost we can carry.

* **Bar.** RN wins only if it is clearly better for users. A tie on user-facing quality goes to
  shipping, because RN's extra upkeep has to be paid for.
* **Platform weight.** iPad first, Android phone second, web third.
* **Breadth before depth.** A shallow pass over every axis first, so a blocker shows up on day 1,
  not day 5. Provisional recommendation within 24 hours of start (start: 2026-11-09 ~21:45 EST).

## Frozen candidates — never edit product code in either

| Arm      | Source                                        | Checkout                                                       |
| -------- | --------------------------------------------- | -------------------------------------------------------------- |
| RN       | `427756f14` (tip of `codex/native-migration`) | `.claude/worktrees/splotch-status-planning-f08c4b` (this tree) |
| Shipping | `ef3d1eb20` (tip of `main`)                   | `.claude/worktrees/rn-decision-shipping-ef3d1eb` (detached)    |

The store release users have is v1.6.0 (`d8b86469f`); it is older than shipping main and is a
cross-check only. To price a fix for a possible blocker, branch off a candidate into a separate
throwaway worktree, time-box it to half a day, and never push it into either frozen line.

## Hard rules

* No merge into `main` or `codex/native-migration`. No Play / App Store uploads. No production
  deploy; splotch.art stays untouched. A pushed side branch may make a non-production Netlify
  preview.
* Never install over, launch into, draw in, clear or screenshot the store-installed
  `art.splotch.app` on either device. Every other bundle ID is fair game.
* Leave the Dependabot PRs alone.
* AI generation costs real money: **$10 total for the whole campaign**. Before any generation, read
  and append to the spend ledger named in the rig file; stop and report if a lane would exceed its
  allotment.
* Never write a device serial or UDID into a tracked file (`npm run check:device-identifiers`). Name
  devices ("the iPad", "the Galaxy").
* Ports: pick with `npm --silent run show:free-port`; never kill a listener you did not start.
* **Rig lock.** Physical-device timing captures and heavy host work (native builds, test suites,
  Lighthouse, simulators/emulators) must not overlap. Lock directory is in the rig file. Acquire
  with `until mkdir "$L" 2>/dev/null; do sleep 20; done`, then immediately write `"$L/owner"` (lane,
  purpose, time). Release with `rm "$L/owner"; rmdir "$L"` on every path, including failures. Hold
  it per capture window or per heavy command, never across a wait. Functional (non-timing) device
  checks may run without it.
* Name the number that would change the decision before measuring. At most two attempts per
  hypothesis. Three samples is enough for breadth.

## Output contract

* Write your findings to `docs/scratchpad/2026-11-09-rn-decision/<lane>.md` in this tree: short,
  tables over prose, every claim with its build, device and method. Raw media and logs go to the
  scratchpad folder named in the rig file, never into the tree. Do not commit; the orchestrator
  commits.
* Return a summary of **at most 350 words**: what you measured, the result per arm, each defect with
  severity (blocker / major / minor / cosmetic) and whether it exists in RN, shipping or both, and
  one line on **whether anything you found could flip the decision**.
* If something only the owner's eyes or fingers can judge comes up, add it to `owner-packet.md` as
  one numbered case (what to open, what to do, what to compare, ≤3 lines). Never wait for the owner.
