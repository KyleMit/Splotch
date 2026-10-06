# Topology05 uncommitted corrections — independent source review

Read on 2026-10-06; source-only review in
/Users/kylemit/.codex/worktrees/migration-native-topology/Splotch. Actual base HEAD, read through
git rev-parse: a190af1f5d6257024daaf47c4cdbd2b95490e133. Root and candidate child authored this
slice; this reviewer did not edit it. Reviewed all three findings and full summary from
Claude37577782-0bed-4cd0-b563-312c5342c735. No candidate imports,
checker/generator/test/build/install/native execution, runtime proof or Git mutation occurred.
Transient generated evidence JSON was not inspected. Metadata hashes below bind source bytes read,
not executed results.

## Finding — P2: keep content-addressed plugin paths out of live Quality

File: tools/migration/lib/native-config.mjs:228–243; caller:
tools/migration/check-native-topology.mjs:81; current fixture:
tools/migration/tests/ownership.test.mjs:129–156.

The live reader accepts any real, canonical directory inside root node_modules. A committed path
directly into node_modules/.pnpm/<version-and-peer-key>/node_modules/<plugin>/android or the
equivalent SPM package therefore passes when that directory exists: its relative path is nonempty,
inside node_modules and its realpath equals itself. None of the new conditions rejects the .pnpm
component. This is a source deduction, not an executed repro, and the actual committed plugin paths
are not claimed wrong.

ADR0119:23–39 identifies this exact content-addressed committed-path churn as the reason for the
flat hoisted layout. Previously the installed-baseline hash comparison rejected such a configuration
change; removing that frozen check from ordinary Quality is correct, but it leaves this flat-path
constraint unguarded. The new ownership fixture proves a foreign path fails and a legitimate
Capacitor byte change remains live, but exercises no version/peer directory inside node_modules.

Bounded correction: retain current in-node_modules and physical canonical checks, additionally
reject .pnpm path components rather than restoring fixed hashes. A fixture should create a real
.pnpm/version/peer directory and drive inspectShippingPluginPaths with an actual Gradle/SPM path
into it, assert the specific rejection, and retain the existing flat plugin positive and legitimate
config-change behavior. This preserves future plugin additions or upgrades without pinning their
file bytes. No package-resolution framework or native build is needed for this source contract.

## Remaining inspected corrections

* Live/evidence decomposition is appropriate. Live check-native-topology.mjs:38–81 retains declared
  imports, workspace/lock/update ownership, installed Forge, candidate archive verdicts,
  production/import fences, native identity/config/types/transform and shipping realpaths. Exact
  contract/candidate-record/whole-lock/archive-selection/Capacitor hashes are in
  check-native-topology-evidence.mjs:21–39 only. Ordinary unrelated script or Netlify bytes are no
  longer compared in the live checker.
* assertCandidateArchiveInventory derives required archive identities from the actual candidate
  closure and baseline resolution map, instead of trusting selectedArtifacts or the whole current
  lock hash (topology-policy.mjs:240–281). It binds name/version/integrity/registry URL and the
  shared assertArchiveVerdict owner. Archive verdict still rejects root .hooks, binding.gyp and
  executing install hooks; prepare needs explicit publication-only disposition and root review
  (220–237). Changed candidate artifacts still require audit even when a root dependency update
  caused the shared resolution change; that is distinct from an unrelated root-only edit.
  Fixture377–385 covers the root-only case, 388–461 cover direct/optional additions, joint omission,
  same-version changed sources, registry URL and production leakage. No extra live baseline refresh
  is proposed.
* metadataContradiction was removed from the real fetch/record owner
  (archive-inventory.mjs:124–155). Abbreviated registry metadata remains informational. Tests now
  generate actual tar bytes, use omitted-script metadata, invoke inspectRegistryArtifact and pass
  resulting rows through both real verdict readers; binding.gyp/hooks/root-hook negatives and
  reviewed prepare positive retain specific failures (inventory.test.mjs:217–308). This addresses
  the fixture-only claim without inventing a registry verdict.
* Proof CI is explicitly scoped to the topology05 PR targeting codex/native-migration or the
  selected feature/netlify-migration-topology-05 push; both live and evidence commands run
  sequentially without ignore/condition settings on those steps (native-topology-proof.yml:3–35).
  Ordinary future migration PRs skip this exact historical proof job. The source-wiring test binds
  triggers, exact job condition, scripts and mandatory step/order, with
  missing/conditional/ignored/mis-scoped controls (topology-proof-wiring.test.mjs:14–81). CI
  execution, branch checks and cloud evidence remain parent-owned pending results.
