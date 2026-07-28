# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

## Source: Code audit — Root config (package.json, dprint, tsconfig, …)

## Source: Session audit

## Source: Deferred-audit triage — FIX verdicts (2026-07-27)

These 30 findings were deferred by earlier `burn-down-audits` runs (failed implementation or failed
adversarial review), then triaged on 2026-07-27 with a FIX verdict: a single clear-winner solution,
including — where a rolled-back draft exists in `docs/audit-deferred/*.patch` — exactly what must
change versus that draft to survive the recorded reviewer objections. Each entry carries its prior
review context; line numbers cite the SHAs noted inline. The triage's disposition index
(`docs/audit-deferred/triage/README.md`) lives in git history; the directory was removed once every
verdict was dispatched.
