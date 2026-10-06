# Netlify cached production install repair

The first automatic topology proof at 423769b486d81a8da0cdd1c1e6abfedc31bec757 failed before the web
build. Netlify restored a 1.1 GB cache last modified 2026-10-05 01:32:56 UTC, whose producer is
unknown. Its ordinary frozen production install retained `brace-expansion@2.1.1` under
`node_modules/filelist/node_modules`. The complete production-tree witness correctly refused this
package outside the reviewed graph. The original failed deploy is `6ac4b006e2ce39000805a7b9`; the
visible failure excerpt and allowlisted platform records are preserved in `controls/`. This is a
failed cloud record, not an accepted install or deployment.

The configured build command calls `tools/netlify-production-install.mjs` before `npm run build` and
function staging, with `&&` at both boundaries. Its fixed released `pnpm ci --prod` reconstructs
both reviewed workspace module roots using the frozen lock. Qualification reads current
manifest/runtime/layout/build-policy owners on every context; it does not pin ordinary future
deployments to an archived contract. The original topology05 contract and evidence remain
byte-identical. The separate current `production-install-contract.json` belongs to the selected
proof witness and its exact evidence checker.

The caller requires canonical regular workspace roots, current Node/manager/flags, no project
install or prepare lifecycle stages, no unreviewed pnpm preloads, the actual hoisted linker and
all-false dependency build policy. Named `config get --json` children distinguish absent defaults
from an explicit string `"undefined"`; no configuration list, auth file or complete environment is
printed. The conservative workspace spelling guard intentionally refuses escaped/interpolated
preload syntax and a present global pnpm configuration YAML. A future manager, lifecycle policy or
such syntax requires a reviewed caller amendment. Authentication/network configuration remains with
pnpm.

## Local executed controls

The exact controlled source archive and current overlays are bound in
`controls/local-controls-receipt.json.txt`. Its named-proof environment is synthetic and cannot
substitute for an actual Netlify run. All twenty-two recorded steps met their stated acceptance or
refusal. The scripts and every captured log are retained.

| Actual route                                                   | Result                                                                                                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cached ordinary frozen production install                      | Retained the seeded stale leaf; full witness refused its exact name/version                                                                                      |
| Frozen production install with force, then production prune    | Both retained that leaf; the same full witness refused it                                                                                                        |
| Qualified warm clean production install                        | Removed the root nested leaf, candidate leaf and hidden-store residue; safely unlinked a package leaf without changing its outside sentinel; full witness passed |
| Nonworkspace leaves in web, functions and tools                | Each survived workspace reconstruction; the unchanged five-context witness separately refused each                                                               |
| Candidate-context shared name at a reviewed production version | Full witness passed, preserving the version-aware fence                                                                                                          |
| Explicit string `modules-dir` and aliased module root          | Both refused before clean; outside sentinels stayed unchanged                                                                                                    |
| Qualified cold clean production install                        | Full witness and actual production release build passed                                                                                                          |
| Genuine frozen-lock mismatch                                   | Recorded nonzero installer exit and never reached the build continuation                                                                                         |

The total qualified local caller took 9.46 seconds warm and 8.77 seconds cold, including its named
qualification children; these are two observations on this host, not cloud timings. Its initial
platform-like install remains a separate stage. Reconstruction does not clean nonworkspace module
directories or unknown hidden entries. The selected witness still owns physical graph acceptance. A
failed frozen install can leave the workspace module trees empty after clean; rollback is not
claimed.

All fifteen local Quality checks, seventy-six focused installer/witness/contract controls, both
current/live topology guards, and the installer controls on actual Node24 passed. Three genuine
predecessor inversions failed at their specific assertions: remove the deployed installer command,
omit the two prepare lifecycle stages, or omit module-directory qualification. Every source was
restored byte-exact. The full ordinary test tier, exact-PR Claude review, CI and a fresh automatic
hosted proof are subsequent acceptance records; this source/evidence unit does not claim them or
native/renderer performance acceptance.

The first full test tier failed at the existing topology-only workflow fixture. Its exact failed run
is preserved in `controls/first-full-tier-log.txt` and `controls/first-full-tier-receipt.json.txt`.
The corrected guard covers both actual PR routes and keeps mandatory-command, ordering, scope and
trigger negative controls. That failure supplied no browser acceptance.

The second complete tier passed 4,463 app units, 45 SSR guards, 298 asset tests, 22 store-drawing
tests, and 7,389 tool tests. Its browser run passed 1,169 of 1,170 cases; the unchanged compact
custom-color picker case remained hidden after a single open click. The exact failure and browser
context are retained. Five isolated executions of that unchanged case passed; that is an isolated
recheck, not a first-pass full-suite success or a proof of root cause. A complete browser rerun and
exact-head CI remain separate acceptance. The final fifteen-step Quality run after the workflow
correction passed.
