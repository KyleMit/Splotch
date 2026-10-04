# Rejected palette backing hint

Historical experiment for iPhone Safari portrait/light, archived as a closed, unmerged evidence PR.
Add will-change: transform to the palette container to request separate backing during selection
repaint. The base is af31a00d11cee749f7cbc24bd61035970453aca5; the original local source commit is
f6da9fc2359a359fb6078ad482f650db03f7584c on `codex/iphone-ink-color-performance`.

Changing ink color remained at 33/38 ms post-action P95/maximum in both arms. Readiness changed from
226/231 ms to 218/220 ms. Primary pacing was unchanged and remained red. A faster readiness poll did
not establish a supported product benefit. Production scoring, input, cadence, readiness and
activity-window rules were unchanged; the first valid failure was retained.

Format, type and lint checks passed. 28 stable local WebKit frames across phone and tablet layouts
and both themes had zero changed RGBA channels. These are historical operator reports; no checks or
performance runs were repeated for publication.

`evidence.json` binds the production files and source patch to their exact SHA-256 hashes.
Production and changed regression-test bytes are copied from the original commit. The complete
original branch diff is preserved; added tests retain lifecycle and correctness assertions without
relaxing performance or acceptance gates. Raw private logs, traces, screenshots, packets, device
identifiers and local endpoints are not published. The summary establishes rejection of this
treatment, with no causal diagnosis, cross-runtime claim or shipping acceptance.
