# Guarded node-forge mitigation in topology 05

## Status and review boundary

The published `node-forge@1.4.0` remains affected by
[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv). On 2026-10-06 the advisory
lists no patched version, npm latest is 1.4.0 and the registry request for 1.4.1 returns 404. No
published fix or global non-exploitability is claimed. Expo helpers verify certificates and CSRs
supplied from outside, even though these packages belong only to the private candidate's development
graph.

Codex implemented the narrow patch route after delegated Codex and independent Claude source and
regression reviews. Claude's combined-source review required an explicit second ADR-0031 policy
basis, forbidden consumers of the unpatched dist bundles, and a real retirement issue. The exact
exception is recorded in [DEPENDENCIES.md](../../../DEPENDENCIES.md), reviewed by 2026-11-05, with
retirement tracked in [issue 2696](https://github.com/KyleMit/Splotch/issues/2696). Maintainer
review and merge remain absent; this contributor-patch risk is accepted for this bounded interval.

The authorized lock-only refresh and patched frozen install succeeded. The mandatory installed
source/crypto/consumer guard and the focused tests passed. Local Quality passed after the bounded
follow-up; required full test tiers and final-head CI validation remain **pending**. Earlier
`full-install.json`, `topology-report.json` and `structural-checks.json` retain the actual unpatched
pre-repair observations; they are historical evidence, not a pass for this mitigation. Parent source
review released the boundary before the normal frozen install.

## Exact source and lock delta

[PR1152](https://github.com/digitalbazaar/forge/pull/1152) at
ceba34402e329f0365134f23fe19898756527d65 adds the nested AlgorithmIdentifier element-count check.
[PR1157](https://github.com/digitalbazaar/forge/pull/1157) at
683ab3344899cc08a581e4d5675a33e87aff7b04 also rejects nonempty NULL parameters. Both PRs are open
and unmerged. The patch changes only `node-forge: lib/rsa.js`, preserving the exact combined
upstream bytes:

| Identity                                   | SHA256                                                           |
| ------------------------------------------ | ---------------------------------------------------------------- |
| Published `node-forge: lib/rsa.js`         | fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50 |
| Reviewed combined `node-forge: lib/rsa.js` | 22cdfb3220439533211cf00ff7c7e6605607761d77a2c3c263411d4c70798c4f |
| Tracked patch                              | 2f0f3be76c7a0502b8579e71f32b7df98954a90a7e448084ac08dd86bd55286d |
| Reviewed mitigation input                  | d9b082687498d8017f4f07289aeed49600c5606b0e9b60384d822996d4213bde |

[forge-mitigation.json](../../../../tools/migration/inputs/forge-mitigation.json) records the full
integrity-matched published archive's file hashes, replacing only the RSA file's expected hash with
the reviewed postimage. It also pins the three actual critical Expo consumer source files and a
public regression vector. No private keys, access credentials or tokens are stored. The registry
archive has no package installation hooks, root binding.gyp or root .hooks; the local patch adds
none. `dist/forge.min.js` and `dist/forge.all.min.js` preserve their vulnerable published bytes. No
minified bundle, package version, direct dependency or build allowance changes.

[forge-lock-only.json](forge-lock-only.json), [its command log](controls/forge-lock-only.log.txt)
and [forge-lock-delta.json](forge-lock-delta.json) record pinned pnpm's exact
`pnpm install --lockfile-only --frozen-lockfile=false` exit and semantic comparison. The lock adds
only the patch registration/hash, the Forge snapshot suffix and its two parent-reference suffixes.
Every registry artifact/integrity, importer, six candidate pin and shipping production artifact is
unchanged. The installed RSA hash remains the published preimage; lock-only did not install a fix.
The archive inventory, candidate artifact record and production-install contract are re-bound to
this lock without changing their selected registry artifact rows.

## Mandatory installed source and consumer guard

`checkNativeTopology` directly awaits `verifyForgeMitigation` before returning its result. The
existing Quality step runs this checker before the unchanged `pnpm audit --audit-level=high` in both
local and CI mirrors. The exact GHSA mechanism, severity threshold and existing braces record are
preserved. The existing Browserless tools test remains the sole exception-date parser.

The guard enforces the exact patch/input hashes, the sole Forge registry version/integrity, patch
registration and every patched snapshot/reference, rejecting the actual pnpm `allowUnusedPatches`
bypass. The existing lock-graph owner enumerates every importer across production, optional and
development direct groups, then dependency/optional snapshot edges and all simple paths to Forge.
Peer/patch suffixes resolve through that owner. The complete path set must match the reviewed
candidate-only Expo and preset routes; a new importer, path, alias, version or shipping production
edge fails.

Installed package enumeration starts from root, candidate, web, functions and tools node_modules. It
recursively visits scoped, hoisted and nested packages plus virtual-store contexts, canonicalizes
realpaths, de-duplicates copies and rejects package/manifest paths outside the checkout. Every
installed Forge copy must have the complete reviewed file set and hashes, including the unchanged
dist bundles, `main: lib/index.js` and that actual default-main resolution. Missing, extra,
corrupted, symlinked or unpatched source fails. Each copy runs the actual RSA regression controls.

The reference fence examines lock importer/snapshot keys and values, installed manifests, and
installed consumers' `.js`, `.mjs`, `.cjs`, `.ts`, `.tsx` and `.json` sources, recursively skipping
nested node_modules only because those packages have their own enumeration. It skips Forge's own
imports after checking its entire byte set. JSON keys/values and literal `node-forge/` subpaths are
forbidden. The supported external entry is exactly `node-forge`, found in static import/re-export,
`require("node-forge")`, `require.resolve("node-forge")` and literal `import("node-forge")` forms.

In a file containing a Forge-main literal, unsupported placements of that literal and unresolved
recognized require/import calls fail conservatively. A computed subpath retaining a literal
`node-forge/` prefix fails. Fully assembled names with no Forge literal, custom loaders and
arbitrary runtime-generated code are **not** proved unreachable by this scan. This is a static
literal boundary paired with exact critical consumer bytes, lock paths and installed resolution, not
a general runtime reachability analysis. Known critical consumers are pinned to reviewed versions
and source hashes. Every observed supported static reference resolves from its actual source file to
a fully inspected Forge copy's actual `node-forge main: lib/index.js`.

## Concrete controls and pending results

The authored dist negative fixture is a real installed-shaped package whose source calls
`require("node-forge/dist/forge.min.js")`. Its fixture bundle throws if evaluated. The reference
fence must reject the source before package execution. Nested dist consumers, literal-prefix
computed subpaths, unresolved main references, source/manifest escapes, unsupported lock paths,
missing/corrupt files, an unpatched RSA copy and a modified dist bundle are additional controls.

The RSA controls execute the actual installed implementation. The public exponent-three vector uses
default verification options and must fail. Fixture keys generated only in memory construct nested
extra children, nonempty NULL lengths and constructed NULL; their rejection demonstrates
malformed-input behavior, not a private-keyless forgery. Count-only and unpatched verifier copies
must make the controls fail. Wrong digests fail; legitimate Node signatures, RSA PSS/NONE, absent or
empty parameters and the historical BER compatibility case remain valid.

Long-form empty NULL, indefinite-length inner AlgorithmIdentifier and nonminimal leading OID arc
bytes are intentionally accepted controls independently checked by Claude. The combined patch
rejects the two observed malformed classes; it does not enforce strict DER or constitute a complete
cryptographic proof. An official stricter fix needs a fresh source/control review.

Before executing helper code, the controls bind each helper package's actual default main and the
actual CLI codesigning source's helper resolution to the inspected canonical build/main.js.
Same-version main/exports bridge and deeper caller-context fixtures must fail that specific
ownership assertion before their throwing bridge executes. CLI signing/parser entries resolve to the
exact inspected source files. This closes package entry selection separately from source hashes.

Actual installed Expo helper controls cover PEM conversion, self-signed certificate validation,
CSR/development-certificate verification, signing with independent Node verification, and tamper
rejection. Actual CLI controls cover manifest signing and the iOS certificate parser. Only that
parser's exact host-keychain subprocess dependency is replaced with a bounded public certificate
fixture; crypto and package resolutions remain real. No keychain, network signing workflow, store
upload or native command runs.

The wiring test uses TypeScript ASTs for the real import and direct awaited variable statement in
`checkNativeTopology`, rejecting preceding returns. Commented imports/calls, if-false/conditional
calls and earlier unconditional/conditional returns are negative controls. This bounded structural
check is not a general control-flow proof.

[forge-frozen-install.json](forge-frozen-install.json) records the exact host-first command,
manager/runtime, exit and lock identity. The [raw installed lock](forge-installed-lock.yaml.txt)
exactly matches the reviewed repository lock. Existing modules/store were retained; no cold-install
claim is made. [forge-installed-sources.json](forge-installed-sources.json) records every actual
Forge copy and its complete file hashes. [forge-topology-report.json](forge-topology-report.json)
contains the executed mandatory guard, RSA/Expo controls and actual main resolutions. The
[topology command receipt](forge-topology-check.json) and
[focused test receipt](forge-focused-guards.json) link their raw logs. The focused crypto,
mitigation and Quality-wiring suite passed all tests, including the malformed-source and dist
negative controls. Setup assertions run outside crypto rejection assertions so fixture preparation
failure cannot count as a verifier failure. The repaired Quality result is recorded below; required
final-head test tiers and CI remain pending.

## Follow-up ownership repair and remaining tier

The initial full test command stopped in the tools tier before browser tests. Its log is retained in
[forge-full-tests.json](forge-full-tests.json): preceding app, SSR, asset and store tiers passed,
while four repository-tool assertions exposed synthetic import text, unqualified external package
paths and missing candidate code-map ownership. Those inputs were corrected without weakening the
specifier/doc guards. Candidate source has a measured area owned by the shared directory constant;
captured migration data/logs use the existing evidence exclusion class, with prose still measured.
The [committed code-map receipt](committed-code-map.json) records generation after integration
reconciliation. Its generated tables are unchanged by the subsequent prose update; both output
identities are recorded.

Independent source review also found the helper entry-selection gap described above. Its specific
main/exports/caller-context controls and all affected ownership guards passed in
[forge-repaired-focused.json](forge-repaired-focused.json). The actual installed source, crypto,
consumer and canonical entry proof passed again in
[forge-repaired-topology-report.json](forge-repaired-topology-report.json), with exact command/exit
in [forge-repaired-topology.json](forge-repaired-topology.json). Registry artifacts, lock and patch
remain unchanged. The initial Quality pass is recorded in [forge-quality.json](forge-quality.json);
The [repaired Quality run](forge-repaired-quality.json) passed every gate after the bounded
follow-up. The [independent source reviewer](forge-independent-source-review.json) confirmed closure
of the helper-entry finding without executing code. The later
[reconciled predecessor full tier](predecessor-f40-full-tests.json) passed in root session12028. A
subsequent actual-owner review found that the production observer rejected the root Node floor
format; the [bounded repair](netlify-floor-owner-repair.json) preserves the existing floor and
identity checks and adds real-owner and boundary fixtures. Its
[focused guards](netlify-floor-owner-focused.json) and unchanged
[Quality mirror](netlify-floor-owner-quality.json) passed. Required full-tier acceptance for the
corrected sealed head, final review and CI remain pending.
