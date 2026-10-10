# Custom paint construction controls

These are development controls for the custom paint feature based on Width source
4b1882fb7dd41cf7b4387bdc323c6698f798d6e9. They establish neither dependency acceptance nor campaign
completion. The
[construction note](../../../../experiments/native-architecture/CUSTOM-COLORS-CONSTRUCTION.md)
describes the implemented choices and remaining running checks.

The retained initial logs show unsupported native style typing, size-cap lint findings, explicit
v4-to-v5 parser normalization against old expectations, actual React Native Web modal-animation and
native-button test harness differences, a hydration wait, mounted fixture paint ownership, a Crayon
ID oracle and a sandbox dprint cache failure. A later click-control test omitted its real helper
import; its 269-pass/one-fail result and lint failure are retained. Repairs preserve strict
input/source inventories and existing v4 fixture bodies.

The final scoped tier passed 18 files / 270 tests with one worker in 18.09 seconds. Its meaningful
negative controls reject malformed/custom-in-v4 drawings, malformed palette snapshots, stale
geometry, failed settings writes and physical trailing clicks; positive controls exercise exact
v4-to-v5 stroke normalization, full-snapshot retry, simultaneous-contact color/width ownership,
installed-renderer selection/focus, mixed pigment definitions and decoded PNG colors. The strict
candidate source inventory includes all three consumed new modules.

Candidate TypeScript (`tsc --project experiments/native-architecture/tsconfig.json --noEmit`),
`npm run check`, `npm run lint` and `npm run format:check` exited zero. The empty TypeScript log
represents success without diagnostics. Format verification uses
`DPRINT_CACHE_DIR=/private/tmp/native-custom-colors/dprint-cache` for its sandbox-owned cache. The
scoped command selects the three custom-color suites, candidate-imports, width/model/screen,
settings, eraser/composition/contact, joint-sound and Crayon/width-output suites; it does not invoke
the full tools tier. Logs describe only their named checks. Full tools, compact browser and native
feedback remain separate pending work. The backdrop resize hook was added after source inspection;
the planned running resize case must establish fresh coordinates and exploration cancellation.
