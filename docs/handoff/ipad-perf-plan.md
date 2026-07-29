<!-- markdownlint-disable-file MD029 -->

# iPad performance profiling — quick reference

> Reference card, not in-flight work. The full runbook is
> `.agents/skills/profiling/ipad-device-profiling.md` (Approach A).

## One-time setup

* **⟨iPad⟩** Settings → Apps → Safari → Advanced → **Web Inspector = ON**
* **⟨Mac⟩** Safari → Settings (⌘,) → Advanced → **"Show features for web developers"**
* USB-connect, unlock the iPad, **Trust This Computer**, both on the same Wi-Fi

## Pass 1 — the numbers (no recording)

1. **⟨Mac⟩** `npm run perf:serve` — builds instrumented + serves. Add `--ignore-scripts` to skip the
   rebuild.
2. **⟨iPad⟩** Safari → the **`Harness:`** URL it printed (`http://<ip>:4173/dev/engine`) — not the
   `Network:` one, which is the plain app. Blank canvas = right page. Keep it foregrounded and
   awake.
3. **⟨Mac⟩** Develop → ⟨your iPad⟩ → `…/dev/engine`
4. **⟨Mac⟩** Console tab → paste all of `scripts/perf/ipad-console-driver.js`. **Timelines off.**
   Takes 1–2 min.
5. Read the table against the gates below. **All rows pass → you're done.**

## Pass 2 — only if a row is hot

6. **⟨Mac⟩** Console, as its own statement before re-pasting the driver:

   ```js
   window.__perfScenarios = 'crayon-scribbles';
   ```

   Keys: `long-squiggles`, `multi-finger`, `crayon-squiggles`, `crayon-scribbles` (the `key` column
   of the table — same keys `npm run perf:undo --scenarios=` takes).
7. **⟨Mac⟩** Timelines tab → record → paste the driver → let it finish → stop.
8. **⟨Mac⟩** Export the `.json`, then:

   ```sh
   npm run perf:ios:analyze -- perf-profiles/web-inspector-timeline/<export>.json
   ```

   Not `perf:analyze` — different format.
9. Look for a **dropped frame at finger-lift** and the **paint/composite** records (GPU raster cost
   the engine marks can't see).

Scope to one scenario because Web Inspector's mark buffer is a ring buffer. Treat pass 2's absolute
timings as inflated — the recorder's overhead lands inside them.

## Gates (ADR-0066)

| Column          | Pass                     |
| --------------- | ------------------------ |
| `undo p95 ms`   | < 50                     |
| `commit max ms` | ≲ 8.3 (one 120 Hz frame) |
| `history MiB`   | ≲ 150                    |

A hot `commit max` attributes to one of its inner columns: `snap copy max ms` (the paper patch
capture) vs `fold max ms` (rendering the committed ops).

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
