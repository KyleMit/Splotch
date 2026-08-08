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

## Amendment (2026-08): Parent Center policies

The gate frequency is now an explicit per-feature policy rather than one remember choice shown
inside every challenge. Settings includes a **Parent Center** section with an independent frequency
control for:

* generating an AI image;
* viewing external links;
* sending feedback;
* opening Parent Center itself.

Every feature can use Every time, Per session, or Never on web and Android. Native iOS keeps Never
visible for external links but unavailable: App Store Review Guideline 1.3 requires Kids Category
link-outs to stay behind a parental gate. Activating that unavailable choice expands an inline
explanation instead of changing the policy. The default remains Every time for every feature.

Opening Settings remains ungated. Opening Parent Center is a protected operation at that section's
boundary and defaults to Every time; after an adult changes its own policy, future opens follow the
selected mode just like the other three features. The section is the only policy editor, so the old
Buttons toggle and the challenge modal's inline remember choice are removed.

The selections persist through `storage.ts`. A Per session solve is recorded independently for that
feature in memory and resets when the app reloads; Never bypasses only that feature. Every protected
operation calls `requireParentalGate(feature, …)` at its action boundary. External links request an
immediate handoff after the solve because delaying the replay would lose the trusted tap's browser
user activation and trigger popup blocking.

Alternatives considered:

* **One global frequency for every protected action.** Rejected: a family may be comfortable
  generating repeatedly in one session while still requiring every external link or feedback send to
  be checked.
* **Keep the frequency choices inside the challenge.** Rejected: that exposes policy changes at
  every protected action and gives no overview of which behavior applies where.
* **Always force Parent Center even when its row says Per session or Never.** Rejected: the row
  would be a control that does not control the operation it names. The safe default is Every time;
  relaxing it is an explicit choice made from behind the gate.
* **Disable Never for external links on every platform.** Rejected: the Kids Category constraint is
  specific to the iOS distribution; applying it to web and Android would remove a permissible parent
  choice without a policy reason.
* **Hide Never on iOS.** Rejected: keeping the shared table structure stable and explaining the
  unavailable choice makes the platform difference visible instead of silently omitting it.

Consequences:

* \+ Each sensitive action has an independently reviewable and testable policy.
* \+ Parents can see and change the complete protection model in one gated section.
* \+ Feedback submission is protected before any report payload leaves the device.
* \+ Native iOS external links cannot be permanently exempted from their parental gate.
* \+ Web and Android retain the complete frequency choice where that restriction does not apply.
* − Choosing Never for Parent Center means its policy controls subsequently open without a solve on
  that device; this is intentional, visible, and reversible.
* − Adding another protected operation now requires a feature id, persisted policy key, Parent
  Center row, boundary call, and tests.
