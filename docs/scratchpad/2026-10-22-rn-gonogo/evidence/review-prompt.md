Do a full independent review sweep first; then examine the extra focus areas below. This PR is a
docs/evidence-only RN go/no-go desk review against codex/native-migration. The candidate is frozen
at fffeed1fe4116112bb10297a180ac552f9754046, shipping main at
ef3d1eb2070c1bd0dee620ed42a2b14201c2a9b4, and store release source at
d8b86469f63c57a06a9de45664a42eea15b99eb0. No product source/config/tests may change and every file
must stay under docs/scratchpad/2026-10-22-rn-gonogo/.

Extra focus:

* Check that measured source/lock counts are reproducible and not confused with packaged runtime
  dependencies, semantic SLOC, engineering effort or BURDEN eligibility. Native Gradle resolution
  could not complete in this cloud environment; the report must expose that limitation accurately.
* Check the native ink/React claim against the actual live-feed and JSI path and the narrower scope
  of the five rsd-native-render-budgets tests. Do not infer device performance from their pass.
* Check parity status accounting across the original ledger, protocol mapping and final subcells.
  The generator fails on a removed test at the freeze; bug #3182 was filed and deliberately not
  fixed. Historical verified rows are not current final-matrix passes.
* Check recursive epic accounting and scope changes in comments. Existing open #3121/#3122/#3142 sit
  outside the epic child tree. #2985 is now physical verification; #3148 now needs Distribution
  signing/export; #3007's implementation is already delivered. Evaluate whether the finish estimates
  double-count work or invent mandatory features from deferred issues.
* Check CI sampling selection and duration arithmetic against raw run/PR SHAs, plus qualification of
  inconsistent historical bundle-swap timing claims.
* Challenge the rollback recipe: neither store accepts a lower version/build for this recovery, old
  Capacitor projects only survive on preserved shipping refs, Photos differ from RN-only held/AI
  data, and rollback must not revive dormant sensitive/allowance state blindly.
* Adversarial pass on the overall strategy: argue the strongest case against holding both native
  cutovers from desk evidence, and whether the per-factor scores and unmeasured planning ranges are
  honest about uncertainty. No weights were supplied, so no aggregate score was invented.

Empirical verification: read-only review of report, scripts, committed raw receipts and current
source. Request targeted census/script checks or Git inspection through the broker when useful; no
full suite, device, store, deployment or source edits. The author has already run the targeted
render-budget tests and failed protocol mapping in a separate detached frozen worktree. Every
measured number needs its exact source, tool/version, command, count and raw receipt; planning
estimates must be labelled as estimates. Issue snapshots preserve full text with physical device
identifiers redacted. Raw JSON whitespace may be formatted; no semantic evidence is intentionally
changed.
