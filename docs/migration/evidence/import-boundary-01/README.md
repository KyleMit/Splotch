# Candidate import boundary: F1 correction

Owner: the import-boundary unit worker; parent integrator owns review, final CI and integration. The
original reproduction uses accepted source dc08a90abc67b53124146bf288c80de0f9ffd1dd. Implementation
composes accepted records-only integration e7413bf92066fcf45967cf04241a513fd48d49ff over the
previous preservation-only base aa507a74963adac35baed84c7ab2e13cdc12a946. This unit changes no
candidate dependency, lock, shipping source or native project.

## Uncertainty and boundary

The fixed five-file guard claimed declared candidate import coverage while the hoisted root tree
could satisfy undeclared imports. Its released-system owner is `assertDeclaredCandidateImports`,
called by the public `check:migration:native-topology` command before loading candidate configs and
executing typecheck/transform.

Expected positive: the actual accepted candidate and maintained local splits, supported config
references, platform/extension variants, root Node config/script builtins and declared hoisted
packages. Rejecting control: a direct or reachable undeclared `yaml` import must fail at the
ownership assertion, while its actual TypeScript configuration can still pass under hoisting.
Source/config/path variants test the same boundary. Syntax/setup failures do not count as intended
rejecting controls.

The exact old-source reproduction confirms F1: direct `yaml` rejected, entry → `Extra.ts` → `yaml`
passed the guard and actual candidate typecheck. Original/restored positives passed with identical
entry hashes. The borrowed retained dependency tree was clean at
8ddfc04053ccdf285c2f6fd7c2b75e745a9d2fc6, using Node 24.16.0, TypeScript 6.0.3 and yaml 2.9.1. This
is guard/type-resolution evidence, with no supported-floor/native execution claim.

## Implemented disposition

The candidate-only scanner discovers maintained JS/TS, platform/dotfile variants and the explicit
JSON config owners. It parses literal import/re-export/require/require.resolve, TypeScript
import-equals/import-type, JSX/JSDoc and triple-slash references. Actual type-reference resolution
identifies the declared package owner, including `@types` packages under hoisting. Recognized
computed loaders and loader aliases fail visibly. The shared shipping/Forge parser is unchanged.

Bare package references reject traversal, empty segments, backslashes, URLs, absolute paths and
malformed scopes. Dot-prefixed bare packages remain dependencies. Node configs/scripts permit real
Node builtins; app sources reject them and local edges into Node-owned configs/scripts. Canonical
file identities preserve these roles when internal symlinks change discovery order. Declared bare
packages receive no candidate-realpath fence, because their root hoisted locations are legitimate.
Only discovered/local targets receive lexical and physical containment/excluded-subtree checks.
TypeScript/Metro continue owning unresolved local module resolution; this unit adds no generic
resolver.

The scanner checks tsconfig extensions/types/JSX import sources and local project/include paths,
Expo JSON/JS plugin arrays, and explicit Babel preset/plugin arrays, including Babel JSON/dotfiles.
Babel aliases, computed plugin configuration, TypeScript path aliases/custom type roots/base
URLs/merged root directories, and JS provider-context resolution are visibly unsupported pending a
real reviewed consumer. Full Babel package names, `module:` exact names and the current
`require.resolve` form remain valid.

Generated exclusions are finite subpaths emitted in the checker result; dependency directories named
`node_modules` are excluded at any depth. Local edges/symlinks back into excluded output fail.
Maintained Android/iOS directories remain eligible for JS/TS scanning. Podfile/Gradle
provider-context commands have the separate PHASE-1 native source/materialization/toolchain owner;
their explicit non-coverage is emitted and tested. No native-language resolver or native acceptance
is introduced.

## Independent plan challenge

The first substantive F1 review was the combined continuation/F1 question in Claude conversation
bbe89d5b-644f-4d4f-9366-e5156cebf4ea. Its raw findings are preserved under `review/`; two
substantive rounds remained at that plan checkpoint. PR2697 is not reopened. The parent adopted this
actual identity into PR2703 and successfully resumed it for substantive round two; one final round
remains.

All four blocking amendments were accepted after local verification:

| Finding                           | Disposition and evidence                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parser forms and shared semantics | Candidate-only parser covers the demonstrated literal/TS/JSX/reference forms; unsupported loaders refuse explicitly. Current shared parser tests still pass.                                                                          |
| Declared prefix traversal         | Bare `expo/../yaml` and related malformed forms reject before package-name ownership; old-source regression proves the demonstrated false pass.                                                                                       |
| Canonical/builtin/provider roles  | Only local/discovered paths receive ownership fences. Real candidate/hoisted positives pass; Node role controls are symmetric. JS provider-context syntax refuses explicitly, native commands keep their separate visible owner.      |
| Discovery/config coverage         | Filesystem discovery covers extensions/platforms/dotfiles/untracked helpers and config references. Finite exclusions and native-language non-coverage are emitted. Current/future positives and named rejects exercise each boundary. |

