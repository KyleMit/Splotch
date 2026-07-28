# Audit burndown — PR comment archive

Every per-finding comment the `burn-down-audits` runs posted to their pull requests: **464 comments
across 16 PRs**, from PR [\#535](https://github.com/KyleMit/Splotch/pull/535) (2026-07-24) through
PR [\#589](https://github.com/KyleMit/Splotch/pull/589) (2026-07-28), split into one document per
finding category.

Each burndown run opens a PR and posts one comment per finding as the driver lands it — what the
finding was, what the fix did, what the adversarial reviewer caught and how it was addressed, which
E2E specs gated it, and any supervisor note. Dropped and deferred findings get a comment too. That
commentary is the only durable record of *why* each change looks the way it does: `docs/AUDIT.md` is
drained as findings are burned down, and the commit messages carry only the one-line title.

**This archive is generated, not a source of truth.** It was assembled by reading the comments back
off the GitHub API; the PRs are canonical. Comment bodies are reproduced verbatim except that the
trailing agent-attribution footer is stripped (the runner is recorded per PR in the table below) and
headings are normalized to nest under each document's PR sections. Regenerate rather than hand-edit.
Generated 2026-07-28; split into per-category documents 2026-07-28.

## Categories

Each finding is filed by the category tag in its comment heading (untagged findings were categorized
by content; run-process notes and anything without a clean category land in
[Other & run notes](other.md)). Within a document, findings keep their original PR grouping and
order.

| Category                                            | Findings | What's in it                                                                                                                  |
| --------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [Duplication](duplication.md)                       | 101      | Copy-pasted logic, magic literals redefined in multiple places, and missing single sources of truth                           |
| [Maintainability](maintainability.md)               | 78       | Unnamed magic numbers, fragile coupling, unresettable module state, and other future-change hazards                           |
| [Readability](readability.md)                       | 41       | Opaque constants, confusing expressions, and code that needed naming or splitting to be understood                            |
| [Complexity](complexity.md)                         | 34       | Oversized functions/components split into named phases or extracted units                                                     |
| [Dead code & config](dead-code.md)                  | 33       | Vestigial fields, unused props/params/exports, and configuration that no longer does anything                                 |
| [Naming](naming.md)                                 | 32       | Ungreppable magic strings, misleading identifiers, and vocabulary drift                                                       |
| [Consistency](consistency.md)                       | 32       | Contradictory patterns across modules, plus platform/cross-platform branching drift                                           |
| [Type safety](type-safety.md)                       | 29       | Stringly-typed values, lost unions, unsound casts, and types the compiler could not enforce                                   |
| [Architecture & organization](architecture.md)      | 25       | Misfiled modules, god-modules bundling unrelated concerns, and structural/lifecycle issues                                    |
| [Error handling & correctness](error-handling.md)   | 14       | Swallowed errors, unsound guards, and latent correctness bugs                                                                 |
| [Design tokens & accessibility](design-tokens.md)   | 11       | Hardcoded values that belong in the token scale, and accessibility gaps                                                       |
| [Documentation & discoverability](documentation.md) | 11       | Stale or missing docs/comments, and knowledge that was hard to find                                                           |
| [Testing](testing.md)                               | 10       | Test quality, duplicated test setup, and code structured so it could not be tested                                            |
| [Performance](performance.md)                       | 8        | Wasted work, redundant computation, and perf-sensitive hot-path issues                                                        |
| [Security](security.md)                             | 2        | Security-relevant hardening findings                                                                                          |
| [Other & run notes](other.md)                       | 3        | Findings with no clean category, plus run-process notes from the burndown harness itself (canary halts, self-heals, CI notes) |

## Runs

| PR                                                   | Date       | Run                                                                                | Comments | Agent       |
| ---------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- | -------- | ----------- |
| [\#535](https://github.com/KyleMit/Splotch/pull/535) | 2026-07-24 | Audit burndown                                                                     | 41       | Claude [^1] |
| [\#540](https://github.com/KyleMit/Splotch/pull/540) | 2026-07-24 | Audit burndown                                                                     | 35       | Claude [^1] |
| [\#542](https://github.com/KyleMit/Splotch/pull/542) | 2026-07-25 | Cut the audit burndown over to run cloud-native (+ 7 findings)                     | 7        | Claude      |
| [\#543](https://github.com/KyleMit/Splotch/pull/543) | 2026-07-25 | Audit burndown: 9 fixes, and a fix for the driver destroying findings              | 11       | Claude      |
| [\#544](https://github.com/KyleMit/Splotch/pull/544) | 2026-07-25 | Audit burndown: 14 fixes, plus deferrals that keep their reasoning and their draft | 14       | Claude      |
| [\#545](https://github.com/KyleMit/Splotch/pull/545) | 2026-07-25 | Audit burndown: 7 findings fixed, plus a driver data-loss fix                      | 7        | Claude      |
| [\#546](https://github.com/KyleMit/Splotch/pull/546) | 2026-07-25 | Audit burndown: clear the staged docs/AUDIT.md backlog                             | 10       | Claude      |
| [\#547](https://github.com/KyleMit/Splotch/pull/547) | 2026-07-26 | Audit burndown — clear the docs/AUDIT.md backlog                                   | 41       | Claude      |
| [\#549](https://github.com/KyleMit/Splotch/pull/549) | 2026-07-26 | Continue audit burndown with Codex                                                 | 4        | Codex       |
| [\#550](https://github.com/KyleMit/Splotch/pull/550) | 2026-07-26 | Burn down staged audit findings (continuation 2)                                   | 24       | Codex       |
| [\#551](https://github.com/KyleMit/Splotch/pull/551) | 2026-07-26 | chore(audit): burn down 126 staged findings                                        | 70       | Codex       |
| [\#552](https://github.com/KyleMit/Splotch/pull/552) | 2026-07-27 | Audit burndown: clear the staged docs/AUDIT.md backlog (236 findings)              | 47       | Claude      |
| [\#554](https://github.com/KyleMit/Splotch/pull/554) | 2026-07-27 | Burn down staged audit findings                                                    | 38       | Codex       |
| [\#561](https://github.com/KyleMit/Splotch/pull/561) | 2026-07-27 | Burn down 114 staged audit findings                                                | 75       | Codex       |
| [\#583](https://github.com/KyleMit/Splotch/pull/583) | 2026-07-28 | Burn down staged audit findings with Codex                                         | 27       | Codex       |
| [\#589](https://github.com/KyleMit/Splotch/pull/589) | 2026-07-28 | Drain audit-deferred decision docs: implement the triaged fixes                    | 13       | Claude      |

[^1]: The two earliest runs predate the per-comment agent-attribution footer; they are attributed
    from their run era — the burndown moved to Codex at PR \#548.

PR \#548 opened the Codex-native cut-over and posted no per-finding comments; it is absent here for
that reason. The supervision-only PRs (\#553, \#555, \#560, \#582, \#588), the triage passes (\#559,
\#587), and the kit port (\#533) changed the harness rather than burning down findings, so they are
also out of scope.
