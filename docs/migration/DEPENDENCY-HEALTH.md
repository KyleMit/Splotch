# Dependency health during migration

Status: the external dependency repair passes local validation. Claude's implementation review and
PR CI remain pending. This maintenance unit does not establish product parity, select an
architecture, or provide candidate performance evidence.

## External source-map-js repair

The contract PR inherited the high-severity
[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) audit failure from the
shipping dependency graph. The advisory affects `source-map-js >=1.0.0 <1.2.2`; the patched
[1.2.2 release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) was published
September 30, 2026. Its [security patch](https://github.com/7rulnik/source-map-js/pull/79) bounds
malicious indexed-source-map work. [Registry metadata](https://registry.npmjs.org/source-map-js)
provides the published artifact integrity and provenance.

The bounded repair refreshes the external `1.2.1` package to `1.2.2` in
[pnpm-lock.yaml](../../pnpm-lock.yaml). All five immediate parent snapshots accept the patch:
`css-tree@2.2.1`, `css-tree@3.2.1`, `magicast@0.5.4`, `postcss@8.5.26`, and `postcss@8.5.28`. Those
edges account for 35 simple root-to-package paths, not 35 copies or immediate parents.

Claude's independent plan review found that the pinned pnpm runner needs **two identical targeted
updates**: the first moves four edges; the second moves the remaining Vite/PostCSS edge. The
reviewed converged diff is eight additions and eight removals, with no manifest, override, or
unrelated package change. The implementation must reproduce and inspect that result:

```sh
pnpm update source-map-js --depth Infinity --lockfile-only --no-save --ignore-scripts
pnpm update source-map-js --depth Infinity --lockfile-only --no-save --ignore-scripts
```

An override is unnecessary. Versioned override selectors intersect declared ranges rather than
matching their text exactly, so adding range selectors would broaden policy beyond this lock repair.
Do not add `source-map-js` as a direct dependency, weaken the audit gate, or add an audit exception.

The exact eight-addition/eight-removal lock diff was reproduced without manifest changes. The frozen
install, high-severity audit, all Quality checks, web/native release builds, and full test tier
passed locally, including 1,170 browser tests. The successful frozen install disabled pnpm's
optional update notifier after an earlier invocation remained idle after installation; no install
policy or dependency configuration changed. Record independent implementation review and applicable
CI in the PR before merging. Existing [Quality checks](../../tools/ci-mirror/run-quality-checks.mjs)
and [test tiers](../../package.json) own the commands. A passing coverage run loads magicast; it
does not exercise the dangerous embedded indexed-map path described below.

## Separately bounded embedded-code residual

This lock repair does not rewrite code embedded in published dependencies. Embedded
source-map-family code is outside this unit's scope; magicast is the specifically inspected
`source-map-js` residual, not a complete inventory of every bundled source-map implementation.

`magicast@0.5.4` embeds `source-map-js@1.2.1` in its published build. The installed artifact's
`inlinedDependencies` metadata and consumer code retain the pre-patch offset handling. A lock
refresh or override changes its external dependency resolution, not that embedded copy. The latest
inspected [magicast 0.5.5 release](https://github.com/unjs/magicast/releases/tag/v0.5.5) and
[tagged manifest](https://raw.githubusercontent.com/unjs/magicast/v0.5.5/package.json) still record
the same embedded version; upgrading magicast alone is not a verified fix.

Current source inspection places magicast behind the dev-only V8 coverage provider. Its
[provider call](https://raw.githubusercontent.com/vitest-dev/vitest/v5.0.2/packages/coverage-v8/src/provider.ts)
parses local configuration for optional threshold rewriting; the
[coverage owner](https://raw.githubusercontent.com/vitest-dev/vitest/v5.0.2/packages/vitest/src/node/coverage.ts)
gates that call on `thresholds.autoUpdate`. Our [coverage config](../../web/vitest.config.ts) does
not enable it. Even that rewrite supplies neither an input source map nor an output map name to
magicast. No current production build or application entry imports magicast. These are static
reachability findings, not proof that all possible callers are safe or that the embedded code is
fixed.

Keep a separate dependency follow-up open until an inspected upstream artifact or independently
reviewed package patch removes or repairs the residual. Revisit before enabling threshold rewriting,
adding a magicast caller or map options, changing coverage tooling, or adopting a new magicast
release. Verify the actual published bundle and its integrity; an accepting dependency range alone
is insufficient.

A future package patch requires public-API integration checks with legitimate maps and a bounded
malformed indexed map, plus a negative control against the unpatched artifact and normal tooling
validation. Such a patch belongs in its own reviewed unit. Do not hand-edit `node_modules`, disable
coverage, or describe a green package-graph audit as proof that every embedded copy is patched.
