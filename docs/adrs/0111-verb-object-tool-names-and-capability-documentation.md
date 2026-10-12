# ADR-0111: Verb-Object Tool Names and Capability Documentation

**Status:** Active **Date:** 2026-08 **Amends:** [0019](0019-npm-script-naming-and-scripts-info.md),
[0044](0044-svg-optimization-audit.md),
[0079](0079-physical-ios-device-capture-webkit-inspector-protocol.md),
[0083](0083-real-screen-capture-on-device.md),
[0084](0084-trusted-xcuitest-input-for-ipad-real-screen-profiling.md),
[0090](0090-tiered-real-ipad-performance-regression-gates.md),
[0106](0106-hash-bound-eight-view-page-inventory-critiques.md), and
[0108](0108-unified-tools-tree.md)

## Context

ADR-0108 consolidated Splotch's repository automation into one capability-folded `tools/` tree. It
deliberately retained redundant entry-point names such as `tools/android/android-setup.mjs` because
the repeated capability made search results, stack frames, and pasted paths self-explanatory. It
also preserved almost every npm command name to keep that already-large migration organizational.

The resulting tree has one durable home, but its leaf vocabulary is still inconsistent. Runnable
files mix nouns, actions, and capability-prefixed names; mature packages keep `bin/` layers that add
depth without ownership; and several npm commands describe how a tool evolved rather than what it
does. The redundancy that helped during the first consolidation also makes names harder to scan
inside their owning folder and creates repeated, indistinguishable entry names when capabilities
gain platform subfolders.

This is the second broad tools migration in August 2026. Deferring it would avoid immediate churn,
but would make every new tool choose between two competing conventions and increase the eventual
rename surface. The durable vocabulary is worth one more bounded disruption while the consolidated
tree is still new.

Alternatives considered:

* **Keep ADR-0108's names and document exceptions.** This avoids another migration, but exceptions
  would become the real convention and leave searchers guessing whether an entry is named by action,
  capability, or historical npm command.
* **Use uniform `bin/index.mjs` entry points.** This gives every package the same shape, but erases
  the action from search results and stack frames and revives the ambiguous `index.mjs` name that
  ADR-0108 rejected.
* **Group all executables by action.** Top-level `checks/` and `generators/` folders make verbs easy
  to browse but separate each executable from the domain, docs, fixtures, and libraries that own it.
* **Enforce the layout programmatically.** A filename or README-presence rule can check spelling,
  not whether the verb is truthful or the documentation is useful. Review and the existing focused
  tests provide the appropriate enforcement level.

## Decision

ADR-0108's capability folding and shared-library ownership rules remain in force. Its redundant
capability-prefixed filename rule is amended as follows:

* A folder names a capability or recognizable sub-capability, such as `icons`, `mobile`, `perf/web`,
  or `asset-gen/coloring`.
* A runnable file uses `verb-object[-qualifier].mjs`. The verb vocabulary is illustrative rather
  than closed: `check` validates without writing; `gen` creates an artifact; `update` intentionally
  replaces a committed baseline; `capture` records evidence; `analyze` reads evidence; `run`
  orchestrates a workflow; and `start`, `stop`, `serve`, `open`, or `show` describe lifecycle and
  presentation. Precise domain verbs such as `convert`, `normalize`, `optimize`, `publish`,
  `encrypt`, and `archive` remain valid.
* `audit` is not an executable action verb. It remains valid in the `audit-burndown` capability and
  the public `audit:*` npm namespace. ADR-0044's re-runnable SVG-optimization contract remains in
  force, while its misleading `img:audit` and `img:audit:check` commands become
  `optimize:svg-assets` and `check:svg-assets`, and its executable becomes
  `optimize-svg-assets.mjs`. Asset-generation checks likewise move from `audit-*` executable names
  and `gen:*:audit` commands to truthful `check-*` entry points and `check:*` commands; the
  write-producing eye review becomes `gen-eye-review.mjs` behind `gen:coloring-eye-review`.
* A supporting module uses a purpose noun, with a capability qualifier when a generic leaf would be
  ambiguous. Leaf names retain enough meaning for search results and stack frames; `index.mjs`,
  `toolchain.mjs`, `config.mjs`, and repeated indistinguishable entry filenames are rejected.
* No capability uses a `bin/` directory. Executables live at the capability root or within a named
  sub-capability.
* Existing multi-mode executables are named for their primary action and keep secondary modes behind
  flags or npm commands. Naming does not justify splitting an implementation. The migration's
  `check-golden-scores.mjs` deliberately retains its `--diff` and `--freeze` modes, with the
  baseline-replacing mode exposed through `update:coloring-golden-scores`; this is a bounded
  exception to the otherwise read-only `check` executable contract. The deployed-smoke entries
  `check-deployed-blobs.mjs` and `check-deployed-contract.mjs` are bounded exceptions: proving that
  a deployed Blobs store is persistent and writable requires adding, reading back, and removing a
  uniquely named probe token. Both use the same round-trip contract; its write is reversible,
  cleanup is retried after failure, and the public commands remain in the existing `test:*`
  namespace.

