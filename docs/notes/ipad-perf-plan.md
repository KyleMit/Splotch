<!-- markdownlint-disable-file MD029 -->

# iPad performance profiling — working notes

> Session scratchpad: the runbook shorthand plus the live TODO list for the ADR-0066 on-device
> verification (issue \#446, branch `ipad-perf`, PR \#634). Delete it when that work closes. The
> durable runbook is `.agents/skills/profiling/ipad-device-profiling.md` (Approach A).

## TODO

* [x] **Fix the driver's `resetForScenario`.** It drained history, saw leftover ink, cleared, then
      drained again — undoing its own clear. Now it drains, clears, and stops. The old code chased
      zero history to keep counts honest, but that was unnecessary: `STROKES` exceeds
      `MAX_UNDO_DEPTH`, so the stack shifts out everything older before `drawEnd` anyway. Verified
      over three consecutive scenarios — no warnings, `snapshots=20` on every row.
* [x] **`multi-finger` resolved — it passes, at 1 ms.** The original zero row was missing data from
      the broken reset. With that fixed it read 176 ms, but that was a *new* artifact: the reset's
      `clearCanvas()` snapshot holds the whole inked paper it wiped, and encodes as soon as two
      further commits push it past `MAX_HOT_RASTERS` — inside the next scenario's window. Measured
      in isolation on blank paper it is `encode 0 / commit 1`. The reset now spends those two
      commits itself on tiny priming marks before `drawStart`; sequenced multi-finger then matches
      its isolated value. Its snapshots carry no patches at all (`blob KB 0`, `history 28 MiB` = the
      paper alone), which is exactly why it is the one scenario with nothing to encode and no hitch.
* [x] **Clean on-device gates run** — done, four honest rows, recorded below.
* [x] **Issues updated.**
  * [x] \#446 — verdict posted, closed as completed (Part 2, the historical replay A/B, was not run)
  * [x] \#444 — premise corrected: its items 1–2 target `engine.snapshot`, measured at 1–3 ms.
        Suggested wont-do for those two and folding item 3 into \#494; awaiting a call
  * [x] \#635 filed — the encode bug, labelled `type:bug` / `type:perf` / `priority:high` /
        `needs-adr`
  * [x] \#494 — noted that this run does not answer it (`undoAll` waits per step, so rapid taps are
        never tested), left open
* [ ] **Merge PR \#634.**
* [ ] **ADR for the fix**, then implement. Options trade differently: defer encoding to idle, cap
      encodes per commit, `OffscreenCanvas` in a worker, or skip encoding where `toBlob` is
      synchronous and carry the memory.
* [ ] Delete this file.

## Verdict — issue \#446, Part 1

Full gates run on a 12.9″ iPad Pro, all four scenarios, clean resets:

| Scenario         | blob KB | snap copy | fold | **encode max** | **commit max** | vs 8.3 ms |
| ---------------- | ------- | --------- | ---- | -------------- | -------------- | --------- |
| multi-finger     | 0       | 1 ms      | 0 ms | **0 ms**       | **1 ms**       | pass      |
| long-squiggles   | 457     | 3 ms      | 1 ms | **111 ms**     | **112 ms**     | 13×       |
| crayon-squiggles | 1179    | 1 ms      | 1 ms | **1149 ms**    | **1149 ms**    | 138×      |
| crayon-scribbles | 2815    | 1 ms      | 0 ms | **2389 ms**    | **2390 ms**    | 288×      |

`engine.encode` is 99–100% of `engine.commit` on every scenario that produces blobs, and the one
scenario producing none (multi-finger) is the one with no hitch — the mechanism confirmed by its own
negative control. This is not a crayon problem: plain pen strokes miss the budget by 13×.

| Gate                | Threshold         | Measured                  |                      |
| ------------------- | ----------------- | ------------------------- | -------------------- |
| Undo restore        | p95 < 50 ms       | 0–1 ms                    | pass                 |
| History memory      | ≲ 150 MB          | 28–34 MiB                 | pass                 |
| Live drawing        | unchanged         | 0.01 ms med, 3.40 ms max  | pass                 |
| **Commit hitch**    | ≈ 8.3 ms          | **112 / 1149 / 2390 ms**  | **fail, up to 288×** |
| **Encode overhead** | no dropped frames | 47 s frozen of a 59 s run | **fail**             |

**Root cause.** `toBlob` is specified to encode in parallel. Chromium honours it; WebKit encodes
synchronously inside the call, and `encodeColdSnapshots()` runs inside `engine.commit`
(`undoHistory.ts`). Safari has no canvas WebP encoder, so every cold patch is a PNG encode of a
2732² raster. Same code, same workload, `engine.encode` measured through `/dev/engine`:

