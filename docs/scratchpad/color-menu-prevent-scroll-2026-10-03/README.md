# Rejected Color Menu focus experiment

The candidate added `preventScroll: true` to the Color Menu trigger's existing `focus()` call in
`ColorControl.toggle`, attempting to avoid focus-driven scroll work. It is preserved as a closed,
unmerged comparison against af31a00d11cee749f7cbc24bd61035970453aca5. The production diff is exactly
that one line; no assertion, input, scorer, readiness predicate, or acceptance rule is changed.

The corrected October 2, 2026 physical Safari control used a symmetric strict final observation for
stock and candidate. Stock passed: the menu opened and the trigger retained focus. The candidate
opened the menu, but the strict final trigger-focus assertion failed before the optional
late-observation callback. Its instrumented focus call accepted the option, did not throw, and
observed focus synchronously after the call; that did not establish retained focus at the final
observation. Identity gates passed, with zero collector drops or collector errors.

The failed assertion was `Normal trigger focus retained` (`false !== true`). The initial
stock/candidate screen used unmatched observation timing and was confounded; it is not the evidence
for rejection. The corrected symmetric comparison is the retained rejection reason.

Correctness failed before timing eligibility. There were zero timing captures and zero product
timing trials. The causal conclusion remains **UNRESOLVED**: this does not prove a general Safari
API defect or a performance benefit. The candidate is abandoned because it failed the unchanged
correctness gate; it must not be retried or repackaged as a performance treatment on this evidence.

`evidence.json` preserves the sanitized result and exact patch/source hashes. Source bytes were
taken from the exact baseline and changed only by the archived patch. Historical device fixtures,
logs, screenshots, traces, manifests, and identifiers remain local. No new screenshot, test, build,
or physical experiment was captured during preservation; current CI and shipment are not claimed
green.
