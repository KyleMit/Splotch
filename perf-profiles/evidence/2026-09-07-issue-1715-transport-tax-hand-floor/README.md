# Transport-tax hand-floor captures (issue #1715)

Three real-finger `perf:device:hand` captures (ADR-0144) on the physical iPad in **Safari** at
product commit `e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3` (the committed corpus commit), taken
2026-09-07 to test whether the iPad-web drawing lost-frame reds reproduce under a real finger.

They do not. The driven WDA/XCUITest transport reads ~1.0–1.4% lost-frame on these cells; a real
finger reads 0–0.2% on the same product, same probe, same self-reported measurement path (ADR-0135),
with identical paint time. This is the evidence behind the transport-tax investigation.

| File                                                 | Cell                    | late % | Driven corpus, same cell |
| ---------------------------------------------------- | ----------------------- | ------ | ------------------------ |
| `issue-1693-hand-pen-portrait-light-67985-121.json`  | pen / portrait / light  | 0.2%   | 1.37% RED                |
| `issue-1693-hand-pen-landscape-dark-69383-105.json`  | pen / landscape / dark  | 0.0%   | 1.22% RED                |
| `issue-1693-hand-magic-portrait-dark-70659-145.json` | magic / portrait / dark | 0.2%   | 1.15% RED                |

The magic capture additionally carries intentional overlay-load deferred-paint stalls (577/433 ms,
799/733 ms) — a shipped product behavior, not part of the transport tax.

These are attribution evidence, not scoreable gate captures (the tool records "no established regime
— not scoreable"), and its `late %` is not the byte-identical metric of the driven scorer's
`lost-frame share`. Read the gap as directional. LAN host redacted to `<lan-host>`; no device
identifiers were present. Retained here because the `/private/tmp` capture worktree they were taken
in is disposable.
