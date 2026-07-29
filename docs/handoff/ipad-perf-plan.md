<!-- markdownlint-disable-file MD029 -->

# iPad performance profiling — quick reference

> Reference card, not in-flight work. The full runbook is
> `.agents/skills/profiling/ipad-device-profiling.md` (Approach A).

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
