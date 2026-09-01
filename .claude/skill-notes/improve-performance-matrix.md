<!-- Source: .ruler/skill-notes/improve-performance-matrix.md.template -->

# Improve performance matrix — design notes

## Product-first sequencing

The 2026-09-01 campaign exposed a workflow failure rather than a measurement failure. The skill was
invoked for product improvement, but the session stopped after refreshing five of eleven targets,
repairing manifest provenance, and documenting capture-path behavior. It had established fourteen
scoreable physical-iPad action reds and still landed no product experiment.

Every individual action was defensible under the old runbook. It required a complete cell inventory
before editing, treated capture-path repair as a peer campaign output, and made full target currency
part of the path to product work as well as the completion gate. On a mature harness, those rules
created a ratchet: small evidence imperfections were concrete and easy to close, while causal
product work remained uncertain and could always be postponed until one more target was current.

The accepted correction separates **starting product work** from **finishing the campaign**. One
current calibrated physical failure is enough to select a product hypothesis and run an A/B. Full
current target coverage is still mandatory before completion, but stale advisory rows cannot block
the first product experiment. Harness work is stable by default and stays subordinate to an already
named product experiment.

The harness exception deliberately requires a concrete product experiment and immediate utility. A
harness change can repair invalid evidence, add a diagnostic that distinguishes the hypothesis, or
make its faithful A/B materially more reliable; it does not need to wait for a total blocker. The
same cluster must use it immediately and return to the product loop. Without that tie, a mature
harness always has another edge worth improving, so convenience, generalized reuse, and
advisory-only anomalies remain issue material rather than campaign deliverables.

Two alternatives were rejected:

* Requiring all eleven targets to be current before any product edit protects breadth but repeats
  the observed starvation failure. Breadth belongs in validation and the completion gate.
* Banning harness edits unless the experiment is completely blocked excludes useful diagnostics and
  validation improvements that product work genuinely motivates. The direct-utility rule keeps the
  product experiment as the unit of work and requires an immediate return to it.

The user explicitly declined a drift-guard test for this policy, not harness changes themselves. Do
not add a keyword or prose-matching test whose purpose is to police the skill text. Continue adding
ordinary behavioral regression coverage when actual harness code changes, and allow useful harness
work when the named product experiment motivates and immediately exercises it.
