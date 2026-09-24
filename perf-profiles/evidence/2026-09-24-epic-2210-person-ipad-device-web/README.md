# Epic 2210 person-present session, visit 1 (2026-09-23/24)

Captured by `npm run perf:session:person` (runbook:
`docs/scratchpad/perf/2026-09-23-epic-2210-person-session.md`) on the rig iPad (iPadOS 26.5) and the
rig phone. Every capture was judged PASS on the spot: fidelity, regime, product commit, contact
time, and pointerdowns where they apply.

| Package                                                            | Product                                                                             | What it holds                                                                                                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| this one (`…-person-ipad-device-web`)                              | 8e6700d5d801eb481a4bde3d47cea69135dd71b4                                            | issue 2235 paired pen and Magic (driven + finger), issue 2232 Magic first loads, issue 2231 eraser and landscape-dark pen finger captures |
| `2026-09-24-epic-2210-person-ipad-device-native`                   | 439cd3c3d8e78f02be1f86ad6a540d12acc5c982                                            | issue 2236 bundled-app finger captures (the installed build; its product tree equals the session's)                                       |
| `2026-09-24-issue-2229-portrait-ab-{base,head,head-reduce-motion}` | e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3 / 3928cd88edbf441530e473a4e3c0b6767926bfc6 | issue 2229 A/B, three rounds per arm, each with 160/160 pointerdowns                                                                      |
| `2026-09-24-issue-2211-ipad-web-secure-actions`                    | 8e6700d5d801eb481a4bde3d47cea69135dd71b4                                            | issue 2211 four-mode action sweeps over the HTTPS front                                                                                   |

Rescore the drawing captures with
`npm run perf:rescore -- --corpus=perf-profiles/evidence/2026-09-24-epic-2210-person-ipad-device-web --target=ipad-device-web`.
The A/B arms were foreign builds, so each capture records `productCommit: null` and a `buildDigest`
that the session proved against its arm's worktree. `index.json` carries the arm's commit.
