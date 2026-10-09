# Migration evidence tools

## Native architecture topology tools

`check:migration:native-topology` validates the private candidate's declared imports, released SDK
alignment, native resolution and typed/Metro/autolinking configuration. It requires a reviewed full
root install and creates no native project or device process. Quality uses live candidate archive
identities, installed Forge controls, production/import boundaries and current canonical native
plugin paths; it does not freeze unrelated root script, lock or Capacitor bytes.

Candidate import ownership walks maintained JS/TS files, including platform suffixes, dotfiles and
untracked local helpers. It checks tsconfig extensions, types, JSX import sources and local
project/include paths, Expo JSON/JS plugin arrays, and explicit Babel preset/plugin references. The
result lists scanned files, recursively read local tsconfigs and finite generated subpath
exclusions. Dependency directories named `node_modules` are excluded at any candidate depth; local
imports back into an excluded subtree fail. Maintained `android/` and `ios/` files are not
blanket-excluded.

The strict candidate parser covers literal import/re-export/require/require.resolve, templates,
TypeScript import-equals/import-type, JSX/JSDoc and triple-slash references. Computed module
arguments, loader aliases, `createRequire`, `import.meta.resolve` and JS provider-context resolution
fail visibly. Babel aliases and computed plugin/preset configuration require an explicit reviewed
owner. Supported JS configs export a literal object or a function returning literal objects;
plugin/preset entries are literal arrays using full package names or `require.resolve`. Expo uses
its own plugin-option handling. Babel tuples permit only the module and an optional literal empty
options object; nonempty/opaque options and extra tuple members require a reviewed consumer owner.
The current Babel owner supplies no options. Options can generate module imports, as the released
Expo preset's `jsxImportSource` does; the native/Metro installed graph qualification owns generated
dependencies beyond this finite declaration grammar. Expo uses its `expo` wrapper when present and
otherwise the flat object; both static JSON filenames are discovered. CommonJS config assignments
must be standalone statements; configuration vocabulary bindings and foreign object keys are
refused. Config spreads, member reads/mutations, opaque exports, computed names and Babel
`env`/`overrides`/`extends`, duplicate configuration keys and prototype shapes are refused visibly
rather than executed. TypeScript path aliases, custom type roots, base URLs and merged root
directories also require such an owner. Per-file JSX import-source pragmas are unsupported: the
TypeScript leading pragma and Babel comment rules differ. String, template, regex and JSX-text
lookalikes remain ordinary content. The default automatic React runtime remains supported. The
shared shipping/Forge parser keeps its existing scope.

Root Node configs and `scripts/` can use actual Node builtins; app source cannot. App source also
refuses local edges and discovered app aliases into Node-owned configs/scripts; internal aliases
retain their canonical role. Symlinked semantic config files and local extended tsconfigs are
unsupported: configuration filenames and containing directories affect consumer selection. Local
TypeScript `extends` chooses an existing file before its `.json` fallback, ignoring same-named
directories. Declared bare builtin-name polyfill packages remain package imports; `node:` references
remain builtins. Bare packages must be candidate declarations with canonical package syntax. Hoisted
declared packages may live outside the candidate; only local/discovered targets receive
lexical/physical ownership checks. Unresolved local module resolution stays with TypeScript/Metro.
Expo and Babel configuration grammar applies to project-root files; nested app modules with those
filenames stay app source. Metro string module references, including `babelTransformerPath` and
`minifierPath`, and alternate configuration lookup require a separate owner and are emitted as
noncoverage. Podfile/Gradle and native provider-context commands remain the separate PHASE-1
source/materialization/toolchain obligation; this scanner emits that non-coverage and supplies no
native execution result.

`check:migration:native-topology:evidence` verifies the exact topology05 lock/manifest/Netlify and
Capacitor proof inputs, complete historical archive selection and candidate-exclusive record. The
Native topology proof workflow runs both commands on the topology05 PR and the named Netlify proof
ref. Run the evidence command in the proof's source checkout; later intentional root changes do not
rewrite historical evidence or need its byte hashes to pass ordinary Quality.

`gen:migration:topology-proof-inputs` derives the two proof records from their existing owners after
live archive and production guards pass. Review the resulting diff before proof execution. It
neither refreshes the archive inventory nor supplies an install, build or hosted result; changed
candidate archives require their separate inspection and review first.

`gen:migration:script-inventory -- --baseline <lock> --output <json>` inventories every new or
changed v9 lock artifact. The tool reads YAML, fetches public registry metadata/archives, checks
both lock/registry integrity, and inspects package.json hooks, root binding.gyp and root .hooks file
members. It never extracts archives or executes their code. Four workers bound concurrent
inspection. Any malformed source, identity, archive or missing artifact fails before a report is
complete. Hook-bearing rows require explicit review before installation; a metadata flag is
informational and supplies no lifecycle verdict.

