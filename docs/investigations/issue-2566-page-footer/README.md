# Shared page footer

Issue 2566 adds the handoff's footer after each standalone page's content. Admin opts out. The
current section is a non-link with a palette dot. The version row uses the first public release,
including an ISO date generated from the release source; it never reads the app build version.

The footer reuses the theme, spacing, blob and external-link primitives. At 320px the three sections
stay on one row. Short screens reduce the footer's preceding space. Forced colors retain the rule,
current-section dot outline and visible links. Privacy Contact and the oldest changelog entry remain
reachable with the footer's contribution included in their bottom reserves. Privacy's policy text,
effective date and two pinned policy hashes are unchanged.

Native privacy and changelog are the shipped standalone shell routes. Beta and feedback are excluded
from the embedded bundle. Native footer feedback opens the hosted feedback page through the existing
external-links gate. PageShell owns one gate and Settings host. Capture installs the existing gate
action before the original click reaches its anchor; this keeps the trusted tap, approved replay
latch, target and rel semantics. The action mounts on each click, and the shell retains idle
prewarming. Parent Center continues loading Settings and persisted state on demand.

The initial native build added a preload: the shared limit module became a runtime dependency of
both privacy and lazy AI response handling. Moving the unchanged exhausted-grant wire codes into the
existing generation-result vocabulary removes that edge. `freeGenerations` imports their types,
while server and response handler import their runtime values from the wire owner. Native startup
remains exactly 28 modulepreloads; the budget is unchanged.

Browser evidence covers cold native footer clicks with idle callbacks disabled, original external
navigation after solving, existing privacy links, one Manage host and focus return. Never and a
solved session open from the original tap without a visible gate. These are Chromium static-bundle
checks, not physical-device or signed-app evidence. A failed JS-module fetch remains cached by the
browser's module loader, and a failed CSS preload can remain cached by Vite. The controller keeps
attempting mount on later clicks; this unit does not change either inherited loader behavior.

The base capture is a negative control: none of the four web shell routes has the footer. Footer SSR
guards pin the current section, external native feedback, newest-public version and ISO date; the
release generator guard compares date fields against the owning Markdown source. Existing
wire-response tests cover the unchanged exhausted-grant code values. Factory tests retain isolated
instances and Manage retirement coverage; `singleFlight.test.ts` pins clearing a rejected memo so
later calls invoke its producer again.

The datetime guard's negative control replaces the newest generated ISO date with `1900-01-01`: the
guard rejects it against the source's `2026-09-09`, then passes after restoration. Production
browser tests preserve the contents-panel cap and scroll-chain assertions unchanged. The saved dev
landscape head/base runs expose a hydration/pinning timing difference; one base pass alone does not
establish product causality. The full production sweep passes both landscape assertions and final
section activation. Three existing selectors are scoped to the beta Android panel and masthead
because the shared footer adds sibling links with the same names.

The `controls` directory preserves the exact-base native budget, initial preload graph, repaired
native budget, failed-module limit, trusted-tap evidence, dev landscape comparison and datetime
negative/positive controls. Screenshot captures live on the public `pr-assets` branch under
`issue-2566-footer`; binary captures do not enter the application branch.
