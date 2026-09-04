# ADR-0138: Track a Per-Campaign Subset of Raw Captures, Whole

**Status:** Active — depends on [ADR-0134](0134-frame-beat-from-the-dominant-interval.md),
[ADR-0136](0136-browser-target-lost-frame-gate.md); amends
[ADR-0059](0059-committed-run-artifacts-github-pages.md). **Date:** 2026-08

## Context

`perf-profiles/` is gitignored, so no campaign's raw captures survive a clean checkout. The
performance matrix works around it by carrying cells forward as *preserved evidence* — the published
normalized numbers, not the frames they came from.

The 2026-08 campaign made the cost of that concrete. When the metric was corrected twice (ADR-0134,
ADR-0136), every preserved cell kept whatever the superseded estimator had produced, because
re-scoring needs the raw frames and the raw frames were gone. Ten of eleven matrix targets still
publish numbers from a superseded metric for exactly this reason, and the only route back is device
time: the iPad recapture alone was 20 cells, and the campaign as a whole produced 132 capture JSONs.

The tension is real in both directions. Tracking everything makes re-scoring possible forever and
would have turned a multi-day recapture into a five-second script; it also adds repo weight, most of
it frame tables nobody will read directly. Not tracking them keeps the repo light and is the current
deliberate policy, but it means any metric correction silently invalidates the entire published
history.

Four options were on the table.

**Keep the policy and accept recapture** is what has been in force, and it has now been paid once.
The bill is not the device hours; it is that a *correction* to a known-broken metric cannot be
applied to history at all, so a defect found today leaves every past number permanently
unreconcilable.

**Track compressed frame tables only, dropping the verbose per-event rows** looked like the good
trade — `events` is 445 KB of a 622 KB capture, 71% of the payload. It was measured rather than
assumed, by re-scoring one capture with parts removed:

| Stored               | lost % | paint max | moves/s | fidelity verdict |
| -------------------- | -----: | --------: | ------: | ---------------- |
| Whole capture        |   1.53 |     44 ms |   117.7 | pass             |
| Without `events`     |   1.53 | **undef** | **0.0** | **FAIL**         |
| Without `measures`   |   1.53 |     44 ms |   117.7 | pass             |
| Frames + phases only |   1.53 | **undef** | **0.0** | **FAIL**         |

This option is not merely lossy, it is **actively dangerous**, and in this project's specific
failure mode. The headline number is unchanged and still plausible; what disappears is the paint
gate (the whole subject of issue 1203) and the input-fidelity verdict, which does not go missing but
goes *false* — reporting 0 moves/s and a failed cadence check for a capture that passed both. A
corpus stored this way would hand a future session a confident wrong answer with no error, which is
the exact shape of the three instrument defects this campaign already paid for.

**Publish them to `scrapbook/`** conflicts with what that tree is for. ADR-0059 established it for
keeper run *outputs*, and `scrapbook/README.md` says in terms that it is "not a dumping ground for
source code, raw data dumps, or scratch output". A frame table is a raw data dump: it is not
reviewable by eye, and `scrapbook:check` expects every collection to have a reachable entry page.

## Decision

Track a **subset** of raw captures, stored **whole**, under a narrow carve-out in `.gitignore`:

```
perf-profiles/*
!perf-profiles/evidence/
```

Two rules define the subset, and both follow from what re-scoring is for.

**Whole, never trimmed.** A capture is stored minified but complete. The measurement above is the
reason: every trimming that saves meaningful space also removes a gate or corrupts a verdict, and a
preserved capture that cannot prove its own input fidelity is worse than no preserved capture,
because it will be believed. Minified and packed this measured **104 KB per capture** across the
first two campaigns promoted this way (20 captures, 2.3 MB), against 2.4 MB pretty-printed on disk.
A desktop capture is the heavier end, because it carries all nine renderer phases.