* Forge guards now verify the actual npm script and top-level awaited main invocation as well as the
  direct installed mitigation call before audit; process.exit before the call or main fails the
  source guard. Negative controls cover npm no-op, no-op/dead/no-await main and preceding
  unconditional/conditional exits (run-quality-checks.test.mjs:210–391). The finite existing CLI
  shape is intentionally pinned; this does not require a general arbitrary-runtime verifier.
* gen-topology-proof-inputs.mjs:23–46 validates the live candidate archive/production owners, then
  derives only production-install-contract.json and candidate-exclusive-artifacts.json using
  existing owners. It does not mutate script-inventory, alignment/Capacitor evidence, source
  binding, archive review or proof receipts; console scope explicitly distinguishes derived inputs
  from review/executed proof (47–50). No new generator framework is justified. Actual generator
  exit/output comparison and manifest/source-bound evidence refresh remain execution obligations,
  not passing evidence in this review.

No other concrete source-backed finding in this bounded slice. This is not approval of the pending
installed checks, full tiers, final committed head, second Claude review or hosted Netlify proof.
The checks/root CLI fixtures must execute on the actual final source; source preparation and
ordinary CI successes from a190 do not establish these results.

## Read source hashes

```json
[
  {
    "path": "package.json",
    "bytes": 121297,
    "sha256": "7348b31a67caeecb68b44e4fee005513a4902f125cf874b33d34ed539a5bded9"
  },
  {
    "path": "tools/migration/check-native-topology.mjs",
    "bytes": 3674,
    "sha256": "09ff0998bca4346203471314e0dfea08a7d1b18b8f6064a2e526906b722ac21a"
  },
  {
    "path": "tools/migration/check-native-topology-evidence.mjs",
    "bytes": 2093,
    "sha256": "03bfdbaa515ff25793b93333660052f2d2e47d896995e633095905c21bc35b31"
  },
  {
    "path": "tools/migration/gen-topology-proof-inputs.mjs",
    "bytes": 2124,
    "sha256": "5e62c2dd5a679fbc2b74430ed1e4eab73f8976e35f874981dc4b60b808ef039a"
  },
  {
    "path": "tools/migration/lib/topology-policy.mjs",
    "bytes": 11716,
    "sha256": "42e91b92faf20595df66c8bd386e3b1012819aba5b20b056e093577f38ed25fa"
  },
  {
    "path": "tools/migration/lib/archive-inventory.mjs",
    "bytes": 5911,
    "sha256": "23a39938684155941a8b46eb181eeed29124f2d9de991d0acb54d0bd1b0d9c6a"
  },
  {
    "path": "tools/migration/lib/native-config.mjs",
    "bytes": 9114,
    "sha256": "8bc35ca76653a723f37b2099d5a56af3985e720f713f2ef7074a36ab7b43d01f"
  },
  {
    "path": "tools/migration/tests/inventory.test.mjs",
    "bytes": 18090,
    "sha256": "f5f429288580429ed1ba543a15f4a5ac7a7f79816489502d36d6ed6fddb1bc7c"
  },
  {
    "path": "tools/migration/tests/ownership.test.mjs",
    "bytes": 8206,
    "sha256": "4ea04c0cbaa7ce534ada0fc299ca0c3268ac89bc37589b7417b526e1b9bfc2de"
  },
  {
    "path": "tools/migration/tests/topology-proof-wiring.test.mjs",
    "bytes": 3762,
    "sha256": "21ac572440b4b55620acc4b1f15b7fd09f44e340073741e0b64ddfe2a2103675"
  },
  {
    "path": "tools/ci-mirror/tests/run-quality-checks.test.mjs",
    "bytes": 17503,
    "sha256": "4beec9cc0415c6d61294c59f5ccdb7162035d3422d1cec0f7e78d58a04545ada"
  },
  {
    "path": ".github/workflows/native-topology-proof.yml",
    "bytes": 860,
    "sha256": "3dd9e0a45e075f54065a5b8541a807b3fb802648edf1002374d478f60b88039f"
  },
  {
    "path": "tools/migration/README.md",
    "bytes": 2655,
    "sha256": "c47c7cc7883c58bbe4b251a5e180f4d3c53ea5f4e10cca69620bfa89f737df22"
  }
]
```
