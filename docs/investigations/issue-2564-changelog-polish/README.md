# Changelog polish

Issue 2564 implements the changelog handoff's release treatments, contents rail and narrow readout,
older-history fold, arrival highlight and closing link. The shared narrow contents treatment also
applies to Privacy. Its policy copy, effective date and pinned policy hashes remain unchanged.

The release generator owns the hue cycle, finite hue type, strict untyped hue parser, date metadata,
Latest badge, hydration-only relative-date placeholders, list roles and fold after the first three
releases. A byte-for-byte generation guard prevents agreement between the generator and its output
from depending on prose. Relative dates use UTC days and explicit calendar-month boundaries. The
absolute date remains accessible; the relative date is supplemental and hidden from screen readers.

The page uses the existing accessible tape, highlighter, arrival, blob and shadow tokens. Tape and
section-icon changes are scoped to Changelog; Settings keeps its icon headings. Blob list markers
use positioned pseudo-elements so inline prose and links retain their normal flow. The active rail
track retains the existing brand color: palette dots decorate state while the text and aria-current
carry it. The narrow shell uses the nearest established radius token. Its panel cap subtracts the
same two-pixel border variable used by the shell.

SquiggleRule extracts the existing footer mask for the footer and actual new release consumers.
BackToTopLink is a concrete caller of the build-time page-icon provider. Neither primitive adds a
future option surface. The inexpensive web glyph and original native registry remain separated by
the existing build-time alias; the startup and eager-error budgets enforce that boundary.

Older entries remain in prerendered HTML inside native details. Summary is the first child, its
opening divider is styled separately, and the first older entry retains its own divider after
reveal. Opening the fold by keyboard hands focus to its first heading before the summary disappears.
Safari's default Tab skips links; an installed WebKit probe verifies that Option-Tab reaches the
next Back to top link after that handoff.

Initial fragments, rail links, narrow picks, hash changes and history traversal reveal the fold
before a measured scroll. A navigation sequence cancels delayed earlier jumps, and arrival cleanup
removes prior markers and timers. Reduced motion retains a still highlight and suppresses the link
press transform. The existing intersection observer, reserve and scroll-chain behavior are retained.
When a closed fold leaves the visible last release just above the observer band at maximum scroll,
the observer selects the last fully passed visible article instead of retaining its initial seed.
Closed-details entries are explicitly excluded from that fallback.

Validation includes the complete production browser suite (1,071 passed), all five browserless
tiers, 41 focused installed WebKit cases, and both release-build budget guards. The WebKit checks
include actual landing geometry, keyboard focus, open-panel caps, all five closed/full-history tail
sizes, AA tape and active highlighter text in both themes, rapid arrival changes, reduced motion and
Settings headings. Browserless coverage reports 4,365 unit, 41 UI, 277 server, 23 API-unit, 6,645
tools and 42 API-smoke assertions.

The final static native export keeps exactly 28 drawing modulepreloads and measures 6,209,046 of
7,000,000 allowed bytes. Its eager-error closure adds six resources and 5,358 bytes with deferred
owners still lazy. The final web release has exactly 40 drawing modulepreloads and an eager-error
union of 484,831 of 525,000 allowed bytes. Its linked startup JavaScript/CSS is 456,164 bytes plus
84,462 inline CSS bytes. These budgets are unchanged.

The compiled native probe covers both shipped pages and themes with idle prewarming disabled: there
is no gate request before clicking, one gate dialog after the trusted footer click, and no external
page before solving. A local fulfilled navigation fixture verifies replay without sending feedback.
Existing Privacy links, a single Manage host, focus return, Never mode and solved-session
original-click navigation are preserved. Native folded fragments and narrow picks assert actual
landed boxes and arrival. This evidence concerns the compiled static bundle in Chromium, not a
physical signed app.

The controls directory retains test/build outputs and measured probe records. Before/after captures
use clean commits, fresh servers in the same installed worktree, hydrated pages and loaded fonts.
App-only light/dark desktop, phone, open/closed/active contents, older-history and arrival captures,
plus forced-colors and reduced-motion evidence, are hosted on the public pr-assets branch.

The empty-band guard has a source-removal negative control: deleting only the new fallback from a
clean committed checkpoint makes the closed-tail assertions fail at desktop 600px and 501px, phone
320px and short landscape; desktop 800px still passes. Restoring that committed source passes all 41
focused Chromium cases, including Settings. Full-history tail guards also assert the final section
is actually in the viewport, independently of its active marker.

A separate reserve control verifies the computed owner value before measuring. The unchanged 160px
reserve keeps the final section and footer visible in all ten page/size cells. Reducing only that
reserve to 96px moves the oldest release above the viewport at the same four sizes, while the new
fallback correctly preserves its active marker. The strengthened viewport assertion rejects all four
negative cells; its restored production positive control passes all five sizes. The Privacy Contact
cells remain visible in both reserve controls. This distinguishes actual visibility from the marker
behavior covered by the historical footer evidence.
