# Privacy wayfinding — issue 2563

Done when the existing policy revision date is visible under the title, the contact section ends
with a clear feedback link, the contents rail/disclosure still reaches every section, and both
builds retain their published policy revision hashes.

## Decisions

* Keep the published September 28, 2026 revision. Derive its label from one ISO date in UTC, used
  directly by the time element too.
* Reuse the standard RuleLabel after removing the summary's date. Use existing theme and blob tokens
  for the date dot and closing prompt.
* Link to plain `/feedback`; retain the existing native external-link gate and ExternalMark.
  Feedback-kind changes and a public revision-history link remain outside this handoff.
* Exclude only `#contact > .policy-ask[data-policy-chrome]` from the policy digest. A marked policy
  paragraph remains hashed. Negative controls mutate the adjacent policy sentence and its link
  destination; each must produce a different digest in both builds.
* Verify the already-built contents behavior rather than redesigning it.

## Evidence

The web and native SSR guards retain the published digests without adding a revision. Browser specs
cover the above-fold date on desktop and a small phone, the 44px contact link and focus outline,
feedback navigation, and active/pinned contents through every section. The first full browser run
passed 1,039 tests and exposed a new assertion that compared a fractional 24.15625px rail coordinate
to exactly 24px. Only the new assertion was corrected to compare the pixel-rounded coordinate; ten
targeted repeats passed. Existing disclosure and Parent Center tests remain applicable. Native
static-build and browser gate checks exercise the native branch; physical iPad/Android captures are
outside this unit's scope.

Campaign merge authority: “Yes, i explicitly approve merges for the campaign”. The prescribed
independent Claude review and current-head CI registration/completion gate still apply.
