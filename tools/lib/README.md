# Shared tool libraries

`tools/lib/` is the dependency foundation for unrelated repository-automation capabilities. It may
be imported by root tools and capability packages, but it never imports from a capability folder.

| Module                     | Ownership                                                               |
| -------------------------- | ----------------------------------------------------------------------- |
| `coloring-book-assets.mjs` | Shared web/native coloring catalog partitions                           |
| `html.mjs`                 | HTML escaping and report-rendering primitives                           |
| `net.mjs`                  | Local port allocation and network helpers                               |
| `playwright.mjs`           | Browser launch and executable-resolution helpers                        |
| `proc.mjs`                 | Repository root, subprocesses, main-entry detection, and failure output |
| `smoke.mjs`                | Pass/fail reporting for smoke-test workflows                            |
| `vite-server.mjs`          | Owned Vite server lifecycle for isolated checks                         |

These modules have no public command of their own. Add a helper here only when unrelated
capabilities share it and no narrower domain owns the concern. Preserve the existing exported
contracts during capability moves; `npm run lint:dead` distinguishes live shared code from unused
exports through its importers.

`proc.mjs` is also imported by `tools/adrs/check-adr-integrity.mjs`, whose standalone GitHub
workflow deliberately uses the runner image's default Node without `setup-pnpm`. Keep that shared
module compatible with the runner's Node floor rather than assuming the contributor `engines` floor.

Failures are surfaced to callers rather than converted into process exits unless process ownership
is the module's explicit contract. Run `npm run test:tools` after changing shared modules, plus the
focused suite of every capability that imports the changed contract.