Whole means the complete measurement and fidelity payload, not host-local identity. Promotion
replaces a structured capture's `device.id` and any sibling field holding that same value, such as
an Android `device.name` that is the serial. It also replaces a hand capture's string `device` in
the tracked copy and index. The gitignored source artifact remains byte-for-byte unchanged; a
descriptive device name where it is not itself the identifier, OS, transport, frames, events,
measures, and verdicts remain in the promoted copy. Hardware identifiers do not participate in
scoring or establish provenance, so retaining them adds disclosure risk without making the evidence
more reproducible.

**One capture per target × brush per campaign**, not per matrix cell. A metric change's effect
varies with the display and transport (the target) and with the workload (the brush); orientation
and theme are the axes least likely to interact with the *metric*, as against the product. That cut
is 44 captures for the full 11-target matrix — about 3.7 MB per campaign — rather than the 220 a
per-cell rule would take. The mode each preserved capture came from is recorded, so a later reader
knows which one it is looking at rather than assuming.

Promotion is explicit —
`npm run perf:evidence:keep --corpus=<dir> --campaign=<name> --product-commit=<sha>` — never a
default write path. The exact capture product SHA is required and stamped into the corpus index, so
the representative remains attributable after its gitignored source corpus and the manifest's live
paths are gone. The tree holds curated evidence only, and a capture enters it because someone
decided it was the sample worth keeping.

The consumer already exists: `npm run perf:rescore -- --corpus=perf-profiles/evidence/<campaign>`
re-derives every preserved capture through the shipped scoring modules.

## Consequences

\+ A metric correction can be applied to history. The operation that cost this campaign ten stale
targets and multiple days of device time becomes a script that runs in seconds over the preserved
corpus.

\+ The preserved captures carry their own fidelity verdict, so a future reader can tell a scoreable
capture from an unscoreable one without the session that took it — the single discipline this
campaign concluded matters most.

\+ Evidence promoted after the 2026-09 amendment does not disclose the hardware serial or UDID of
the physical capture rig. Earlier evidence still requires the cleanup tracked in issue 1645.

\+ Bounded and predictable weight: one target × brush grid per campaign, at a size that is known
rather than discovered.

− Roughly 4.5 MB of repo growth per campaign, in blobs no human will read. This accumulates, and
nothing prunes it automatically. Revisit if campaigns become frequent; the natural next step is
retaining only the most recent campaign per target plus any corpus an ADR cites.

− The subset is a judgement, and a question that turns on orientation or theme will find the
preserved corpus cannot answer it. That is the trade being made deliberately: per-cell coverage is
5× the weight for an axis that interacts with the product rather than with the metric.

− Promotion is a manual step, so it can be forgotten — and it will be forgotten exactly when a
campaign ends in a hurry, which is when it matters. It is named in the campaign runbook rather than
enforced, because the alternative (writing evidence by default) is what makes a tracked directory
grow without anyone choosing.

− `perf-profiles/` now has two kinds of contents, ignored scratch and tracked evidence, which is one
more thing to know about the directory.

## Amendment (2026-08-26): a bounded study-corpus exception

The one-per-target-×-brush rule assumes the corpus answers "what did this cell measure" — a spread
or repeat-count **study** answers "how much does this cell move," and for that question the set IS
the result: deduping a five-repeat spread corpus to one representative deletes the quantity it
measured. `perf:evidence:keep --keep-all` therefore retains every capture, under two bounds the PR
1383 review asked for: the flag refuses to run without `--study=<one-line rationale>`, which is
recorded in the corpus index where the next reader will look, and the exception remains per-corpus
and reviewable — a promotion PR carrying a keep-all corpus states the set's size and why the set is
the result, exactly as the first one (`2026-08-26-quiet-host-spread`, 19 captures, 8.1 MB minified)
does. Hand corpora keep their standing everything-kept rule unchanged; this amendment is the
automation-study counterpart, not a general retention loosening — a keep-all promotion with no study
rationale is the defect the required flag exists to refuse.