Root pnpm settings, ADR0119 and the migration contract own this boundary. Normal installs,
production controls, native generation and hosted proof are distinct authorized operations. Machine
inventory and compact review live under docs/migration/evidence/native-topology-05. Tests use
synthetic lock/archive fixtures to reject omitted/ambiguous/integrity-invalid input. Inventory
coverage is recomputed from the complete prior resolution snapshot rather than trusting its own
selection list. Actual released Expo search runs before resolve to expose duplicate realpaths;
resolved native project, podspec and plugin directories must stay inside their candidate-owned
package roots.

`check:migration:native-candidate` validates the maintained Android/iOS source set, original
template provenance and source contracts. It takes no arguments, performs no native build, and runs
after the live topology guard in Quality. Additional native files are refused; native build and pod
writers require an independent owned disposable source copy.

The checker also authenticates the separately maintained manual candidate `Gemfile` through
`lib/native-gemfile.mjs`. That owner pins the complete source bytes and the proposed Ruby/CocoaPods/
xcodeproj versions; it claims no gem resolution or native compatibility. The template archive and
materializer do not own or emit this file. Its source departure and pending runtime/configuration
gates are recorded in `experiments/native-architecture/NATIVE-SOURCES.md`.

`gen:migration:native-candidate -- --archive=<reviewed-template.tgz>` authenticates one explicit
regular archive against the maintained manifest and derives candidate-only sources. An exact
destination remains unchanged, including exact producer modes; incomplete destinations or maintained
edits are refused. This manual command never runs in Quality, a shipping build or an install
lifecycle.

The template archive/registry license discrepancy and platform environment ownership are described
in `experiments/native-architecture/NATIVE-SOURCES.md`. SDK/JDK materialization, native dependency
installation, optimized compilation, signing, mount, device floors and performance remain separate
reviewed execution gates. Source validation cannot establish those outcomes.

## Retained web host control

This capability owns isolated migration build/evidence callers. It does not choose a frontend,
change the shipping host, install packages or certify performance.

`migration:web-host:build` builds the unchanged SvelteKit web app twice: once through its retained
Vite owner and once through the candidate-only Vite wrapper. Both run in independently owned
source/dependency copies. `migration:web-host:check` rechecks a built copy's scoped types and
structural comparison. `migration:web-host:test` drives the built copy's retained browser smoke. The
browser config invokes `serve-web-host.mjs`; that private entry serves only an existing,
source-bound owned artifact and refuses a missing explicit port.

```sh
npm run migration:web-host:build -- --topology-sha=<workflow-checkpoint-commit> --topology-lock-sha256=<workflow-checkpoint-lock-digest> --artifact=release
npm run migration:web-host:check -- --artifact-root=<reported-owned-root>
npm run migration:web-host:test -- --artifact-root=<reported-owned-root> --port=<unused-port> --browser-registry=<existing-absolute-registry>
```

The topology commit and lock digest are required execution inputs. Take `--topology-sha` from
`jobs.retained-web-host-control.env.TOPOLOGY_SHA` and `--topology-lock-sha256` from
`jobs.retained-web-host-control.env.TOPOLOGY_LOCK_SHA256` in
[the CI workflow](../../.github/workflows/test.yml). The
[retained-control acceptance record](../../docs/migration/evidence/retained-control/README.md)
preserves historical execution inputs and results. The active source must contain the workflow's
checkpoint commit and retain its exact lock. A normal merge commit must preserve that checkpoint's
ancestry; squash or rebase merging this security-lock update would remove the required ancestor. A
frozen full dependency install must already exist and have the same installed lock; this runner
never installs. Final evidence exports a clean committed source slice, records its real commit and
source hashes, and derives version metadata through `web/buildVersion.ts`. `--provisional` permits
local iteration with HEAD, binary patch and actual file hashes; it cannot supply final review
evidence. `--artifact=mechanism` enables only the existing private harness, with performance marks
disabled. It is distinct from the release artifact and cannot score release startup costs.

Outputs are a new `splotch-web-host-*` temporary root (or under the explicitly separate existing
`--output-parent`), a fresh ownership marker, frozen inputs, reference/control copies, both wrapper
passes, output hashes, named child logs under `controls/*.log.txt` and a result. Emitted bytes must
match after only the explicitly recorded owned-copy path prefix normalization; other differences
fail. Both copies share one recorded UUIDv4 app-shell nonce, which the actual copied nonce owner
honors only inside its verified marked artifact and copy. Ordinary builds derive fresh nonces
without writing environment state; the shipping PWA postbuild guard refuses an ambient pin. Build
and artifact readback check both emitted shell URLs against that exact recorded nonce. File kind and
mode must match before a matching byte digest is accepted. Build time is identical pinned metadata,
not normalized. pnpm source hardlinks are valid; destination files have independent inodes. Relative
dependency links must resolve inside the dependency copy. Only copied `.bin` shim paths naming the
original checkout are relocated, with before/after hashes recorded. No dependency preparation runs
here. Each copy invokes the actual `prebuild`, then `npm --ignore-scripts run build`, then the
actual `postbuild`, with input guards between stages. The control forwards only its wrapper config.
npm owns each lifecycle event and script body; the staged invocation differs from one ordinary
`npm run build`. Additional implicit pre/post hooks are rejected rather than skipped.

