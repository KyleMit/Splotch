# Web lane: RN web export vs shipping SvelteKit

2026-11-09/10, Claude (web lane). RN = `427756f14` (`npm run build:site` → `dist/web`), shipping =
`ef3d1eb20` (`npm run build` → adapter-netlify `web/build`). Host: the campaign Mac (Apple Silicon),
Playwright 1.63 Chromium (`channel: 'chromium'`, headless) and WebKit, Lighthouse 13.5.0 from the RN
tree driving both arms. Scripts, raw reports, logs and screenshots: rig scratch folder
`campaign/web/` (`scripts/`, `lh/`, `lh-h2/`, `ttdi*/`, `perf/`, `smoke/`, `banner-pre/`,
`offline/`). No AI generation was used.

**Verdict for web: no blocker in either arm. The UI and behaviour are near pixel-identical; drawing
is a tie; on a cold slow-network visit RN paints 0.1–0.5 s sooner and keeps the first stroke ~0.45 s
sooner (3.0 → 2.55 s), below the 1 s "clear win" bar named in advance — and both arms drop the first
~2 s of scribbles on a paper that already looks ready. Nothing here should flip the decision.**

## What would matter (named before measuring)

| Axis              | Blocker (either arm)                                                    | Clear win                                                    | Tie band                        |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------- |
| First visit load  | first stroke that inks > 10 s, or LCP > 4 s (CWV "poor"), or CLS > 0.25 | ≥ 1 s on time-to-first-ink or LCP, or ≥ 2× transferred bytes | < 300 ms                        |
| Repeat visit load | not drawable offline after a visit                                      | ≥ 500 ms on time-to-first-ink                                | < 200 ms                        |
| Drawing           | p95 frame > 50 ms, > 5 % frames > 50 ms, or lost/missing ink            | p95 ≥ 1.5× and ≥ 8 ms apart, or long-frame share ≥ 3 points  | both at refresh with no misses  |
| Function          | can't draw, undo, clear, or crash/data loss in one arm only             | —                                                            | same defect in both = no signal |

## Serving (matched)

