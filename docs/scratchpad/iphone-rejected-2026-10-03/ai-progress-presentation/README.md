# Rejected AI progress presentation freeze

Historical experiment for iPhone Safari portrait/light, archived as a closed, unmerged evidence PR.
Pause progress presentation after the AI dialog retires and pass the last presented value into the
dial and preview blur. The base is af31a00d11cee749f7cbc24bd61035970453aca5; the original local
source commit is d5b3d95b1ff421fcfc4695fd9947be505ddbbeee on
`codex/iphone-ai-progress-presentation`.

Canonical show P95/maximum changed from 25/75 ms to 29/58 ms. The fixed later raw window changed
from 23/29 ms to 25/57 ms. Readiness changed from 35/94 ms to 31/34 ms, while the primary pacing
result remained red. The primary pacing result remained red, and the fixed later window did not show
a supported benefit. Faster readiness and a lower isolated maximum did not establish acceptance.
Production scoring, input, cadence, readiness and activity-window rules were unchanged; the first
valid failure was retained.

24 lifecycle tests passed; the original negative guard recorded 118 hidden dial writes. 12 visible
WebKit frames were pixel-identical. These are historical operator reports; no checks or performance
runs were repeated for publication.

`evidence.json` binds the production files and source patch to their exact SHA-256 hashes.
Production and changed regression-test bytes are copied from the original commit. The complete
original branch diff is preserved; added tests retain lifecycle and correctness assertions without
relaxing performance or acceptance gates. Raw private logs, traces, screenshots, packets, device
identifiers and local endpoints are not published. The summary establishes rejection of this
treatment, with no causal diagnosis, cross-runtime claim or shipping acceptance.
