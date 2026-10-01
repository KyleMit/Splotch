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

The web shell does not instantiate or render a native host. Its static factory import does share
gate policy code with web privacy. Independent review measured the generated JavaScript dependency
closure on Beta at 288,337 bytes versus 266,810 in its import-removal control; Changelog at 282,595
versus 259,605; Dev at 265,221 versus 242,231; and Admin at 282,233 versus 259,243. These are raw
generated JavaScript bytes, not compressed network bytes. The control removes the gate code from
those secondary pages but raises drawing startup from 40 to 41 modulepreloads, failing the unchanged
budget. The bounded decision accepts that secondary-page cost, corrects the host-exclusion wording
and preserves exact 40 web and 28 native startup budgets. A separate startup chunk redesign is not
part of this footer.

The native 320px probe reproduced wrapping caused by the external mark: Privacy, Changelog and
Feedback total 257.5px before gaps against 280px of content width. Phone navigation uses the
existing 8px spacing token between sections, preserving 14px text, the external mark and 44px
targets. The same compiled-build probe verifies both shipped routes in light and dark and requires
one cold gate with no external page before solving. The failing 18px-gap measurement is its negative
control.

Hydrated manual maximum scrolling activates the oldest entry on desktop. At 320×568 and 812×375, the
initial footer reserve instead moves the oldest entry wholly above the viewport (bottom −20.75px and
−3.56px); the identical exact-base production probe keeps it in the observer band (130.25px and
52.44px). The compact repair gives oldest-entry bottoms of 43.25px and 60.44px, with the oldest
active. A browser-only control reverting just that reserve to 96px reproduces the failure.

The second independent review extends the matrix and finds the same footer regression at desktop
heights 501–614px, outside the compact breakpoint. Its retained browser probe measures oldest-entry
bottoms from −34.14px to −0.14px and an unchanged newest marker. The identical web probe on the
exact-base release passes all 32 route/size combinations. The rival's browser-only override of just
the reserve to 160px passes all 22 route/size combinations, including both final-section activation
and footer visibility. The final implementation therefore counts 160px of the footer and page-end
footprint at every size, removing the breakpoint gap without changing either observer. Guards cover
Changelog and Privacy at desktop 800px, 600px and 501px heights, the 320px phone and short
landscape. Existing anchor, contents cap and scroll-chaining assertions remain unchanged. Captures
wait for hydration, font readiness, final-section activation and transition settlement before
saving. The final release probe passes all 32 route/size combinations with the final section active
and the footer fully visible. Reverting only the reserve to 96px in that same compiled build fails
the assertion: nine Changelog sizes lose the oldest marker, including both the desktop gap and
compact cases. The retained script and positive/negative JSON preserve that comparison.

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