| Arm      | Publish dir                   | Host                                                                                                                                                        |
| -------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RN       | `dist/web`                    | its own `tools/page-load/serve-export.mjs` (e2e Netlify site + edge proxy: brotli q6, ETag/304)                                                             |
| Shipping | `web/build` (adapter-netlify) | `scripts/serve-shipping.mjs`: static Netlify emulation (netlify.toml `[[headers]]` + the adapter's `_headers`, pretty URLs) behind **RN's same edge proxy** |

Both answer `/` with brotli and a 304 on revalidation (RN document 253 KB raw / 25.6 KB br; shipping
181 KB / 48.8 KB). `/` is prerendered in both, so a static host is what Netlify does for that route.
Shipping's own Lighthouse runner uses `vite preview`, which sends no compression and no
`Cache-Control`, so it was not used. A second pass put an HTTP/2 + TLS front
(`scripts/h2-front.mjs`, throwaway self-signed cert, `--ignore-certificate-errors`) before both
hosts, because production is HTTP/2 and shipping makes 113 requests to RN's 42; under HTTP/1.1 that
request count alone made shipping look 2–5 s slower than it is.

## 1. Page load — Lighthouse (simulated Slow 4G + 4× CPU, 3 samples, median)

Flags copied verbatim from both trees' `tools/page-load/run-lighthouse-ci.mjs` (identical): mobile
form factor, phone portrait 412×915 @2.625, tablet landscape 1133×744 @2,
`--throttling-method=simulate`; repeat = same profile with `--disable-storage-reset`. Arms
interleaved per sample (`scripts/lh-matrix.mjs`).

| Host · arm · profile       | First FCP ms (range) | First LCP ms (range)    | CLS | First transfer / requests | Repeat FCP / LCP ms |
| -------------------------- | -------------------- | ----------------------- | --- | ------------------------- | ------------------- |
| HTTP/2 · RN phone          | **921** (921–921)    | **1,052** (1,052–1,052) | 0   | 764 KB / 42               | n/a†                |
| HTTP/2 · Shipping phone    | 1,384 (1,305–1,454)  | 1,754 (1,525–1,974)     | 0   | 631 KB / 113              | n/a†                |
| HTTP/2 · RN tablet         | **920** (920–921)    | **1,051** (1,051–1,052) | 0   | 764 KB / 42               | n/a†                |
| HTTP/2 · Shipping tablet   | 1,380 (1,307–1,382)  | 1,675 (1,526–1,677)     | 0   | 631 KB / 113              | n/a†                |
| HTTP/1.1 · RN phone        | 765 (762–771)        | 1,053 (903–1,056)       | 0   | 789 KB / 42               | 621 / 900           |
| HTTP/1.1 · Shipping phone  | 2,068 (1,394–2,138)  | 3,202 (1,841–3,350)     | 0   | 704 KB / 113              | 647 / 900           |
| HTTP/1.1 · RN tablet       | 773 (772–773)        | 1,053 (1,052–1,054)     | 0   | 789 KB / 42               | 622 / 900           |
| HTTP/1.1 · Shipping tablet | 1,535 (1,455–2,137)  | 2,138 (1,976–3,346)     | 0   | 704 KB / 113              | 648 / 900           |

† Chrome does not disk-cache responses from a host whose certificate error was ignored, so the
HTTP/2 "repeat" re-downloaded everything; only the HTTP/1.1 repeat rows are a real warm cache.

TBT is not tabled: every `long-tasks` item is Lighthouse's own `_lighthouse-eval.js` (the false
positive `audit-page-load` documents) except RN's own `index-*.js` (~89 ms) and
`RsdSettingsRoute-*.js` (70–90 ms; Lighthouse attributes a task to the first script on its stack, so
this names the chunk, not proven cause). Reported TBT was RN 390–470 ms vs shipping 160–190 ms, and
Lantern TTI RN 3.9–6.1 s vs shipping ≈ LCP; both are contaminated and the measured
first-inked-stroke below replaces them. First-visit bytes: RN script 439 KB over 31 files (1,539 KB
raw, ~2.6× shipping's parse work) + 26 KB document; shipping script 276 KB over 79 files (600 KB
raw) + 22 CSS files (38 KB) + 48 KB document. Both pull the three pencil sounds (~240 KB, High
priority) during load. LCP element: RN the prerendered paper `div`; shipping
`main.app-container > div.canvas-container`. Shipping's HTTP/1.1 first-visit LCP is bimodal on this
Mac (1.8 s or 3.2–3.3 s), the Lantern render-delay mode its own `tools/page-load/README.md` records.

## 2. First stroke that actually inks (applied Slow 4G + 4× CPU)

Answers the method challenge's "fast first paint that isn't drawable yet" question
(`scripts/ttdi-paint.mjs`). Chromium with DevTools throttling at Lighthouse's applied Slow 4G
constants (562.5 ms request latency, 1,474 kbps down) and 4× CPU. From navigation start a short
stroke is tried in a fresh grid cell every 150 ms (60 cells); after the page settles, the first cell
holding ink is the first input a child would not have lost, and a CDP screencast gives when that ink
first appeared. Repeat = a new tab in the same profile after the first visit drew (each app's own
service worker installed), storage wiped so the paper starts blank. 3 runs per cell, spread ≤ 25 ms.

