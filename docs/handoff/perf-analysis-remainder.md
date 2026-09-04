# Distillation of the 2026-08 perf-campaign analysis — remaining findings

> 2026-08-31 · branch `claude/perf-distill-07-admission-guards` · PR
> [#1537](https://github.com/KyleMit/Splotch/pull/1537) · Carry the un-shipped findings from the two
> campaign transcript analyses to their next owner

## Objective & non-goals

The two 41-session transcript analyses (Claude lane:
`docs/scratchpad/session-reports/2026-08-31-claude/aggregate.md` on branch
`claude/perf-campaign-analysis-bc1098`; Codex lane: same path `…/2026-08-31-codex/` on
`analysis/2026-08-31-codex`) were distilled into stack \#1533 — PRs \#1530–\#1532, \#1534–\#1537 —
covering ~28 findings. This packet holds what was deliberately NOT shipped, ranked, so a later
session can pick it up without re-reading either aggregate. Non-goals: re-fixing anything the
2026-08-31 mitigation wave already shipped (status protocol, no-inheritance rules — untested by the
corpus but present; the stack pre-push guard that wave also shipped was removed in \#1549);
re-litigating the shipped stack.

## State

Stack \#1533 (bottom→top): \#1530 trap-catalogue entries → \#1531 ADR-0153 (GPU dead end) → \#1532
campaign skills → \#1534 review-family skills → \#1535 enumerate-sub-issues skill (added as
inventory-epic) → \#1536 artifact identity (harness) → \#1537 admission guards (harness). Six Codex
review rounds ran across the stack (every finding validated against the code before acting; all
accepted ones fixed, tip at c5495baec including the round-2 unproven-commit refusal); the resumed
round confirmed its earlier findings addressed. Tip empirically verified on the physical Android
(artifact records `buildEntry`/`buildDigest`/`productCommit` from the build-time stamp;
`paintedOutput.changed: true`; fidelity PASS — no false red; nonce-named report file). `npm run
test:tools` 3151 green at the tip.

## Remaining findings, ranked

1. **The stale-shell A3 mystery is unresolved** (session 01a0556d §A3): the versioned-manifest 404
   recurred on captures whose entry-module identity check PASSED, attributed in-session to a
   persisted pack-manifest request but never proven with a clean-state control. Three of PR \#1516's
   captures carry the caveat. Next step is one control: unregister the SW + clear website data on
   the iPad, fresh capture, watch for the 404. Cheap, settles the attribution, and the catalogue
   entry (\#1530) documents the open question.
2. **Checkpointed long diagnostics** (Codex lane rank 3, ≥123.6 evidenced minutes): ad-hoc sweeps
   hold results in memory — a browser sweep died at row 21 losing all rows; an artifact-name
   collision discarded both iPad artifacts. Candidate: a small shared append-a-JSONL-row helper
   under `tools/perf/lib/` plus a PROFILING.md rule that any sweep beyond ~10 rows writes
   incrementally. Needs a design pass; nothing owns it yet.
3. **Desktop capture runners don't record build identity** (noted in \#1537):
   `capture-local-frames.mjs` / `capture-desktop-actions.mjs` still discard the served-build guard's
   result; their artifacts fold under the absent-field convention. Clean follow-up extending
   \#1537's recording to them.
4. **SHA posting-time validator**: the rule text exists (root instructions + memory) and the verify
   loop works; a `tools/` one-shot that scans a body-file for 7–40-hex strings and `git
   cat-file`-checks each would make it one command. Small and unowned. (5 occurrences in one
   session; also a published review citing a nonexistent commit, Codex lane.)
5. **Wrapper-observability contract** (Codex rank 8, 23 sessions): nested failures behind green
   wrappers. \#1530 documents the pipe-exit-code tell; a mechanical contract (e.g. `proc.mjs`
   helpers asserting nested status) was not attempted — most instances are ad-hoc shell where no
   central seam exists. Revisit only with a concrete seam in hand.
6. **`report-campaign-status` as a standalone skill** (Codex rec 5; 46 prompts/14 sessions): the
   campaign skills now own the status protocol; a standalone skill for non-campaign contexts was
   judged marginal. Reopen if bare "status?" prompts keep recurring outside campaigns.
7. **Host-only review-launch scripts** (`~/.local/libexec/splotch-claude-*.mjs`, partly mirrored at
   `.agents/skills/run-rival-agent/scripts/`): bringing them into `tools/` was the Claude lane's
   secondary rec.
8. **`personal-device-scripts.md` stale premise**: the pinned `ANDROID_SERIAL` names an SM-S938U1
   while committed targets name SM-G990U1 — reopen the decision record (root instructions already
   flag this).

## Dropped with reasons (do not resurrect without new evidence)

* **Sandboxed-port-masking of perf assertions** (Claude lane Q1 item 3a): verified NOT to match
  current code — the tests fail, not pass, on reservation failure. Historical.
* **FIFO device lanes / dual-lane scheduling**: measured zero same-device contention and 4m50s total
  queueing across the corpus; nothing to build.
* **Build caching**: builds are ~1–3h of a ~100h active corpus; not worth touching.
* **Releasing devices overnight**: takeover is 2m21s and leaving the rig up is the documented,
  evidence-backed choice.
* **120h user-idle reduction**: the turn-discipline/status fixes shipped 2026-08-31; the rest is
  operator-side scheduling, not repo-encodable.

## Unverified assumptions

* The 2026-08-31 mitigation wave (status protocol, causal-order workflow) works — untested by any
  corpus; the next campaign is its first exercise, and the analyses recommend watching for exactly
  that. The stack pre-push guard that wave shipped was removed in \#1549, so its efficacy is moot.
* The `focused-contradicts-sweep` and `blank-output` guards have not yet fired on a real bad capture
  — their known-bads are fixtures from the corpus incidents. The first live firing is worth a note
  in the catalogue.

## Reread first

* `docs/scratchpad/session-reports/2026-08-31-claude/aggregate.md` (Claude lane, on its branch) —
  the ranked evidence behind every item above.
* `docs/scratchpad/session-reports/2026-08-31-codex/aggregate.md` (Codex lane, on its branch) — the
  timing/device numbers.
* `docs/PROFILING-CAMPAIGNS.md` — updated by \#1530/\#1537; the A3 open question lives in the
  service-worker entry.
