# Native topology 05 provenance and structural checks

The guarded Forge repair is documented in [FORGE-MITIGATION.md](FORGE-MITIGATION.md). Quality, the
complete required test tier, and independent clean local full and production install/build cases
passed on executable source 6e29c1f4c68e55ca6e68f7d0b479c67a3983dfa5. These are historical receipts.
The first exact PR review completed and CI passed on evidence tip
a190af1f5d6257024daaf47c4cdbd2b95490e133; Claude required topology-check corrections. Their full
validation, second review and actual hosted production-install observation remain pending. Earlier
install and structural observations below use the unpatched lock and remain historical evidence. The
lock-bound policy inputs use the repair lock; registry artifacts and lifecycle verdicts are
unchanged.

The lock-only sentinel resolved a reviewed local tarball with four root hooks and one
third-party-shaped postinstall without running any hook or creating node_modules. The actual
candidate lock-only resolution then succeeded under pinned pnpm 11.22.0.

script-inventory.json contains every added/changed lock artifact, including optional platform
packages. Each archive matched both lock and registry integrity and its actual package.json/root
binding.gyp were inspected. The same archives were re-audited for root .hooks after the first strict
frozen install; the selected set, prior lifecycle observations and nine reviewed verdicts agree.
This follow-up does not claim that the initial audit recorded this capability. No
preinstall/install/postinstall, root binding.gyp or root .hooks files exist in the selected
added/changed artifacts. Metadata flags were not used to exclude archives.

prepare-source-review.json records the nine publisher prepare commands and shipped runtime paths.
Root accepted the nine individual registry-only verdicts: no execution needed. No true build
allowance was added; the frozen registry install boundary was explicitly released.

| Artifact                     | Publisher prepare action                                                 | Actual consumer and shipped path                                  |
| ---------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| @expo/spawn-async@1.8.0      | Deletes/rebuilds build via tsc; publisher dev toolchain absent           | Expo CLI/Metro/autolinking imports shipped build/spawnAsync.js    |
| @react-native/codegen@0.86.3 | Cleans lib and invokes publisher scripts/build.js; helper omitted        | RN/Babel codegen consumes shipped lib generators/schema/CLI files |
| ci-info@3.9.0                | Installs Git hooks with publisher Husky                                  | Expo CLI/Metro/Jest utility imports shipped index.js/vendors.json |
| content-type@2.1.0           | Runs publisher ts-scripts install/build                                  | negotiator imports shipped dist/index.js                          |
| error-stack-parser@2.1.4     | Copies/minifies parser plus stackframe into dist                         | Metro imports shipped error-stack-parser.js; dist also exists     |
| mime@1.6.0                   | src/build.js derives/writes types.json from publisher mime-db/mime-score | send imports shipped mime.js/types.json                           |
| stackframe@1.3.4             | Copies/minifies stackframe into dist                                     | error-stack-parser imports shipped stackframe.js                  |
| structured-headers@0.4.1     | Publisher make build; Makefile omitted                                   | Expo CLI imports shipped dist/index.js/parser/serializer          |
| whatwg-fetch@3.6.20          | Publisher make UMD/Flow; Makefile omitted                                | RN imports shipped dist/fetch.umd.js                              |

No registry install hook is necessary to create these files. Registry prepare differs from git/path
preparation; future source-type changes require renewed provenance, not an inferred permission.
Existing root build verdicts remain unchanged. The frozen full install succeeded on the recorded
host runtime. Candidate TSX/type/Babel checks, both-platform Expo/RN scanners, installed React/RN
identity, Metro ownership, shipping type diagnostics, lint and production/dead-code Knip passed.
Native compilation, supported-Node CI and actual hosted proof remain pending. The corrected-source
clean local cases are recorded below; this package makes no runtime, performance or upgrade claim.

Audit runtime explicitly used already installed baseline YAML 2.9.1/tar 7.5.22 through a private
loader; both are declared actual root tool dependencies in this unit. Archive inspection executed no
code from the inspected archives. That runtime is not a clean candidate or production install. The
first root-owned hosted proof remains a separate later automatic feature-ref observation.

Installed Expo Metro is 0.84.5 under wrapper 56.0.2. The resolved graph also contains Metro 0.84.6
from RN community CLI ranges. The actual Expo wrapper and config consumer share the 0.84.5 realpath,
and Expo/RN/entry contexts share React 19.2.3 and RN 0.86.3. RN Fabric's reconciler version matches
React. The required react-refresh peer is resolved by the preset; it is not an extra direct pin. No
graph override was added.

`full-install.json` records the manager/runtime, frozen lock and command result. The install log
retains observed warm store reuse; it does not claim a cold install. `lock-only-control.json` links
the exact fixture source/archive bytes and logs: fresh lock-only emits neither hooks nor modules;
the same tarball's unknown install hook is strictly rejected, then an explicit false verdict permits
installation with the sentinel still absent. `pnpm-lifecycle-source.json` verifies the installed
pinned manager source against its published integrity and records the registry/git distinction.