| Host     | Arm · profile   | First visit: first kept stroke | Its ink visible | Tries lost | Repeat: first kept stroke / ink visible |
| -------- | --------------- | ------------------------------ | --------------- | ---------- | --------------------------------------- |
| HTTP/2   | RN phone        | **2,552 ms**                   | **2,843 ms**    | 17         | ≤ 151 / 263 ms                          |
| HTTP/2   | Shipping phone  | 3,001 ms                       | 3,112 ms        | 20         | ≤ 150 / 227 ms                          |
| HTTP/2   | RN tablet       | **2,551 ms**                   | **2,843 ms**    | 17         | ≤ 151 / 257 ms                          |
| HTTP/2   | Shipping tablet | 3,018 ms                       | 3,102 ms        | 20         | ≤ 151 / 228 ms                          |
| HTTP/1.1 | RN phone/tablet | 2,551 ms                       | —               | 17         | ≤ 151 ms                                |
| HTTP/1.1 | Shipping tablet | 7,352 ms                       | —               | 49         | ≤ 150 ms                                |

Every try after the first kept one also inked, in both arms. RN's first kept try lands ~250 ms
before its engine stamps itself live: its prerendered document's boot script hands a pointer that is
still down to the engine (`src/platform/firstFrameContract.ts`), and that ink appears ~290 ms later.
Shipping starts its engine at module evaluation (shipping ADR-0072, which deliberately deferred a
pre-hydration stroke buffer), so its paper is inert until the engine's module graph has arrived —
over HTTP/1.1 that graph's 113 requests cost 7.4 s, over HTTP/2 3.0 s. Net for a child on a first
visit over a slow phone network: RN keeps the first scribble ~0.45 s sooner and puts ink on screen
~0.27 s sooner. Repeat visits are a tie (both answered by their service worker).

Same throttle, one more run per cell (00:37–00:39) also recording first contentful paint and RN's
own `data-controls-live` / `data-drawing-live` stamps — how long the page *looks* ready while it
still drops strokes:

| Arm · profile   | Document in | FCP    | First kept stroke | Ink visible | RN controls / engine live | Looks-ready-but-drops-strokes window |
| --------------- | ----------- | ------ | ----------------- | ----------- | ------------------------- | ------------------------------------ |
| RN phone        | 722 ms      | 775 ms | 2,551 ms          | 2,833 ms    | 2,771 / 2,815 ms          | **~1.8 s**                           |
| Shipping phone  | 832 ms      | 874 ms | 3,001 ms          | 3,125 ms    | —                         | **~2.1 s**                           |
| RN tablet       | 714 ms      | 746 ms | 2,550 ms          | 2,847 ms    | 2,753 / 2,799 ms          | ~1.8 s                               |
| Shipping tablet | 834 ms      | 890 ms | 3,003 ms          | 3,123 ms    | —                         | ~2.1 s                               |

So **both** arms show a drawable-looking paper that silently drops a toddler's first ~2 s of
scribbles on a cold slow-network visit; RN's boot script only rescues a stroke still held down when
the engine arrives (it adopts pointers that are *down*, not finished strokes). Repeat visits paint
in 42–70 ms and keep the second try (≤ 151 ms) in both.

## 3. Drawing responsiveness — identical scripted scribbles

`scripts/perf-strokes.mjs`: tablet landscape 1133×744 @2×, default brush and colour (both open on
the purple Pen), 20 Lissajous scribbles of 240 trusted mouse moves each paced at 120 Hz across the
middle half of the paper, 300 ms apart, on one page (the picture accumulates; 51 % of the measured
area inked at the end in both). rAF frame intervals inside the pointer-down windows; input→next
frame = next rAF timestamp after the capture-phase `pointermove` handler minus `event.timeStamp`;
Chromium also reports Long Animation Frames. 3 runs each, medians (ranges within ±0.3 ms).

