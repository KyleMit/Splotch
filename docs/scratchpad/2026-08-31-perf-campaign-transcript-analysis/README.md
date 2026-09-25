# 2026-08 performance-campaign transcript analysis

Two independent analyses of the 41 transcripts from the August 2026 deployment-target performance
campaign, one per agent lane. Stack \#1533 (PRs \#1530–\#1532, \#1534–\#1537) shipped the findings
that were distilled from them; `docs/handoff/perf-analysis-remainder.md` carries the ones that were
not.

| Lane   | `aggregate.md`                                      | `fixes.md`           |
| ------ | --------------------------------------------------- | -------------------- |
| Claude | The ranked evidence behind every remaining item     | Per-fix segmentation |
| Codex  | The timing and device numbers the handoff relies on | Per-fix segmentation |

Only the two summaries per lane are kept here. Each aggregate still names the per-session
`reports/`, `ledgers/`, and `manifest.json` it was written from; that corpus (about 25 MB across
both lanes) lived only on two local branches, `claude/perf-campaign-analysis-bc1098` and
`analysis/2026-08-31-codex`, and was deleted with them in the 2026-09-24 workspace cleanup. The
aggregates quote the figures they depend on, so reading them never requires the per-session files.