Both copies bind all materialized source/dependency bytes, modes and symlink targets. Generated
source paths come from the existing icon/release generators; those files and Kit support become
frozen after Vite. Only the observed root Vite cache directories remain mutable. Readback guards run
before copied modules or children and again after scoped types, before helper imports. Static and
dynamic external chunk edges are checked alongside included modules. Each browser child gets a fresh
empty owned transform cache and an owned temporary directory; `HOME` is inherited. The browser
caller requires an explicit existing absolute `--browser-registry` directory and passes only that
path through `PLAYWRIGHT_BROWSERS_PATH`. The ordinary launcher, channel and headless executable
selection remain unchanged. A UUID invocation label has one environment owner; result and HTML
report folders use that label, and successful/failed child records retain both paths. Each rerun
preserves earlier screenshots, traces and reports. Directory identity is checked again before the
child and recorded on success or failure; this does not certify browser bytes, version or engine.
The harness does not install, download, clear or write this borrowed registry. Ordinary Playwright
host validation may write its `DEPENDENCIES_VALIDATED` marker there. Owned profile/temp, XDG/NPM and
transform paths remain separate. A `0`, relative or default Playwright registry setting must be
supplied as its concrete original installed directory, never guessed after relocation.

Invalid flags, missing/mismatched inputs, dirty final source, escaping links, replaced ownership,
failed children, interrupted children and missing passes exit nonzero. Copied build/browser children
have session-owned detached groups; active SIGINT/SIGTERM handlers request TERM and escalate after a
bounded grace period, remove their listeners and retain failure receipts. An interrupted child is a
failure even when its exit code is zero. Preview instead inherits the Playwright-owned webServer
group, keeping Vite within ordinary Playwright teardown. No borrowed process or listener is stopped.
Partial artifacts remain available for diagnosis; the tool never deletes borrowed folders or
silently retries a failed build. Checks compare active source and borrowed output/dependency
inventories before and after. The result's `structural-build-only` status carries pending browser,
deployed CSP/PWA and physical acceptance. No comparison or guard is passing evidence until its
recorded execution succeeds. A successful control does not establish a later React host's
eligibility.

Maintain boundary strings in the React-free build contract. Preserve the existing Kit config,
routes, metadata, generators and shipping postbuild owners. Tool-helper guards live in this
capability's tests; wrapper/browser sources live under `migration/probes/web-host`. Root discovery
and the retained-control CI job register these callers over the accepted topology checkpoint. CI
runs release build/check/browser, then mechanism build/check/browser twice, serially on one runner.
The acceptance record owns the measured harness-cost derivation for its numeric job deadline. The
lock-only Handlebars security update changes dormant tooling without changing build/browser owners
or workloads, so the existing timing allowance remains. Fresh source-bound release/mechanism CI must
still pass; historical results do not qualify the changed lock.

`gen:migration:hosted-topology` runs after all ordinary web postbuild guards. Only the exact
nonproduction proof ref writes `web/build/migration-install-topology.json`; other builds return
before reading evidence. Native builds and development servers have no static input to copy. A
second writer refuses an existing path. The export contains the complete installed package and
five-context resolution rows, reviewed input hashes, actual runtime identities and individually
selected non-secret deploy identifiers. Its observation happens after the build. It proves no native
candidate execution, performance, continuity or deployed application behavior.

`check:migration:hosted-topology -- --artifact <downloaded-json> --commit <sha> --metadata <json> --transport <json>`
requires the exact source checkout. The metadata file contains only `id`, `build_id`, `site_id`,
`commit_ref`, `branch`, `context` and `state` from the supported deploy read. Fetch the file using
the deploy-ID permalink, preserve its URL, status, content type and complete decoded body with byte
count and SHA-256, and reject HTML or partial responses. Bind that transport receipt to the exact
bytes supplied to the reader using a transport JSON file with exactly `url`, `status`,
`contentType`, `bytes` and `sha256`. The reader requires the immutable deploy-ID URL, HTTP 200, JSON
media type and matching complete decoded bytes. Transport and selected metadata remain
operator-attested inputs, not authenticated proof on their own. The offline reader rechecks graph
and deploy/source invariants against the contract bytes in that checkout; its receipt alone does not
establish a physical package census for an arbitrary local JSON file. Completeness also requires the
selected immutable response and its exact committed physical producer. Full deploy logs are optional
corroboration; their availability cannot replace this reader or the complete downloaded graph. Raw
metadata may contain tokens and stays host-local.

The export owner changes when the production manifest, lock, candidate manifest, workspace, Netlify
configuration, proof branch or postbuild ownership changes. Regenerate reviewed proof inputs before
a fresh hosted run; do not rewrite historical execution evidence. Remove the export command and its
proof-only hosted output after its complete evidence has transferred to the campaign's accepted
topology record and a replacement owner has been reviewed.
