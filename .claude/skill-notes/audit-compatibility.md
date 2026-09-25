<!-- Source: .ruler/skill-notes/audit-compatibility.md.template -->

# audit-compatibility — design notes

Built for issue #2327 by running the audit once by hand, then writing the skill from that run's log
(`docs/scratchpad/compatibility-audit-2026-09.md`). The skill is aimed at what drifts between runs,
not at the first run's backlog.

## Why an `audit-*` skill and not `reconcile-browser-floor`

The issue first asked for `reconcile-browser-floor`, a skill that would raise the floor and delete
the fallbacks in the same run. That shape has to stop mid-run for a keep-or-raise decision, which is
a product call and needs an ADR when the floor moves. As an audit, the raise becomes a finding;
`vet-audits` turns it into an issue, and the decision happens there with a human in the loop. It
also puts the skill on the existing find → vet → fix pipeline instead of a bespoke one.

## Why the report is a script

Three parts of the first run were mechanical and will be repeated identically: the browserslist
coverage arithmetic, the probe grep (about 60 raw hits, most of them type narrowing or app
callbacks), and web-features lookups. `tools/report-browser-floor.mjs` owns them so the skill spends
its words on judgment. `web-features` and `browserslist` became direct devDependencies for it; both
were already in the tree transitively (Lighthouse, Babel), so the lockfile gained no new packages.

Probe detection is heuristic on purpose. Rejected: a TypeScript-AST scan (heavier, and the idioms
are single-line); flagging every optional call (app callbacks drowned the output — 30+ false hits).
Optional calls are reported only when the method name is an interface member web-features tracks.

## Known gaps

* The report sees JS probes only. Unguarded CSS features and unguarded API calls are found by
  reading the diff since the last run, which the skill asks for.
* The register's Baseline cells have no mechanical check. Rows carry no web-features id, so a test
  cannot look them up; adding an id column was considered and deferred until a second run shows
  whether cell drift recurs.
* caniuse-lite and web-features freshness follow Dependabot. An audit changes no code, so it reports
  stale data rather than bumping it.
* Not on the Claude Routines schedule in `.claude/audit-conventions.md`. Adding a routine is a
  configuration change outside the repo; a quarterly cadence fits how slowly the inputs move.
