# Driven pen control on current main (issue #1715, ADR-0174)

One driven pen capture taken on 2026-09-22 by the ship-campaign orchestrator. It records a fresh
driven reading on current main for
[ADR-0174](../../../docs/adrs/0174-ipad-drawing-lost-frame-is-judged-against-the-real-finger-floor.md).

* **Device:** a physical 12.9-inch iPad Pro, iPadOS 26.5, Safari 26.5. Portrait, light theme, pen,
  on the app's drawing route. The viewport was 1024×1227 at DPR 2.
* **Transport:** the ADR-0135 split transport. WebDriverAgent sends the W3C actions, and the page
  uploads its own probe report over HTTP. This is the same probe host and upload path that the
  2026-09-07 real-finger captures used (`../2026-09-07-issue-1715-transport-tax-hand-floor/`).
* **Product:** commit 3511b95ccdfb9677cfcf60b989fadb50ad074020, according to the operator's record.
  The artifact's `productCommit` field is null, so `perf:evidence:keep` stamped this commit into
  `index.json`. The served build's `buildDigest` is
  `1e5c53065cf2c5ce3c18eba3791d689ce5f72283621b3c40167d562ffede1372`, with entry
  `/_app/immutable/entry/start.BabUyl96.js`.

`npm run perf:rescore -- --corpus=perf-profiles/evidence/2026-09-22-issue-1715-driven-control --target=ipad-device-web`
reproduces this reading:

| Beat          | In-contact frames | Contact s | Lost-frame share | Paint P95 / max | moves/s | moves/frame | Fidelity |
| ------------- | ----------------: | --------: | ---------------: | --------------- | ------: | ----------: | -------- |
| 17 ms (60 Hz) |             4,113 |      68.7 |   **1.27% FAIL** | 16 / 41 ms      |  115.95 |        1.94 | PASS     |

Every fidelity check passed: `trustedTouch`, `cadence`, `pressure`, and `contactGeometry`.
`coalescing` is not applicable (ADR-0144). The capture had no in-contact stall episodes, so all of
the loss is spread across ordinary frames. The driven pen band at the committed matrix commit
e5142fab was 1.22–1.37%. A real finger at that commit read 0.04–0.06% after the same re-score.

`perf:evidence:keep` promoted the capture whole. After that, the one LAN address in the probe URL
(`report.meta.url`) was replaced with `<lan-host>`, which is the convention the 2026-09-07 corpus
uses. The capture carries no device identifiers.