| Arm · engine                    | Frame p50 / p95 / p99 / max ms | > 33 / > 50 ms frames | Input→next frame p50 / p95 ms | LoAF | Moves handled / sent | Ink |
| ------------------------------- | ------------------------------ | --------------------- | ----------------------------- | ---- | -------------------- | --- |
| RN · Chromium 4× CPU            | 16.7 / 16.7 / 16.8 / 16.8      | 0 % / 0 %             | 27.4 / 29.0                   | 0    | 4,800 / 4,800        | ✓   |
| Shipping · Chromium 4× CPU      | 16.7 / 16.7 / 16.8 / 16.8      | 0 % / 0 %             | 29.6 / 31.1                   | 0    | 4,800 / 4,800        | ✓   |
| RN · WebKit (no throttle)       | 17 / 18 / 19 / 23              | 0 % / 0 %             | 9 / 17                        | n/a  | 4,800 / 4,800        | ✓   |
| Shipping · WebKit (no throttle) | 17 / 18 / 19 / 19              | 0 % / 0 %             | 9 / 14                        | n/a  | 4,800 / 4,800        | ✓   |

Headless Chromium caps rAF at 60 Hz and aligns mouse moves to frames (the 120 Hz script delivered
60/s there); WebKit took all 120 moves/s. Playwright's WebKit has no CPU throttle, so its rows are
Mac-speed, not iPad-speed. Both arms hold every frame in both engines: a tie, with a ~2 ms
input→frame edge to RN in Chromium and a ~3 ms p95 edge to shipping in WebKit, both noise for a
child.

Not measured: a main-thread-headroom pass (CDP busy %, Crayon and 8× CPU;
`scripts/perf-headroom.mjs`) was queued but never got the rig lock before this lane's time box, so
"how close to dropping frames" is unknown — both arms simply never dropped one at 4×.

## 4. Functional smoke — Chromium + WebKit × phone 412×915 + tablet 1133×744

`scripts/smoke.mjs` drives both arms by the same accessible names (every one resolved in both), with
a screenshot per step and pixel checks: load → draw → pick Blue (ink is blue) → Brushes › Crayon →
Stroke width › largest (ink grows) → Undo (ink gone) → drag the Clear puck to the middle (paper
empty) → Settings opens → Coloring books › Cat page lands → Magic brush fills (colours appear) →
app's own service worker controls the page → offline reload draws → dark `prefers-color-scheme`
paper is dark and draws. Chromium used an Android phone UA + `isMobile`; WebKit an iPhone/iPad UA.

| Step                                            | RN (4 cells)                        | Shipping (4 cells) |
| ----------------------------------------------- | ----------------------------------- | ------------------ |
| Draw, colour, Crayon, size, Undo, Clear         | pass                                | pass               |
| Settings, coloring page lands, Magic brush fill | pass                                | pass               |
| App registers its worker (controls page)        | pass                                | pass               |
| Offline reload draws — Chromium (`setOffline`)  | pass (~4.0 s)                       | pass (~3.9 s)      |
| Offline relaunch — WebKit (host stopped)        | pass                                | pass               |
| Dark mode paper + ink                           | pass (lum 54–55)                    | pass (lum 54–55)   |
| Install banner after 3 strokes (`banner.mjs`)   | pass, Android + iPad copy identical | pass, identical    |

Side-by-side screenshots (`smoke/sheet-*.png`, `smoke-debug/pair-*.png`, `banner-pre/sheet.png`) are
near pixel-identical: same palette, drawer, brush menu, Settings hub/two-pane, Farm and shelf
dialogs, Magic-brush fill, install card and dark paper.

### Defects and differences

