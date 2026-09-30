# Section structure polish

The attached design handoff covers finding 2c (blob numerals in the feedback callout) and 2d
(copyable privacy section links). Done means these surfaces work across themes and widths, clipboard
failures retain a manual fragment link, keyboard and touch access work, and an independent review
and CI verify the pull request. Optional changes to beta, install, settings, back links and
changelog are outside this unit.

The numbered-step wash recipe stays shared. Its yellow digit measured only 4.03:1 in light mode, so
the feedback context scales the existing ink mix toward heading ink. Both themes pass a rendered
4.5:1 contrast check. Three shared radius tokens preserve the gate's existing geometry and appear in
the design system specimens.

Privacy headings use the contents metadata. A page-owned controller copies public URLs, preserves
router history state and reading position, expires confirmation after two seconds, ignores stale
async results, and disposes its timer. Missing clipboard support leaves the anchor alone; rejected
writes explicitly navigate to the fragment. Modified clicks retain native link behavior. The policy
hash excludes only the added controls, so policy text and content links still require a dated
revision.

## Verification

* Focused production browser suite: all 25 privacy and feedback tests passed.
* Full browserless CI tier: all five stages passed, including the coverage-gated unit suites and 42
  API smoke cases.
* Quality: every individual gate passed. The first complete run reported the intentionally unstaged
  generated skills; staging them and rerunning `ruler:check` verified no regeneration drift.
* Negative controls: the original pages fail all three new list/section-link checks. A one-word
  policy change still fails the rendered-policy revision hash. The original source was restored
  after each probe.
* Screenshots: real app captures at 1280px and 390px in light and dark, with rest, hover and copied
  states. Stored on the existing `pr-assets` branch under `section-structure-polish/`.
* A broader development-server run passed 70 checks and skipped five production-only bundle checks.
  It also found the existing `/design` contrast failure (disabled primitive specimens) and the phone
  privacy scrollspy missing the last section on a cold load. Both reproduced with the original
  privacy and styleguide components; the scrollspy also failed all ten development-server repeats.
  Neither occurs in the focused production privacy/feedback run. These findings need a separate
  test-harness investigation and are not treated as passes.

## Independent review

Claude's first round found a same-fragment clipboard fallback, a desktop hit target overlapping the
rail gutter, a repeated live announcement that did not mutate, and a stale metadata comment. The
browser probes reproduced the first two: the rejected recopy left scroll at zero, and the hit area
started eight pixels inside the rail. A reactive subscriber test also failed on a repeated copy.

The controller scrolls the existing fragment on rejection. The desktop gap and offset derive from
the rail gutter and the named target size. Literal section ids remain beside their policy prose,
with the metadata agreement guard documented: deriving those ids from array indices would conceal
mismatched prose after a reorder. All 27 focused production tests pass with the new browser
regressions; the subscriber regression passes too. Both dev failures also reproduce on a complete
clean main checkout. Follow-up investigation drafts are on the PR.

Claude's second round accepted those dispositions and questioned whether clearing and setting a live
region in one task reaches assistive technology. Repeated confirmation uses the parental gate's
existing delayed announcement pattern instead: a tracked timer leaves the live region empty across
rendering tasks, checks request ownership, and is cleared on disposal. Regression tests cover
repetition, disposal, and a newer pending copy. VoiceOver and NVDA speech output has not been
tested; automated checks verify reactive state and browser behavior, not spoken output. No third
review round is requested under the workflow's two-round bound.

## Reconciliation with main

Merged the four incoming commits through 0bc1ef6cddd00a4d82f3e824a589b030fb5537b0, bringing in
arrival-aware back-link labels and responsive masthead behavior. All incoming diffs and merged
overlapping sources were reviewed. No dependency, ADR, skill-registry or backlog scope changed.

The eight textual conflicts covered the radius tokens, generated CSS, gate, specimens, usage rules
and design references. Both branches had extracted the same first blob radius. The three numbered
tokens remain canonical; the new back link uses the first, and the square specimen treatment applies
to all three. The gate geometry and both features are preserved. Generated CSS and provider skills
were rebuilt from their sources.

Type checks, ESLint, formatting, generated-instruction drift and ADR integrity passed. The full
`npm test` run passed: 4,088 app tests, 19 SSR tests, 277 asset tests, 23 stored-drawing tests,
6,391 tooling tests and all 1,024 production browser tests, including Firefox and WebKit smoke
checks. The reconciliation remains local until a push is requested.
