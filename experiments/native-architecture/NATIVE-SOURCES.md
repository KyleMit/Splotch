# Candidate native source ownership

These maintained Android and iOS projects come from the released
[Expo bare minimum template 57.0.28](https://registry.npmjs.org/expo-template-bare-minimum/57.0.28).
The complete original archive manifest and exact registry response live under
`tools/migration/inputs/`. `native-template-provenance.json` records every selected file, its source
and maintained hash, and every omission. The retained registry metadata declares 0BSD; the actual
archive LICENSE is MIT. `TEMPLATE-LICENSE` preserves that MIT text verbatim.

`tools/migration/lib/native-source-contract.mjs` owns the candidate identity, platform floors,
JavaScript entry/module and Gradle wrapper pins. Native copies are checked against that owner. The
candidate uses `art.splotch.migration.probe`, Android API24 and iOS16.4; the iOS project, target and
scheme retain `HelloWorld`. The root shipping Android/iOS projects and Capacitor identity are
separate inputs.

`tools/migration/materialize-native-candidate.mjs` accepts one explicit `--archive=<file>` from the
reviewed source URL. It authenticates the compressed bytes and every member before deriving the
selected sources. It either creates an absent destination or verifies an identical owned
destination. It rejects changed, partial, linked or unowned destinations and has no overwrite/reset
mode. It runs no template scripts, package installation or native tool.

The manifest retains `originalText` exactly for selected transformed members. Its UTF8 bytes must
round-trip and match that member's original byte length and SHA256, including recipes that replace
the entire body. `expectedNativeProvenance` replays the existing forward recipes and derives the
complete ordered receipt. Unchanged target digests remain their original member digests. The
maintained-file reader requires the receipt to equal that independent record before checking actual
file bytes and the Git owner-executable class; permission bits narrowed by a checkout umask are
accepted. The archive producer independently assigns and verifies exact recorded modes. Jointly
editing a maintained file and its receipt cannot authorize new output.

The explicit archive route also compares retained original text with authenticated archive members.
The offline source check trusts the reviewed manifest and recipe source; it does not independently
authenticate a jointly changed original text and manifest digest against the archive. Retained
registry member count and unpacked byte total detect bookkeeping drift, while required recipe and
omission map membership detects map drift. Counts and sizes do not prove archive identity.

Template changes require source review of the complete original member manifest, conditional text,
retained registry response and recipes before explicit materialization regenerates maintained files
and their canonical receipt. The source-preparation writer emits these fields from the same verified
original member bytes; it has no second transformation or receipt derivation.

`tools/migration/check-native-candidate.mjs` reads maintained sources only. Its result concerns
source contracts, not installed SDK selection, merged dependency manifests, compilation, device
floors or screen presentation. The topology05 checker retains ownership of dependency, Metro and
autolinking evidence.

Android Release requires four candidate signing properties declared by `RELEASE_SIGNING_PROPERTIES`
and the external filename `RELEASE_KEYSTORE_NAME`. It uses R8, resource shrinking and optimize
ProGuard rules. No keystore is stored here; the later owned Release caller must validate the signing
directory and provide a disposable key. This source route does not certify that ownership.

The iOS Release bundle phase requires an absolute executable `NODE_BINARY` with the reviewed version
declared by `NATIVE_CONTRACT.nodeVersion`, resolves the candidate entry through Expo and uses
`export:embed`. It rejects the effective ambient entry, CLI, command, packager, configuration,
Node-argument, bundle-name and sourcemap selectors declared in `APPLE_BUNDLE_OVERRIDES`, requires
Hermes, and validates a nonempty pod-generated compiler path against the resolved pinned Hermes
compiler. The released RN script overwrites ambient `EXTRA_COMPILER_ARGS` with its Release `-O`
selection; the executed caller must verify that argument. It reads no local Xcode environment file
itself.

RN's `prepare_react_native_project!` creates both `.xcode.env` and `.xcode.env.local` when absent.
Dependency script phases source both files. Before pod generation, the Apple caller must create both
in its owned disposable source copy with the same reviewed absolute executable Node24 path. Pod
generation runs with that binary's directory first on PATH, records `command -v node` and its
digest, and clears `EX_UPDATES_NATIVE_DEBUG`. The caller refuses a resulting `.xcode.env.updates`
and verifies both prepared files' exact bytes and modes before and after generation and Release
compilation. The actual bundle phase's `NODE_BINARY` must equal the prepared absolute path and
digest; its version check alone does not authenticate executable bytes. Pods rewrite the disposable
project file, including Hermes settings and the Expo configure phase. The caller records and reviews
that complete generated-project delta against its released owners, while preserving the maintained
bundle phase. Maintained source rejects generated paths. No Ruby monkeypatch or upstream source
rewrite is part of this policy.

The final Release caller must bind the actual compiler/runtime versions and payloads, complete
Hermes bytecode validation, optimization invocation and native bundle consumption. A bytecode magic
header alone rejects plain JavaScript but cannot establish complete validity or optimization.

The maintained Android manifest declares INTERNET only; local ATS exceptions and development
inspectors are disabled. Native dependency installation must inspect actual merged permissions and
privacy inputs before treating these source declarations as effective policy. No children's-store
compliance claim follows.

Native tools run only in an independent owned disposable copy of the accepted candidate source. The
maintained reader rejects every additional native path and names the path; it does not infer
acceptance from Git or formatter ignores. No generated-output directory allowlist is maintained.
Candidate resource JSON belongs to Prettier; the scoped re-includes preserve shipping exclusions.
Native formats without a registered parser retain their exact template/recipe bytes. Toolchains,
caches and DerivedData belong outside every checkout. Gem/pod locks, graphics dependencies,
provisioning, optimized native compilation and mounted output remain separate reviewed units. No
installed or native execution receipt is included in this source unit.
