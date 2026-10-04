# Rejected clear-sheet transform hint

Historical experiment for iPhone Safari portrait/light, archived as a closed, unmerged evidence PR.
Add will-change: transform to the existing 560 ms departing clear-sheet canvas animation. The base
is af31a00d11cee749f7cbc24bd61035970453aca5; the original local source commit is
4df389cfb2858db8c6d801d9f180d0b4afd5c483 on `codex/iphone-clear-drawing-performance`.

Plain clear P95/maximum changed from 18/41 ms to 21/37 ms; coloring clear changed from 20/38 ms to
21/37 ms. Both primary results remained red. The plain candidate retained an unconfirmed maximum
flag and one hidden overrun; its P95 was itself red. Coloring retained three maximum-breach
repetitions. Both clear variants remained red. Small readiness differences and lower isolated maxima
did not establish a supported benefit. Production scoring, input, cadence, readiness and
activity-window rules were unchanged; the first valid failure was retained.

Format, type, ESLint and CSS lint checks and 40 focused tests passed. Both 72-frame WebKit arms were
stable with zero changed RGBA channels; actual animation-end bitmap disposal was verified. These are
historical operator reports; no checks or performance runs were repeated for publication.

`evidence.json` binds the production files and source patch to their exact SHA-256 hashes.
Production and changed regression-test bytes are copied from the original commit. The complete
original branch diff is preserved; added tests retain lifecycle and correctness assertions without
relaxing performance or acceptance gates. Raw private logs, traces, screenshots, packets, device
identifiers and local endpoints are not published. The summary establishes rejection of this
treatment, with no causal diagnosis, cross-runtime claim or shipping acceptance.