Verb-object names preserve the useful part of ADR-0108's greppability without repetition:
`tools/mobile/android/setup-emulator.mjs` identifies its capability, platform, and action more
clearly than `tools/android/android-setup.mjs`, while the leaf remains meaningful on its own.

Every capability and meaningful sub-capability has a `README.md` covering its purpose, entry points,
inputs and outputs, prerequisites, failure behavior, domain ownership, and maintenance guidance.
Structural folders such as `lib`, `tests`, `fixtures`, `assets`, `prompts`, `generated`, `inputs`,
`samples`, and `probes` are documented by the nearest capability README unless they carry an
independent runbook. This is a documentation standard, not a layout linter.

ADR-0019's npm catalog remains the public interface, and `package.json` scripts and `scripts-info`
descriptions still change together. ADR-0108's "command names did not change" precedent is narrowed:
affirmatively misleading commands are renamed without compatibility aliases, while commands that
still describe their action remain stable. ADR-0019's "namespace by domain" and "generated artifacts
live under `gen:*`" rules are narrowed in three places. SVG optimization moves the two-command
`img:*` domain into the action-first `optimize:svg-assets` and `check:svg-assets` namespaces.
Asset-generation checks move from `gen:*:audit` to `check:*`, except for the write-producing eye
review. Verb-first page-inventory commands intentionally span the `capture:`, `review:`,
`finalize:`, and `attach:` namespaces. These choices weaken namespace grouping in exchange for
making each action clear at the call site. The `capture:` namespace is deliberately adjacent to
Capacitor's existing `cap:*` namespace; `record:` avoids that similarity but is less precise, while
retaining `gen:page-inventory` would misdescribe evidence capture as artifact generation.
`promotional-image` names the generator rather than Google Play because its `large-image.png` output
serves both store and social/link preview placements.

Performance commands likewise fold the target and action into the public name. `perf:mount` becomes
`perf:web:mount`; `perf:settings` becomes `perf:web:settings`; `perf:android:web:actions` becomes
`perf:android:browser:actions`; `perf:ios` becomes `perf:web:webkit`; `perf:ipad` and
`perf:ipad:frames` become `perf:ios:webkit:gates` and `perf:ios:webkit:frames`; `perf:ipad:xcuitest`
and `perf:ipad:actions` become `perf:ios:xcuitest:screen` and `perf:ios:xcuitest:actions`;
`perf:desktop:actions` becomes `perf:web:actions`; the `perf:undo*` family becomes `perf:web:undo*`;
`perf:replay` becomes `perf:web:replay`; and the analyzer and local frame commands become
`perf:analyze:chrome`, `perf:analyze:web-inspector`, `perf:analyze:frames`, and `perf:web:frames`.

This migration is structural and behavior-preserving. Each capability lands in a focused stacked PR
using `git mv`. Flags, environment variables, defaults, exit behavior, output paths, and artifact
identities are unchanged; internal values such as `profilePath('ipad-xcuitest', ...)` are runtime
behavior, not organizational names. ADRs remain historical decision records regardless of Active
status, so their command examples retain the paths that were true at the time unless this record
explicitly amends the underlying decision. Other dated records follow the same rule; current
operating docs and command catalogs are updated. Reusable performance components, module
decomposition, new mobile wrappers, and output renames are deferred until the new paths stabilize.

## Consequences

* \+ Paths identify both domain and action without repeating a capability at every leaf.
* \+ Search results and stack frames remain meaningful because runnable leaves carry a verb and
  object rather than a generic entry name.
* \+ Capability READMEs make ownership, prerequisites, outputs, and failure recovery discoverable
  next to the implementation.
* \+ The bounded rename-only policy makes review mechanical and keeps later refactors attributable.
* − A second large migration in one month creates substantial one-time path and command churn.
* − Renamed npm commands intentionally break old local notes and muscle memory; no compatibility
  aliases soften that break.
* − Useful documentation cannot be enforced mechanically, so reviewers must continue judging whether
  a README and a verb accurately describe the capability.
* − Verb-first page-inventory commands no longer sort into one npm namespace.

## Amendment (2026-08-19): Production deployed checks are read-only

The deployed-smoke exception applies only to preview targets. Production uses the same `check-*`
entry points but stops after the read-only `persistent: true` assertion; only previews perform and
clean up the unique-token write round-trip. This preserves the tool names while removing unattended
production mutation from their contract.
