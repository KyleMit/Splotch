# ADR-0078: Size the Resident Snapshot Tier by Bytes, and Encode Off the Commit

**Status:** Active **Date:** 2026-07

## Context

ADR-0066 gave the undo stack a memory tier: the `MAX_HOT_RASTERS = 2` most recent snapshots stayed
resident rasters and everything deeper encoded to a lossless blob, decoding again only on a deep
undo. That bounded depth-20 history to something like paper + 2 rasters + blobs instead of the ~600
MB twenty naïve snapshots would pin.

ADR-0066 also flagged the risk that killed it, and deferred the verdict:

> Those blob sizes do not transfer to WebKit: Safari (desktop and iOS) has no canvas WebP encoder,
> so `toBlob` falls back to PNG, which is larger and encodes slower — the ≲150 MB and
> encode-smoothness gates are therefore decided by [an on-device run].

That run happened (issue #446). Two gates passed; the commit hitch failed on every scenario that
produces blobs, on a 12.9″ iPad Pro:

| Scenario         | blob KB | `engine.snapshot` | `engine.fold` | `engine.encode` | `engine.commit` | vs 8.3 ms |
| ---------------- | ------- | ----------------- | ------------- | --------------- | --------------- | --------- |
| multi-finger     | 0       | 1 ms              | 0 ms          | 0 ms            | 1 ms            | pass      |
| long-squiggles   | 457     | 3 ms              | 1 ms          | 111 ms          | 112 ms          | 13×       |
| crayon-squiggles | 1179    | 1 ms              | 1 ms          | 1149 ms         | 1149 ms         | 138×      |
| crayon-scribbles | 2815    | 1 ms              | 0 ms          | 2389 ms         | 2390 ms         | 288×      |

The encode was 99–100% of the commit wherever blobs existed, and the one scenario producing none had
no hitch at all. Plain pen strokes miss the frame budget by 13×, so this was never crayon-specific.

The mechanism is that `toBlob` is specified to encode in parallel and **WebKit does the encode
synchronously inside the call**, queueing only the callback. Measured on a 2732² canvas of dense
strokes, main-thread blocking separated from callback latency:

| Engine   | requested    | got             | main thread blocked | total  |
| -------- | ------------ | --------------- | ------------------- | ------ |
| WebKit   | `image/webp` | **`image/png`** | **206 ms**          | 209 ms |
| WebKit   | `image/png`  | `image/png`     | **163 ms**          | 169 ms |
| Chromium | `image/webp` | `image/webp`    | 85 ms               | 312 ms |
| Chromium | `image/png`  | `image/png`     | **0 ms**            | 77 ms  |

Chromium's worst commit over the same driven scenario was 4.6 ms — inside the frame budget, gate
passing. The defect is therefore **structurally invisible to `perf:undo`**, which runs headless
Chromium. That blind spot also mis-aimed the follow-up work: issue #444's first two remedies target
the paper copy, which measures 1–3 ms on device.

What made a fix available is that the memory picture moved after ADR-0066 was written. Its budget
assumed ~30 MB per snapshot; [ADR-0069](0069-dirty-rect-patch-snapshots.md) and
[ADR-0074](0074-undo-hotpath-patch-capture-optimizations.md) later shrank snapshots to dirty-rect
patches, and nothing revisited the tier constant. Instrumenting what a full-depth stack would cost
with nothing encoded (`patchBytes`, reported as `no-encode MiB`) measured **28–60 MiB against the
≲150 MB gate**. The tier was spending a WebKit commit's entire budget to reclaim memory that was not
scarce.

Alternatives considered:

* **Stop tiering entirely.** Rejected: the worst case is real. One canvas-spanning scribble makes a
  patch the full ~28.5 MiB paper, and twenty of those pin ~570 MB — precisely what
  [ADR-0033](0033-command-replay-undo.md) removed.
* **Defer the encode to idle and change nothing else.** Keeps every encode, just off the commit
  frame. It relocates a 163–206 ms block rather than removing it, and a child drawing continuously
  offers little idle time.
* **Cap encodes per commit.** Bounds the burst without addressing why the encodes happen at all.
* **`OffscreenCanvas` + `convertToBlob` in a worker.** Genuinely off the main thread, and within the
  Safari 16.4 floor. Much larger change, and ADR-0033 had already deferred worker round-trips for
  the fold on the grounds they cost more than they save; nothing here needed that reach once the
  budget removed the encodes.

## Decision

Two changes in `web/src/lib/drawing/undoHistory.ts`, both aimed at encoding only under real memory
pressure and never on the frame that must present the stroke.

**The resident tier is a byte budget, not an entry count.** `hotWindowStart()` walks the stack
newest → oldest, accumulating each entry's patch bytes, and returns the index where the next entry
would break the budget. `isInHotWindow`, `encodeColdSnapshots`, and `reinflateHotSnapshots` all read
that one function, so the three tier transitions cannot disagree.

The budget is `HOT_PATCH_BUDGET_PAPER_MULTIPLE = 3` times the paper's own bytes rather than an
absolute constant, so it tracks device class — a bigger raster means a bigger device. Resident tier
plus paper therefore stays at 4× the paper, ~114 MiB on the largest iPad raster, inside ADR-0066's
≲150 MB gate with room for the encoded tail. `MIN_HOT_RASTERS = 2` floors it, so undo's first steps
stay a blit even when a single patch is larger than the whole budget.

**The encodes the budget does not absorb are scheduled off the commit.** `scheduleColdEncode()`
coalesces them onto the module's existing `scheduleIdle` helper — one pending pass no matter how
many commits queue it. The pass re-reads the stack when it runs and every transition re-checks the
window, so running late is safe.

Non-obvious invariants:

* **`getHistoryDebug().rasterBytes` cannot answer the memory question** — it counts what is resident
  *now*, and demotion is exactly what shrinks it. `patchBytes` counts every patch's rect regardless
  of tier, which is the figure the encode-versus-memory tradeoff is decided on.
* **`engine.encode` no longer sits inside `engine.commit`.** Both marks still exist; a commit's
  remainder now attributes to `snapshot` + `fold` alone.
* **The e2e tier specs need paper-sized patches to reach the budget at all.** Their strokes carry an
  L-shaped tail so the asserted band pixels stay put while the bounding box spans the canvas. A thin
  stroke no longer demotes anything, which is the fix working, not a broken test.

## Consequences

* \+ The stroke-end freeze is gone rather than relocated. Re-running the gates on the same 12.9″
  iPad Pro, against the failing table in Context:

  | Scenario         | `commit max` before | after    | `blob KB` after | `history MiB` after |
  | ---------------- | ------------------- | -------- | --------------- | ------------------- |
  | multi-finger     | 1 ms                | **0 ms** | 0               | 28                  |
  | long-squiggles   | 112 ms              | **2 ms** | 0               | 59                  |
  | crayon-squiggles | 1149 ms             | **1 ms** | 0               | 60                  |
  | crayon-scribbles | 2390 ms             | **1 ms** | 0               | 56                  |

  Every scenario is inside the 8.3 ms frame budget, and `blob KB` is zero throughout — the budget
  absorbed the whole stack, so nothing encoded at all. `history MiB` equals the unencoded cost
  exactly on every row, which is the arithmetic confirmation of that. All of ADR-0066's gates now
  pass on device. (The same before/after in Playwright's WebKit on a Mac: `engine.commit` total 4639
  ms → 0 ms, `engine.encode` 4636 ms → 2 ms.)
* \+ Deep undo gets faster on the same workload: entries that would have been blobs are resident
  rasters, so their restore is a blit instead of a decode.
* \+ No user-visible tradeoff. Undo depth stays `MAX_UNDO_DEPTH = 20` — entries still exist, they
  are just resident rather than encoded.
* \+ Encoding now correlates with memory pressure, which is what it was always for. A session that
  genuinely needs the tier still gets it.
* − **Typical resident memory rises**, from paper + 2 patches to paper + up to 3 papers of patches.
  Measured on device at 28–60 MiB where the old policy held 28–34 MiB — 40% of the ≲150 MB gate at
  its worst. Inside it with margin, but it is a real increase and the gate is the only thing
  bounding it.
* − **The pathological case still encodes, and on WebKit that still blocks** — just on an idle
  callback rather than the pointerup frame. Canvas-spanning scribbles, where every patch really is a
  full paper, will reach the budget. A worker encode remains the only fix that removes the block
  outright.
* − The budget is a multiple of the paper, so it is only as well-calibrated as the assumption that
  raster size proxies for device memory. A device with a large screen and little RAM would be served
  badly.
* − Two constants (`HOT_PATCH_BUDGET_PAPER_MULTIPLE`, `MIN_HOT_RASTERS`) are now exported so tests
  derive from them instead of re-declaring the window size. That is a wider surface than the single
  private constant it replaced.
