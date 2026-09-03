# tools/rival-agent/bench — the seeded-defect bench

Measures a rival against a corpus of real defects rather than against one diff. Its first run
compared the two `--sandbox` modes the pairing carried for one PR cycle and collapsed the flag (the
run's report is in `docs/scratchpad/`, its summary in `NOTES.md`); since then it compares rivals.
Each seed under `seeds/` reintroduces a defect the rival found while the pairing was built (their
fixes are in the history of PR 1575 and 1576, and the build log in
`docs/scratchpad/rival-agent-pairing-2026-09-02.md`), and the bench asks: launched on that seeded
tree, does the rival find it, at what severity, at what cost in handler turns and tokens? Controls
carry no defect and measure false positives. `NOTES.md` one level up records why the bench exists
and what it decided.

## Entry point

```sh
npm run rival:bench -- --validate
npm run rival:bench -- --rival codex --reps 2
npm run rival:bench -- --rival claude --reps 1 --seeds paginate-without-slurp
```

`--validate` proves the corpus before anything is spent: every seed's repro must exit zero on the
base and nonzero once the patch is applied, and a control's must exit zero both times. The bench
refuses to launch a rival on a seed that fails that check; drop such a seed rather than lower the
bar.

A run creates one bench worktree per cell at `--base` (default `main`), applies the seed, launches
the rival on the worktree's uncommitted scope with `--fresh`, serves the broker itself, scores the
findings against the key, removes the ledger record and the worktree, and writes one JSON per cell
under `<out>/results/`. Cells run sequentially, repetition-major, so an interrupted run leaves a
complete first pass. Re-running with the same `--out` skips recorded cells. The Markdown report
lands at `--report` (default `<out>/report.md`); `<out>` defaults to a directory under the system
temp root.

## A seed

```text
seeds/<name>/
  seed.patch   git diff against the base that reintroduces the defect (and, as a real regression
               would, adjusts the test that pinned it so the suite stays green)
  key.json     the answer key: path, expected line range in the seeded file, severity floor,
               keywords the finding body may name instead of the exact lines
  repro.mjs    exits nonzero on the seeded tree, zero on the base; imports the modules under test
               from its working directory, which the bench sets to the seeded worktree
```

A control's key carries `"control": true` and no path; its repro passes on both trees. A seed whose
repro would need the network or the physical device rig is not a valid seed.

## The bench as handler

The bench judges requests mechanically (`lib/handler.mjs`): a command is approved when every
absolute path it names is inside the session directory (the worktree and the packet) and it names no
network tool, host-exclusive suite, or dependency install; anything else is declined with a reason
the rival can read. Approved commands run with `bash -c` in the worktree, output captured to the
spool, and are killed after fifteen minutes. Every decision is recorded on the cell.

## Scoring

`lib/score.mjs`. A finding matches the key when it anchors to the seeded file within three lines of
the seeded range, or anchors to the seeded file and its body names one of the key's keywords.
"Detected" is any match; "severity met" additionally requires a matching finding at or above the
key's floor. Findings that match nothing count as false positives, on seeds and on controls alike.
Cost is handler turns (approved plus declined), the rival's own shell commands read from its stream
log, wall clock, and normalized tokens.

## Failure behaviour

A cell whose launch fails is recorded with `failed` and the bench moves on; the summary counts it.
The run exits nonzero if `--validate` finds an invalid seed. This bench is manual and spends plan
usage; it is never part of `npm test` or CI.