Source-only reviewer agreement does not establish execution or acceptance. The review's PR2700
preservation comments belong to the parent preservation unit, not this implementation's acceptance.

## Executed evidence and remaining gates

`source-inputs.json` binds the tested source files and accepted candidate/package/lock inputs.
Complete combined-repair source command output and receipts live under `controls/final-v5/`;
`controls/final-v3/` is the reviewed prior head and remains historical evidence. The new rejecting
assertions were also executed against the exact accepted old checker: 33 controls failed at the
expected rejecting assertions, with no syntax/setup failure. The final checker was restored
byte-for-byte afterward.

`controls/final-v1/` preserves the earlier executed source and its source manifest. Subsequent
adversarial role probes found two guard false passes: an app import into a Node-owned script and a
Node-directory symlink that relabeled canonical app source. The exact guard-only observations are
preserved under `controls/development/role-counterexamples.json.txt`. Canonical discovery and
app-to-Node edge rejection corrected those cases, and restored positives pass. Final v2 supersedes
v1 for executed-source acceptance; the reconstructed v1 executable files match the recorded v1
hashes byte-for-byte.

A final v2 configuration probe showed that TypeScript `rootDirs` could select sibling foreign
`Extra.ts` importing undeclared `yaml`; both the scanner and actual typecheck passed. Its original
probe/receipt remain under `controls/development/`. The final v3 scanner explicitly refuses merged
root directories alongside the existing unsupported resolution aliases. The same fixture rejects for
that named ownership reason, and restored guard/typecheck positives pass. Reconstructed v2
executable bytes match their recorded hashes; its successful full tier remains historical evidence,
not final-v3 acceptance.

Actual public topology-command direct and reachable mutations fail for their specific ownership
messages and nonzero exit. The reachable mutation still typechecks; restoration passes the real
guard and actual candidate typecheck. The complete restored public checker output covers the
installed identities/configuration/transform path and emits import coverage/exclusions/non-coverage.
It supplies no native compile, mount, performance or continuity result.

The own-worktree frozen full install used unchanged reviewed inputs and pnpm 11.22.0. Non-TTY and
sandbox DNS failures are preserved separately from the successful host install. The initial lint
failure identified a test-helper naming issue; the assertion helper was renamed to the repository's
`expect*` convention and scoped lint passed. These are setup/development outcomes, never intended
negative controls.

At the prior v3 checkpoint, targeted controls, full typecheck/lint, formatting and the public
topology command passed. The replacement full Browserless tier passed all five stages: 4,463 app
unit tests, 45 SSR tests, 298 asset tests, 22 store tests, 7,571 tool tests and 42 API smoke checks.
Its explicit exclusive host lease records the source snapshot, unused smoke port, process group,
numeric deadline and verified release. The scanner/config scope does not change shipping/browser
runtime source; registered final-head CI owns the remaining browser jobs. The mistaken unregistered
topology script invocation and partial test-path selection are preserved as setup/scope errors,
separate from the successful registered command and complete four-suite scoped gate.

Independent resumed executed-source acceptance, final-head CI, push and integration remain separate
states recorded by the parent in the live campaign register. This packet does not mark the unit or
migration complete.

## Resumed round two and combined repair

The actual original conversation resumed for round two on ee7c3c24dfbcbbb683189f7bd30be6e7191d9b24.
`review/round-2/` preserves complete findings, session/done metadata and the public review with all
five threads. The review requested changes; neither the prior full tier nor reviewer agreement
accepted those configuration gaps. Two substantive rounds are used and one remains.

| Finding                           | Executed disposition                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flat Expo JSON plugins            | Parse `expo ?? root`, matching installed Expo; flat undeclared `expo-font` rejects, wrapped and declared forms remain positives.                                                                                                                                                                                                                                                      |
| Preferred static config           | Discover `app.config.json`; installed Expo selects it over `app.json`, and the guard checks its plugin imports.                                                                                                                                                                                                                                                                       |
| Babel/Expo member configuration   | Support literal object exports and functions returning literal objects. Refuse member reads/mutations, spreads, opaque forwarding, computed keys, accessors/methods and unsupported Babel composition keys. Actual Babel/Expo consumers still load the reported packages; the guard visibly refuses unestablished ownership. Current Babel `api.cache` and literal plugin forms pass. |
| Extensionless app alias into Node | Apply canonical role fences to discovered file/directory aliases before physical-file deduplication. App-to-Node aliases reject; Node-to-app aliases retain canonical application rules.                                                                                                                                                                                              |
| Declared builtin-name polyfill    | Treat declared bare names as package imports; reserve builtin refusal for `node:` or undeclared builtin names. Installed Metro resolves an owned synthetic `buffer` package. This is future-positive resolver evidence, not an installed shipping polyfill or native runtime proof.                                                                                                   |