`candidate-exclusive-artifacts.json` is the exact sorted candidate closure minus the shipping
production closure, bound to the lock hash and recomputed by the owner checker. Shared production
transitives are permitted. The baseline production artifact record is anchored to the integration
revision before this dependency unit. The live gate derives the complete current candidate closure
and requires reviewed archive identities and verdicts for each new or changed candidate artifact.
Unrelated root-only artifact changes do not freeze the live gate. The separate exact evidence
checker binds the historical whole-lock selected set and the proof-specific input bytes.
`baseline-artifact-resolutions.json` retains every original package resolution, verified against
`git show` of its source revision and raw lock SHA256. The checker derives the expected new/changed
set from that independent baseline, so removing rows and their selection together fails.

The shipping-import fence follows local static import/re-export/dynamic-literal/require edges from
production tool entries as well as shipping source. Computed imports and subprocess targets retain
their production Knip/build owners. Isolated controls prove transitive candidate import rejection,
actual same-version duplicate React paths, real scanner root exclusion/candidate inclusion, Expo
search duplicates that resolve collapses, native source directory escape and shipping config drift,
production Knip rejection despite hoisting, TSX convention scopes, extra locks/workspaces, missing
SDK update ownership, corrupt/omitted archive rows and default node-gyp and root .hooks capability.

The root build chain invokes the builtin-only hosted witness first in prebuild. Normal refs exit
successfully before reading the proof contract. The owner recomputes
`production-install-contract.json` from the lock, manifests, workspace and Netlify configuration;
the observer uses it only for the strict named non-production proof context. Its local controls are
structural evidence; the first automatic hosted install/build and cache-state observation are
pending and are owned by the separate Netlify proof unit.

`topology-report.json` retains actual installed identity, Metro, scanner and shipping path outputs.
`pnpm-why.json` records the resolved Metro/React/RN graph, including the separate CLI Metro version.
`structural-checks.json` links the final checker and 95 scoped guards, normal observer CLI, shipping
diagnostics, Knip and generation logs, with the remaining validation boundaries explicit.

## Corrected-source full tier and clean local cases

[The corrected full tier](corrected-source-full-tests.json) passed all app, SSR, asset, store and
tools tiers, then all 1,170 browser tests. [The clean local proof](local-clean-proof.json) uses two
independent full-history clones, Node22.23.2 and pnpm11.22.0 with the existing warm shared store.
The full tree passed its exact topology/Forge guard, unchanged production Knip and complete static
shipping build. The separate production-only tree passed its builtin installed-tree observer with
445 installed package identities and no member of the 329-artifact candidate-exclusive closure, then
the exact root Netlify command, complete web guards and identical SSR staging inventories. The web
build carries its owner-derived version1.6.2712; the static export carries1.6.0.

Two real setup failures are retained: the cached pnpm entry was not executable through a symlink, so
an owned temporary launcher invokes the exact qualified Node/manager without shared mutation; Knip
initially lacked generated SvelteKit aliases, then passed after the existing owning sync. No alias
exception, guard waiver, lifecycle allowance, cache clearing or lock/source change follows. The
production observer inputs explicitly simulate a local branch-deploy context. No proof ref or hosted
install/build was produced by these commands.

[The historical source binding](historical-source-binding-a190.json) keeps the earlier local
executed artifact source distinct from its evidence-only review tip.
[The current binding record](final-source-binding.json) explicitly marks that comparison historical
until corrected-source validation is sealed. The hosted proof must observe the first automatic build
of its reviewed nonproduction ref and remains pending. Native compilation, mounts, integrated
performance and product/upgrade parity remain later migration obligations.

## First-review topology corrections

Live Quality keeps candidate archive, production closure, installed Forge, package identity,
shipping-import and canonical flat native plugin-path invariants. Frozen root manifest, lock,
workspace, Netlify, selected-artifact and shipping-config bytes are checked separately by
`check:migration:native-topology:evidence`. The named topology05 PR and nonproduction proof ref run
both commands in mandatory dedicated CI; later migration PRs use the live guard.

`gen:migration:topology-proof-inputs` derives only the production-install contract and
candidate-exclusive artifact inputs after validating the live archive and production owners. It does
not renew archive verdicts, source bindings or executed build evidence. Actual regeneration changed
only the root-manifest hash; the lock and artifact closures are unchanged.

The actual npm entry and awaited CLI main now join the installed Forge invocation wiring controls; a
no-op, unreachable or preceding process exit fails. Abbreviated registry metadata remains
informational; actual archive lifecycle capability controls include omitted metadata. Existing real
flat plugin directories pass while foreign and content-addressed pnpm paths fail. Forty-five focused
tests pass; full corrected-source checks and clean installs/builds remain pending.