| Engine   | `commit` total | `encode` total | encode share |
| -------- | -------------- | -------------- | ------------ |
| WebKit   | 4639 ms        | 4636 ms        | **99.94%**   |
| Chromium | 92.5 ms        | 0.7 ms         | 0.8%         |

Chromium's worst commit is 4.6 ms — inside the frame budget, gate passing. That is why `perf:undo`
never caught this, and why \#444's remedies were aimed at the paper copy.

Ruled out by the Timeline: paint (`max 0.04 ms`), GC (22 collections, 3.1 ms worst), the drawing
path (26,425 draws at 0.01 ms median). The 2411 ms composite is the compositor blocked behind the JS
task, not a cause.

## One-time setup

* **⟨iPad⟩** Settings → Apps → Safari → Advanced → **Web Inspector = ON**
* **⟨Mac⟩** Safari → Settings (⌘,) → Advanced → **"Show features for web developers"**
* USB-connect, unlock the iPad, **Trust This Computer**, both on the same Wi-Fi

Two separate runs, never combined. **Gates** gives the numbers; **Timeline** explains a bad one.

## Shared setup

1. **⟨Mac⟩** `npm run perf:serve` — builds instrumented + serves. Add `--ignore-scripts` to skip the
   rebuild.
2. **⟨iPad⟩** Safari → the **`Harness:`** URL it printed (`http://<ip>:4173/dev/engine`) — not the
   `Network:` one, which is the plain app. Blank canvas = right page. Keep it foregrounded and
   awake.
3. **⟨Mac⟩** Develop → ⟨your iPad⟩ → `…/dev/engine`

## Run 1 — gates (the verdict)

4. **⟨Mac⟩** Console tab → paste all of `scripts/perf/ipad-console-driver.js`. **No Timeline
   recording.** Takes 1–2 min.
5. Read the table against the gates below. **All rows pass → you're done.**

## Run 2 — Timeline (only if a row is hot)

6. **⟨Mac⟩** Timelines tab → uncheck **Screenshots** and **Network Requests**. Keep **JavaScript &
   Events** and **Layout & Rendering**.
7. **⟨Mac⟩** Console, as its own statement before re-pasting the driver:

   ```js
   window.__perfTimeline = true;
   window.__perfScenarios = 'crayon-scribbles';
   ```

   Keys: `long-squiggles`, `multi-finger`, `crayon-squiggles`, `crayon-scribbles` (the `key` column
   of the gates table). Timeline mode requires exactly one and refuses without it.
8. **⟨Mac⟩** Record → paste the driver → let it finish → stop.
9. **⟨Mac⟩** Export the `.json`, then:

   ```sh
   npm run perf:ios:analyze -- perf-profiles/web-inspector-timeline/<export>.json
   ```

   Not `perf:analyze` — different format.
10. Look for a **dropped frame at finger-lift** and the **paint/composite** records (GPU raster cost
    the engine marks can't see).

**Why they're separate:** a recorded gates run hands Web Inspector ~53k markers (99.7% of them
`engine.draw`), ~53k event records, and ~35 MB of screenshots — a 115 MB export that pins the Mac at
100% CPU. Timeline mode runs the same code at ~1/20th the volume. Its milliseconds are **shape, not
magnitude** — smaller strokes mean cheaper encodes, so quote run 1 for numbers.

## Gates (ADR-0066)

| Column          | Pass                     |
| --------------- | ------------------------ |
| `undo p95 ms`   | < 50                     |
| `commit max ms` | ≲ 8.3 (one 120 Hz frame) |
| `history MiB`   | ≲ 150                    |

A hot `commit max` attributes to one of its three inner columns: `snap copy max ms` (the paper patch
capture), `fold max ms` (rendering the committed ops), or `encode max ms` (demoting cold snapshots
to blobs). If none of them dominate, the remainder is unmarked work in `commitStrokeGroup`.

## If something's off

`window.__engine missing` → paste this to see which case it is:

```js
({
  url: location.href,
  engine: typeof window.__engine,
  sw: navigator.serviceWorker?.controller?.scriptURL ?? null,
});
```

* Wrong `url` → you're on `/`, open the **Harness** URL instead.
* Right url, no engine → stale tab; reload. If a `sw` is listed and reload doesn't help:

  ```js
  navigator.serviceWorker.getRegistrations()
    .then((rs) => Promise.all(rs.map((r) => r.unregister())))
    .then(() => location.reload());
  ```

* Also check Web Inspector is attached to the `…/dev/engine` tab, not another one.

Other quick ones:

* **Multiple `Network:` URLs** → the Wi-Fi one is reachable; it's a DHCP lease, so take it from the
  current run.
* **No `engine.*` marks** → the served build lacked `PERF_MARKS`; rerun `npm run perf:serve` without
  `--ignore-scripts`.
* Stop the server before `npm run perf:replay` — same port.
