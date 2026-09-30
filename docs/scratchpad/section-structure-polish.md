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
