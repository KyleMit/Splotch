# Local validation and expected CI

All commands below completed with exit code zero on the staged source/config candidate. Quality and
browserless ran serially in the final passes. The initial overlapping run's ENOENT is an execution
overlap, not product evidence: Ruler temporarily replaces/restores direct provider packages while
doc guards read them. Its raw log remains in the unit scratch directory for the parent's separate
self-heal unit.

| Command / proof                                             | Result                                                                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm run check:quality                                       | All 12 checks pass, including format, all TypeScript projects, lint, provider drift, dependencies and the existing advisory policy.                      |
| SMOKE_PORT=5300 npm run test:browserless                    | All six tiers pass: 2,021 shared, 299 asset, 20 store-drawing, 8,148 tool, 1,043 mounted RSD and 46 API checks.                                          |
| npm run build:site                                          | Export/precache and every startup/page byte budget pass. First paint 45,660 / 47,052; core controls 818,678 / 827,535.                                   |
| npm run postnative:web:build                                | Documents without scripts, the real-function admin flow and 67 safe-area scenarios across 20 profiles pass.                                              |
| npm run check:doc-refs                                      | Zero unresolved paths/scripts or stale exemptions.                                                                                                       |
| check:doc-refs -- --identifiers                             | All 105 remaining advisories dispositioned; no new scanner exclusion.                                                                                    |
| npm run check:skill-refs                                    | Clean; the original human sigils are preserved verbatim in plain-text authorization evidence.                                                            |
| npm run check:adrs                                          | 177 uniquely numbered/indexed records, valid ADR links.                                                                                                  |
| npm run ruler:check                                         | Generated provider output matches the authoritative sources; direct packages preserved.                                                                  |
| bash -n on Claude SessionStart and both Codex cloud scripts | Shell syntax passes. No cloud provisioning or credential setup was executed.                                                                             |
| Runtime source proof                                        | All 22 changed app/Netlify/buildVersion TypeScript files emit identical JavaScript with comments removed.                                                |
| Native/assets/dependency invariant proof                    | Native projects, assets, locks and dependency declarations are unchanged. Startup-cap source is byte-identical; Lighthouse differs only in sourceDigest. |
| Share cards                                                 | Existing generator rerun after token comments; all four PNGs byte-identical to the migration base. Only input provenance changes.                        |
| TSX regression control                                      | Existing lint-file test fails with the old filter and passes with the TSX fix: 79/80 then 80/80.                                                         |

The code-map snapshot is the committed rules revision 604943098c34039aa638d5bd8d5bb5e9615fa516, not
a claim that its totals count later documentation edits. It has no unassigned paths or unused domain
rules. Counting exclusions are unchanged.

## Expected pull-request checks

Before waiting, workflow inspection establishes eleven applicable jobs:

* Tests: Quality, Browserless tests, Native web build, Page-load performance, RN web E2E shard 1/2,
  RN web E2E shard 2/2, Firefox smoke and WebKit smoke.
* Native compile: Android Release APK build and iOS Release simulator build (source/package/workflow
  paths apply even though production edits are comments/metadata).
* ADR Integrity: ADR numbers, headings, and index entries agree.

Centerline tracing is excluded by its unchanged path filter. Dependabot review is excluded by the
actor condition. Label sync, Pages, scheduled cache/digest/hosted jobs and tag/dispatch native
deploy smokes are not ordinary PR checks. The parent determines whether an additional exact-head
native smoke dispatch is required from the final normalized runtime/build diff.

Live ruleset inspection finds rules for the default branch and pr-assets only. The migration branch
reports protected:false, at 109b5c38b4010e4c93a5ce166b3d424ba4d7f0a8. The campaign still requires
all applicable checks, rival review and an unchanged exact gated base; no protection is bypassed.

The original user grant, fourteen parked product gaps, release-signing limitations and parent-owned
merge/closure remain in force. No successful IPA export is claimed here.
