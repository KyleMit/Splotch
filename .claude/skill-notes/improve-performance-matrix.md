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
the first product experiment. Harness work is frozen by default and becomes an exception subordinate
to an already named product experiment.

The harness exception deliberately requires both kinds of evidence: raw proof that the existing
measurement is invalid and a concrete product experiment that cannot proceed without the repair. Raw
proof alone would preserve the old failure mode, because a mature harness always has another edge
worth improving. Convenience, richer provenance, generalized reuse, warnings, and advisory-only
anomalies remain useful issue material but are not improvement-campaign deliverables.

Two alternatives were rejected:

* Requiring all eleven targets to be current before any product edit protects breadth but repeats
  the observed starvation failure. Breadth belongs in validation and the completion gate.
* Banning harness edits entirely makes a demonstrated invalid capture impossible to repair. The
  narrow exception keeps the product experiment as the unit of work and requires an immediate return
  to it.

The user explicitly declined a repository check for this policy. The skill text and live PR ledger
are the enforcement surface; do not add a keyword test or a new performance-harness feature to
police the rule.
