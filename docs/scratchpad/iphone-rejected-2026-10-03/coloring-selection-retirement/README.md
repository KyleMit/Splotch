# Rejected coloring selection retirement opacity

Historical experiment for iPhone Safari portrait/light, archived as a closed, unmerged evidence PR.
Add a modal content-concealment option and opt ColoringBook into root opacity after the same native
close, restoring the selected property during cleanup. The base is
af31a00d11cee749f7cbc24bd61035970453aca5; the original local source commit is
bb2249ef072d494fbef4359109abf27710b970ed on `codex/iphone-coloring-selection-performance`.

Selecting a coloring page changed from 20/38 ms to 17/39 ms P95/maximum and remained red, with three
maximum-breach repetitions and no hidden overruns. Candidate reopen at 25/30 ms and clear at 37/41
ms also remained red. The first valid physical selection result still failed production scoring. A
lower P95 alone did not establish acceptance, and the related family actions also remained red.
Production scoring, input, cadence, readiness and activity-window rules were unchanged; the first
valid failure was retained.

Format, type and lint checks, 4,420 core and 45 SSR tests passed; four intended negative controls
failed and all 23 restored modal tests passed. All 60 stable paired WebKit frames matched exactly.
These are historical operator reports; no checks or performance runs were repeated for publication.

`evidence.json` binds the production files and source patch to their exact SHA-256 hashes.
Production and changed regression-test bytes are copied from the original commit. The complete
original branch diff is preserved; added tests retain lifecycle and correctness assertions without
relaxing performance or acceptance gates. Raw private logs, traces, screenshots, packets, device
identifiers and local endpoints are not published. The summary establishes rejection of this
treatment, with no causal diagnosis, cross-runtime claim or shipping acceptance.
