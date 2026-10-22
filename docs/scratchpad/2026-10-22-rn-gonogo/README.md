# RN go/no-go campaign

This campaign compares the frozen React Native candidate with shipping SvelteKit/Capacitor source
and the released store apps so the maintainer can choose whether to ship the rewrite as the next
version, separately for each platform. Each piece records its sources, methods, evidence,
limitations and gate/factor disposition; historical evidence is not promoted to final-candidate
acceptance.

| Piece       | Gates/factors                                                                                                | File                             | Headline                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Desk review | Maintenance, dependency/upgrade risk, reversibility, architecture, velocity, parity coverage, cost to finish | [desk-review.md](desk-review.md) | Native architecture fits; current evidence and release/rollback cost favor holding both native cutovers. |
