# ADR-0094: Brand the Utility Surface as Settings and Gate Sensitive Operations Individually

**Status:** Active **Date:** 2026-08

## Context

The app's corner utility modal is mostly ordinary settings: appearance, sound, saving, drawing
controls, setup help, release notes, feedback, and about information. Its former parent-oriented
name implied that entering the modal itself separated a grown-up from a child. It does not: the
corner button performs no age check or parental challenge, and adding one around the whole modal
would put harmless preferences behind unnecessary friction.

App-store kids policies are narrower. Particular operations, especially external links or purchases,
can require a parental gate. Treating the whole modal as the gate would both misdescribe the current
interaction and make it easy for a future operation to inherit a false assumption that opening the
modal proves adulthood.

Alternatives considered:

* **Keep parent-oriented branding and rely on the inconspicuous corner button.** Rejected: a button
  a child may ignore is a usability choice, not a parental gate.
* **Put one parental challenge in front of the entire modal.** Rejected: appearance, sound, and
  control preferences do not all require gating, and the blanket challenge would penalize every
  settings visit.
* **Rename the modal but continue treating entry as proof of adulthood.** Rejected: this would
  change the label without fixing the unsafe compliance assumption.

## Decision

Brand the corner utility surface as **Settings** throughout the product, accessibility tree, code,
tests, automation, store material, and documentation. The implementation vocabulary is
`SettingsButton`, `SettingsModal`, `settingsModal`, `#settingsButton`, `#settingsModal`, and
`lib/components/settings/`; the button uses the existing `settings.svg` cog.

Opening Settings is **not** a parental gate and must never be used as evidence that the current user
is an adult. Any operation that app-store policy requires to be gated owns its challenge at the
operation boundary, immediately before the sensitive action. This change establishes that boundary
but does not add or remove a challenge for any individual operation.

The responsive section-list and first-open mounting behavior remain the decisions in ADR-0061 and
ADR-0049. The per-operation policy is recorded separately because it governs future links,
purchases, and other compliance-sensitive actions regardless of how Settings is laid out.

## Consequences

* \+ The visible name matches the modal's primary purpose and its cog icon follows the platform
  convention for settings.
* \+ Harmless preferences remain directly reachable without an unnecessary parental challenge.
* \+ Compliance-sensitive actions cannot accidentally rely on modal entry as a substitute for an
  explicit gate.
* − Each sensitive operation must identify, implement, and test its own parental-gate requirement;
  there is no blanket wrapper that covers future additions automatically.
* − Store-review checklists must audit actions inside Settings individually rather than describing
  the modal itself as protected.
