# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`).
> Clear the whole list autonomously with `/fix-audits`; validate it with `/vet-audits`.
> Skills **merge** into this file — they never overwrite each other's sections.

## Source: Code audit

### [Performance] Undo keyframe rasters are bounded only by the 10-command stack cap — worst case ~300 MB retained

**File(s):** `web/src/lib/drawing/undoHistory.ts` (`maybeKeyframe`, `foldOldestIntoBaseline`, `paintStateThrough`; formerly in `engine.ts`)

**⏸ Pending decision:** Excluded from the 2026-07-07 sweep by user request while the drawing engine was being refactored; that refactor (engine module split) has since landed on main. Re-run `/fix-audits` to pick this up.

#### Problem

`maybeKeyframe` allocates a keyframe canvas at `baselineCanvas` size — a `max(w,h)` square at up to 2× DPR (a 1024×1366 iPad → 2732² × 4 B ≈ 30 MB). The comments bound *when* a keyframe fires (outlier commands past 384 post-simplification segments) but nothing bounds *how many* of the ≤ `MAX_UNDO_STACK_SIZE = 10` retained commands hold one: 10 pathological scribbles (the exact "finger held down for a minute" case the comment cites) retain ≈ 300 MB on top of the baseline + visible canvas + magic sheet — enough to get a WKWebView killed on older iPads. Real sessions peak ~140 segments per the comments, so this is worst-case hardening, not a common-path leak.

#### Proposed solution

Cheap cap: when creating a new keyframe while an older one exists, fold history *through* the older keyframed command into the baseline — repeatedly shift via `foldOldestIntoBaseline` (which already blits a keyframed command wholesale) until that command is folded. Don't just drop the older raster: it isn't dead — undo can pop the newer keyframed command, after which `paintStateThrough` would start from the older one. Folding trades undo depth for bounded memory, which is the accepted cost.
