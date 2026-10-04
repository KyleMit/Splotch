# Rejected screenshot flash retirement

Historical experiment for iPhone Safari portrait/light, archived as a closed, unmerged evidence PR.
Remove the screenshot flash at its animation end and omit it when reduced motion was stamped at
launch. The base is af31a00d11cee749f7cbc24bd61035970453aca5; the original local source commit is
2cbbbd9923d9ec525d20d414988925fc64620992 on `codex/iphone-screenshot-performance`.

Screenshot P95/maximum changed from 18/56 ms to 18/38 ms and still failed the existing scorer.
Readiness changed from 203/203 ms to 203/308 ms. Both arms retained all four valid activations. The
first valid result still failed production scoring despite the lower isolated maximum. Readiness did
not supply a supported benefit. Production scoring, input, cadence, readiness and activity-window
rules were unchanged; the first valid failure was retained.

Format, type and lint checks and eight lifecycle tests passed; original-source negative controls
failed four intended guards. 52 stable paired WebKit frames across layouts, themes and motion
preferences had zero changed RGBA channels. These are historical operator reports; no checks or
performance runs were repeated for publication.

`evidence.json` binds the production files and source patch to their exact SHA-256 hashes.
Production and changed regression-test bytes are copied from the original commit. The complete
original branch diff is preserved; added tests retain lifecycle and correctness assertions without
relaxing performance or acceptance gates. Raw private logs, traces, screenshots, packets, device
identifiers and local endpoints are not published. The summary establishes rejection of this
treatment, with no causal diagnosis, cross-runtime claim or shipping acceptance.
