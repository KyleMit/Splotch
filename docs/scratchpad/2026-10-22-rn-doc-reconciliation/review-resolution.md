# First-review dispositions and consistency pass

Claude round one reviewed the exact migration base through 7a35b5b1c4783fa7f19f79892b4db32366edead8
and posted
[eight findings](https://github.com/KyleMit/Splotch/pull/3178#pullrequestreview-5609345976). All
eight are valid.

| Finding                                     | Resolution                                                                                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong ADR-0095 scope                        | Removed the unrelated containment paragraph and its disposition. The original identity/index gate decision remains unchanged; the current-owner receipt names its live checker.                                                             |
| Start-here contradiction                    | Replaced superseded Svelte recommendations with current RN decisions, moved 0002/0004 to Historical, and checked every index entry against its record status.                                                                               |
| Missed retired records                      | Superseded the five flagged records after reading their contexts and absent owners. The full current-record audit also retired 0021, 0034, 0038, 0153, 0171 and 0175, with precise mechanism scope and no new product defect claim.         |
| New-release snapshot instructions           | Corrected cut-release and script help: RN tags do not get legacy snapshots or inventory entries. Existing addressed bytes remain protected. Historical generator/tag paths and retention implementation are unchanged.                      |
| Environment comments and duplicate fallback | Root .env examples describe explicit Node loading, the real E2E environment owner and current tool precedence. Removed one duplicate vectorizer load; three offline CLI cases pass with fixture credentials and an intercepting fetch stub. |
| Script help                                 | Updated ESLint and CSS help, then searched every script description and active release guide for retired toolchain and new-tag instructions.                                                                                                |
| Stale disposition paths                     | Re-extracted every amendment receipt from its final ADR text; 0028/0045 name their actual current owners.                                                                                                                                   |
| Index native heading                        | Uses React Native / Android / iOS.                                                                                                                                                                                                          |

## Expanded owner audit

A framework-keyword candidate list was insufficient. The consistency pass read the title, status,
context and decision of all 110 initially current records, then checked each surviving decision
against its current owner. It re-read all 63 original added scope notes and verified every final
note's explicit repository paths. `adr-current-owners.json` records all 99 remaining Active/Accepted
decisions: 74 amendments and 25 unchanged decisions. Every owner path exists. An owner may be code,
tooling or the policy document; the table does not claim every decision is automatically enforced or
newly measured.

The removed 0095 paragraph was a category error. Additional inaccurate current-owner claims were
corrected rather than generalized: the matrix-age checker and View Transition mechanism do not
survive, and the page-inventory tooling reviews recorded evidence without a fresh RN capture
command. The installed-web launch decision stays scoped to the web manifest; no nonexistent branding
generator or native launch qualification is asserted. The live geometry notes name paperSpace,
paperGeometry and paperPresentation.

All active ADR entry points were checked: the index's Start here and area tables, the adrs reference
skill, root architecture/README guidance, and the current-owner receipt. Start here contains only
current records; all cutover supersessions occur in Historical exactly once. Original sections and
measurements of the 136 scope/supersession records remain preserved. ADR-0182 separately received
the requested current-state wording update; its accepted decision is unchanged. `check:adrs` proves
structural integrity; the contextual owner audit provides the separate semantic judgment.

The release instruction sweep covered cut-release, build, publish-artifacts, mobile,
releases/README, tools/release/README, both generated providers and scripts-info. The only
generator-for-new-tag instruction was in cut-release and scripts-info. The release README also
contained old generated-output paths, which were corrected. No legacy tag input path, snapshot,
inventory pin or retention guard was changed.

The unused chisel installation, tunnel environment entries and their cloud setup claims were removed
only after the cloud-preview skill and all executable callers were checked. No replacement tunnel or
provider was added. Further active prose cleanup names the actual standalone marketing renderers and
removes false matrix-checker claims from Quality. Historical incident examples and archived evidence
retain their dated commands.

## Verification

The initial full Quality, browserless, web export and Chromium evidence remains in validation.md.
See the PR for composed repair-gate outcomes and exact-head CI. The parent retains native
proof/signing ownership and the fourteen parked gaps.

The cloud setup suite still has 15 cases. Removing the chisel-only source-replacement precondition
and stubs preserves every active warning/Codex-version check. Its two-warning case uses Corepack
plus Playwright failures instead of Playwright plus the retired chisel install. The first full tools
run exposed 14 failures at the obsolete fixture precondition (8,134 pass / 14 fail); the corrected
setup suite passes all 15 cases. No test case, cap or threshold was removed. The final full tools
count is reported on the PR.

The script-help sweep also found the retained icon viewBox CLI reading a deleted directory. Its real
camera command failed with ENOENT before the path correction and passed afterward; all art bytes
remain identical. A real-CLI case in the existing geometry suite proves catalog discovery without
rewriting the exempt mascot. It fails before the fix and passes after it. Generator help and
generated headers name the current assets owner. The two generated runtime files change only
headers; all 24 changed production TypeScript modules emit identical JavaScript to the base.

## Final review

Claude round two
[confirmed every first-round fix](https://github.com/KyleMit/Splotch/pull/3178#pullrequestreview-5609533589)
and found no blocking defect. Its one new suggestion is valid: ADR-0125 must distinguish the
retained rebase tool from the retired catalog-grid test. The scope note, two receipts and CLI header
explicitly state that no automated grid guard survives; the historical decision remains intact. No
new guard, geometry change or product-gap assertion is included. This completes the two-round
budget.

CI also caught formatting drift in semantic-adr-proof.json after the scratch checker rewrote it
after the local format pass. The final address pass runs the semantic checker before formatting,
then stages the complete evidence before the final gates. No source generator runs afterward.
