# Plain drawing defaults

The drawing engine and two Node tools obtain width values from
[strokeSettings.ts](../../web/src/lib/drawing/strokeSettings.ts). The existing Svelte state module
imports and re-exports its used vocabulary while retaining the persisted pen/eraser policy, icons,
eager singleton and durable restoration. The unchanged default ink color belongs to
[palette.ts](../../web/src/lib/palette.ts). Color state retains its initialization and methods; its
unused constant re-export is removed.

This removes two direct engine dependencies on rune modules. Appearance, coloring state, SvelteKit
and browser rendering dependencies remain. It does not establish a portable engine or a performance
improvement. Native entries still require separate reviewed boundary work.

## Verification

The implementation preserves all five widths, the default size, eraser multiplier and palette
choice. Existing state tests pin the product values. Both Node production tools import the owner;
obsolete source-text drift guards are removed. The generator's committed output remains unchanged.
Replay coverage reconstructs the real browser function without module closures, so an imported
closure dependency is rejected rather than masked by Node.

The replay npm command, direct-command usage and real CLI failure tests pass the explicit Node
type-stripping/warning flags already used elsewhere. The repository Node floor is unchanged. A
Node22 control with stripping disabled rejects the TypeScript import; the flagged invocation reaches
the intended CLI diagnostic. This control used installed Node22.23.2, rather than claiming an exact
minimum-version run.

Scoped application, replay/tool and store-drawing suites passed, as did all Quality checks, frozen
installation and fresh uninstrumented web/native builds. The existing 38 web and 28 native preload
counts passed; no budget or exception changed. Temporary mutations proved the width pin,
generated-output check, replay forwarding and serialized-function closure checks reject their
respective defects and were restored before review.

After a native static build, generated SvelteKit aliases select native modules. The normal web
check/sync restores the web aliases before dead-code lint. That sequence passed; no web stub or lint
exception was removed to hide a target-configuration mismatch.

The first full test run rejected stale share-card source provenance after the palette module
changed. The real live-Svelte generator regenerated all four cards; their PNGs and content hashes
remained byte-identical, and only the producer-input digest changed. The guard remains intact.

[PR 2693](https://github.com/KyleMit/Splotch/pull/2693) records independent Claude review,
final-head CI and the applicable full test tier. Local structural checks cannot substitute for
physical migration acceptance.