Separate bounded probes found valid TypeScript `extends` directory collisions and a physical-file
cache that erased lexical alias context. TypeScript selects an existing file before `.json`
fallback; the guard follows that selection and preserves outside/excluded ownership fences.
Symlinked local tsconfigs and semantic config filenames are explicitly unsupported because their
lexical paths affect consumer semantics. All eleven actual TypeScript fixtures typecheck with exit
zero; the intended unsupported/escape guard results are recorded independently.

A literal duplicate Expo wrapper initially selected the guard's first object while JavaScript and
installed Expo selected the last. Duplicate configuration keys and prototype shapes now refuse
visibly. The exact prerepair reader was reconstructed and verified against its observed SHA256; its
executable replay and the final duplicate-key rejection both preserve actual Expo behavior.

Final combined scoped controls pass 126 tests across five suites. Replacing both scanner files with
exact ee7 code yields 18 intended false-pass assertion failures and four intended declared-polyfill
false-rejection failures; the new files restore byte-for-byte. Three broader policy fixtures were
already rejected for undeclared packages by ee7 and only changed refusal reason: they are preserved
as preexisting rejects and excluded from the false-pass count. The initial regression harness
incorrectly treated all failures as false passes and refused to certify that run; its correction
separates these outcomes. A prototype fixture initially failed for another valid fence's message;
the final syntax traversal reaches the prototype boundary and the intended control passes.

The mistaken Vitest project filter, partial suite selection, Metro metadata export-path error and
sandbox loopback refusal are preserved as setup/scope errors. They are distinct from intended
negative controls. No candidate/package/lock dependency or shipping runtime change is introduced.
The frozen twenty-file source manifest and final static-gate receipt bind check, lint, formatting
and the actual public topology command. Six final scoped suites pass 935 checks, including 809
tracked-tool import-resolution checks. The actual final public command rejects direct and reachable
`yaml` mutations while hoisted typecheck still passes; restored guard/typecheck positives and source
bytes are verified. The first combined v4 Browserless run failed one tool guard after that guard
enumerated the tracked F1 test. Eight synthetic relative imports inside fixture strings were
mistaken for real repository imports. Before the initial v3 commit, that new test was untracked and
absent from this guard's Git file list; its earlier passing tier cannot establish the tracked state.
The correction belongs to the fixture owner: construct fixture import text through `candidateImport`
without weakening the repository guard or expanding its exceptions. New tool files are staged before
v5 gates, and the manifest binds the tracked tool paths. The failed v4 full tier, complete outputs
and verified process release remain separate from the successful replacement v5 tier. Consumer
receipts are reused only through the explicit v4-to-v5 relevant-input equality receipt;
scanner/config/candidate/installed inputs did not change when fixture text construction changed.

The replacement full Browserless tier passes all five stages: 4,463 app tests, 45 SSR tests, 298
asset tests, 22 store tests, 7,614 tool tests and 42 API checks. Its 75.067-second measured duration
is harness cost. The five-minute deadline, source/tracked-tool/installed identities, owned process
group, tool handle and verified port/process release are recorded in the lease.

Final original-Claude round three, exact final-head CI and parent integration remain required.

## Preservation and replay

Raw producer JSON/scripts use `.json.txt`/`.mjs.txt` so repository formatters preserve their exact
bytes. Logs retain complete output as `.log.txt`; `manifest.json` binds the captured packet.

The original isolated reproduction writes only into its owned scratch directory and requires the
retained full dependency tree at its recorded path. Copy its reproduction scripts into owned
scratch, strip only `.txt`, verify the declared inputs and run there. The later process/old-checker
and Browserless harnesses instead contain explicit paths to the qualified implementation worktree;
they intentionally mutate and restore that worktree or launch its test graph. Moving the harness
file does not change that target. Reuse requires an explicitly qualified owned worktree, adapted
path/input assertions and the applicable host lease. No harness writes into this committed evidence
directory. Capsules/bundles in the continuation packet can recover source; dependency qualification
remains separate.

The metadata/source manifest is a new unit record, not a rewrite of immutable topology05 evidence.
Reuse execution only while relevant source/config/installed inputs and scope still match; otherwise
create a new named run and keep prior outcomes. Source, native runtime, physical comparison,
continuity, final-product and release acceptance remain distinct obligations.
