# ADR-0127: AI Image Creation Requires Explicit Opt-In

**Status:** Active **Date:** 2026-08

## Context

Splotch can send a child's drawing to a hosted image-generation service. The feature previously
appeared by default, which made the networked behavior available before a parent made an explicit
choice. The managed free allowance in ADR-0105 removes credential setup friction, but it does not
remove the privacy significance of sending a drawing off device.

Alternatives considered:

* **Keep AI image creation on by default.** Rejected because feature discovery is not sufficient
  reason to make off-device image processing available without an explicit preference.
* **Force every installation off once through a versioned migration.** Rejected because it would
  override a saved choice from a family that already deliberately enabled or disabled the feature.
* **Remove saved credentials when the feature is turned off.** Rejected because disabling a feature
  should be reversible without making a parent re-enter a key or access code.
* **Show credential and customization controls while the feature is off.** Rejected because visible
  subordinate controls imply that part of the networked feature remains active and obscure the one
  choice that controls it.

## Decision

AI image creation is an explicit persisted preference. The fallback for `settings.aiImageEnabled` in
`web/src/lib/state/settings.svelte.ts` is `false`; when storage already contains a value, the
dual-layer storage behavior in ADR-0005 continues to preserve that value. There is no one-time
migration. An installation with no stored preference receives the new off fallback, while an
explicit stored `true` or `false` remains authoritative.

The **Create AI Images** switch in `AiKeyManager.svelte` is the master control. While it is off, the
Settings section renders an explanation of the feature and does not mount credential, customization,
or auto-save controls. The canvas action and free-allowance request remain gated by the same
setting, so the off state does not merely hide configuration UI.

Submitting a valid key or access code from Settings is an explicit setup action and enables the
feature after the credential has been persisted securely. Capturing an access code from an invite
URL persists the credential but leaves the feature off; opening a link is not itself an opt-in.
Turning the switch off retains the credential. This separates permission to use AI image creation
from the mechanics of how an enabled request is authorized.

ADR-0094's operation-level parental challenge remains a separate policy. The preference answers
whether AI image creation is available at all; a configured parental challenge answers what must
happen immediately before an enabled generation.

## Consequences

* \+ A drawing cannot be sent for AI image creation until the feature has been deliberately enabled.
* \+ Existing explicit choices and securely stored credentials survive the change.
* \+ The off state has one controlling choice and can explain the feature without exposing inactive
  subordinate controls.
* \+ Preference gating and parental-gate policy have distinct, testable responsibilities.
* − Installations that previously relied on the old implicit default, without ever storing a choice,
  become off after updating and must opt in.
* − The AI action is less immediately discoverable on the drawing surface; discovery moves to the
  Settings explanation.
* − Every future AI entry point must consult the same master preference or it can bypass the privacy
  boundary.
