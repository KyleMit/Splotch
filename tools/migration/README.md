# Native architecture topology tools

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