| # | Finding                                                                                                                                                                                                                                       | Severity                                                           | Arm                      |
| - | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------ |
| 1 | Cold slow-network visit: the paper looks ready at ~0.8 s but silently drops strokes until the engine is live — ~1.8 s window in RN (kept from 2.55 s), ~2.1 s in shipping (kept from 3.0 s)                                                   | minor                                                              | both (RN 0.45 s shorter) |
| 2 | First visit fetches the Settings route chunk (`RsdSettingsRoute`, 64 KB br) and Lighthouse attributes a 70–90 ms long task (4× CPU) to it; ships 2.6× shipping's raw JS                                                                       | minor                                                              | RN                       |
| 3 | Settings hub rows render a lighter title/subtitle weight than shipping's semibold, in both engines; on the Chromium phone the wider subtitle wraps and the list fade clips its last word ("appear") (`smoke/zoom-hub.png`, `zoom-parent.png`) | cosmetic                                                           | RN                       |
| 4 | WebKit (both UAs): Settings › Coloring says "0 extra books ready" and the picker opens on Farm; Chromium had 7 extra books by then — likely Playwright WebKit storage, unverified on Safari                                                   | unknown, no signal                                                 | both                     |
| 5 | Reload/relaunch starts a blank page                                                                                                                                                                                                           | by design (a shipping ADR: the app "always opens on a blank page") | both                     |

No defect in either arm meets the blocker bar.

## Method notes and limits

* **Bundle provenance (checked 00:40).** Every shipping sample was served from this lane's own
  worktree build, `campaign/web/ship-wt/web/build`, built 21:58:07 with `npm run build` under the
  rig lock: adapter-netlify output with `_headers`, `sw.js` and the prerendered `index.html`, no
  `200.html`, files unchanged since. The served `/` hashes equal the file on disk over both the
  HTTP/1.1 (5301) and HTTP/2 (5303) fronts. **No sample came from the Capacitor bundle** that sits
  in the shared shipping checkout's `web/build` (overwritten there by a `build:cap` at 21:56, which
  is why this lane built separately). RN samples were served from `dist/web` built 21:55:26,
  unchanged.
* **Overlap with other lanes' host work.** The AI lane's headless runs at 23:41:15–23:41:37 and
  23:42:12–23:42:25 fell inside this lane's HTTP/2 time-to-first-ink block (shipping phone runs 2–3,
  possibly RN tablet run 1). Those samples are suspect; they match their unaffected siblings to ≤ 10
  ms (the try grid is 150 ms), and the 00:37–00:39 re-run of all four cells reproduced them (2,551 /
  3,001 / 2,550 / 3,003 ms kept; 2,833 / 3,125 / 2,847 / 3,123 ms visible).
* **This lane's own host load outside the lock** (for other lanes to check their samples): two
  headless smoke debug runs 22:37:51–22:39:33 and six reload-persistence runs 22:40:37–22:42:16,
  both inside the perf lane's Galaxy gfxinfo + cold-launch hold (from 22:37:26); a TTDI process
  orphaned by a controller swap ran 23:54:31–~23:55:00, overlapping the start of the perf lane's
  Galaxy first-stroke video (23:54:38) until it was killed; banner and WebKit offline checks
  00:04:21–00:05:42 during the upkeep lane's APK build (not a timing capture).

* Not measured: real iPad Safari / Android Chrome on device (Playwright WebKit on the Mac is a proxy
  without CPU throttling), the production CDN, and an iPad-class cold JS parse (RN's 1.5 MB raw JS
  would cost more there than on this Mac).
* Smoke harness misses, resolved: the install-banner probe inside the long smoke fired before the
  lazily imported card mounted (a dedicated 3-stroke check then passed in both arms); Playwright
  WebKit's `context.setOffline` reload fails with "internal error" in both arms, so WebKit offline
  was re-tested by stopping a private host instead (`scripts/offline-kill.mjs`).
* Rig: the shared shipping checkout's `web/build` and `.svelte-kit/output` were overwritten
  mid-build at 21:56 by another lane's `build:cap` (adapter-static output, no `sw.js`), so this lane
  built shipping in its own detached worktree (`campaign/web/ship-wt`, `node_modules` symlinked from
  the shipping checkout). That worktree and `serve-shipping.mjs` are also in use by another lane's
  hosts (ports 5304/5305 since 23:31), so they were left in place.
* One harness hang (shipping phone HTTP/1.1 time-to-first-ink, `browser.close()` never returned)
  cost two runs of that cell; the HTTP/2 rerun has all three.
