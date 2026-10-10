# Joint drawing graph source inputs

The composition uses a supported pnpm lock-only emission with both feature-owned patches. The actual
generated lock is authenticated by the consumed `native-joint-graph` owner before the SVG
projection. That projection must restore the complete Audio lock and workspace exactly; the Audio
owner then checks its source, archives and reset patch before projecting the inherited inputs.
Existing F1 and N1 policies remain unchanged.

The `audio-*` and `svg-*` snapshots retain each independent feature owner’s exact standalone inputs.
They are evidence and test fixtures, not a second active package-manager lock or an installed graph.

Generation used the already qualified Node 24.16.0 and pnpm 11.22.0 entry with
`install --lockfile-only --ignore-scripts --ignore-pnpmfile`, an owned normal metadata cache and an
empty owned package store. The actual resolver exited zero and passed its supply-chain checks. The
supervisor separately exited one because its overly strict empty-store check counted the SQLite
metadata index; no archive payload or `node_modules` was generated. Earlier Corepack and
offline-metadata failures remain preserved in private campaign evidence.

Source composition and graph generation do not establish current native compile, alpha producer,
pixels, audio speaker behavior, performance or release acceptance. The existing eraser resource,
observer and both-OS holds remain open.
