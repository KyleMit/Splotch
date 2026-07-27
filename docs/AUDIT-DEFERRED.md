# Audit — deferred findings

> Findings the scripted audit burndown (the `burn-down-audits` skill) moved aside instead of fixing
> — the verifier was unavailable, the implementation failed, or the change never passed adversarial
> review. Each needs human triage: re-stage it in `docs/AUDIT.md`, file it as an issue, or drop it.

*No deferred findings are currently staged.*

The 2026-07-27 triage pass reviewed all 49 deferred findings and drained them into per-finding
decision docs under `docs/audit-deferred/triage/` (see its `README.md` for the verdict index: FIX /
OPTIONS / DROP per finding, with rationale, ranked options, and pointers to the rolled-back draft
patches in `docs/audit-deferred/*.patch`). The full original finding texts remain in this file's git
history at that date.
