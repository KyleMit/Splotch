# Audit Log

A committable history of every audit-skill run. Each audit appends **one row here
when it runs** (see `.claude/audit-conventions.md` §2). Most recent first.

Format — `| YYYY-MM-DD | audit-name | one-line summary of what it found |`. Keep the
summary to a single line; the findings themselves live in `docs/AUDIT.md` (or the
audit's own report), not here.

| Date | Audit | Summary |
| --- | --- | --- |
| 2026-07-05 | lighthouse-audit | Re-ran the production matrix (first + repeat, phone + tablet); every finding still stood — phone-first TBT 360–560 ms is the remaining lever, repeat visits Perf 99–100. |
| 2026-07-05 | lighthouse-audit | First production audit (real Netlify serving) corrected the local-preview numbers (LCP 5.4 s → 1.9 s); filed TBT / main-thread page-load opportunities in `docs/AUDIT.md`. |
| 2026-07-03 | code-audit | Full-repo pass (PR #38) → prioritized perf / readability / maintainability / architecture findings in `docs/AUDIT.md`; themes: duplicated CSS/helpers, touch-hover guards, canvas mount-path work. |
| 2026-06-25 | dependency-audit | Surveyed `npm outdated`; flagged the coordinated Capacitor and Svelte/Vite families as landmines, upgraded the safe leaf/dev packages one commit at a time. |
