# F1: candidate declared-import boundary

Owner: import_boundary worker, with parent integration and independent Claude challenge. Base:
dc08a90abc67b53124146bf288c80de0f9ffd1dd. Records checkpoint:
63c5f2f45a463774f50455041174f075abaa4af2.

The preserved F1 claim is reproduced on exact accepted checker/candidate bytes. The live records
checkout checker matches accepted SHA256
2a591f2c8ca45be03a06c31a3c379ff74a87cb20195eddb4992ce52e58295825. Original and restored guard and
actual candidate-tsconfig positives pass. Direct yaml rejects for the intended undeclared dependency
reason; entry -> Extra.ts -> yaml passes the guard and real typecheck under the clean
retained-source hoisted graph. `reproduction.json` includes source hashes, installed manifest
hashes, commands, outputs and scope; `reproduce.mjs` is executable. This is a guard/type-resolution
result, not native runtime evidence.

## Bounded repair proposal for challenge before edits

The actual released-system owner is `assertDeclaredCandidateImports`, invoked before candidate
configuration/typecheck/transform execution in `checkNativeTopology`. Hoisted installation is
deliberate under ADR-0119. Fix this compensating boundary without changing that topology or adding
dependencies.

1. Replace the five-file list with discovery of every maintained candidate JS/TS source/config file,
   including new helpers, JS/CJS/MJS/JSX and TS/TSX/CTS/MTS files. Do not rely only on entry
   reachability: Metro platform variants and config helpers can be loaded without the TS entry
   containing an explicit edge. Dependencies/cache/generated outputs have finite, owner-named
   exclusions. Follow source symlinks only after canonical containment checks and deduplicate
   canonical directories to avoid loops. A source file/symlink escaping candidate ownership fails.
2. Parse the existing syntactic dependency vocabulary plus TypeScript import-equals and import-type
   expressions, static no-substitution template call arguments, and require.resolve element-access
   literal forms. Escape-decoded module names must go through the same policy. Candidate recognized
   import/require calls with a computed module expression fail closed with a specific diagnostic;
   the shipping scanner's currently stated computed-import scope stays separate.
3. Check every discovered module's dependencies against candidate declared packages or real Node
   builtins. Relative/absolute/file-URL imports must remain inside the candidate in both lexical and
   canonical resolution; local node_modules traversal cannot bypass dependency declarations. Cover
   local helpers, directory index and maintained Metro platform variants without executing imported
   code. Assets can remain local owned files; nonexistent/unresolved local references fail clearly.
4. Cover actual declarative dependency sites: candidate tsconfig `extends` and explicit types, plus
   local project/config paths; Expo JSON plugin entries (string or tuple). JS config imports/helpers
   receive the same discovery and AST checks. Verify any Babel bare-string preset/plugin acceptance
   against actual normalization, or require an explicit `require.resolve` owner rather than silently
   claiming all arbitrary strings are imports. Do not interpret arbitrary JSON/text strings as
   package dependencies. The reviewer should challenge whether this scope is too broad or too weak
   for the actual candidate owners.
5. Keep implementation in the migration capability, with a small purpose-named source-boundary
   module if native-identity's size/concern warrants it. No generic multi-platform
   resolver/framework, no new dependency, no rewrites of shipping import ownership, no fourth PR2697
   round. Re-export the existing candidate assertion if needed to avoid churn in exercised callers.

## Acceptance and controls

Expected positive: untouched accepted candidate; declared imports; legitimate nested local helper,
directory/platform resolution; Node imports; decoded declared package literals; local owned asset;
restored source after each mutation. Existing shipping/Forge parser consumers remain passing.

Rejecting controls must fail for their intended policy reason: direct and demonstrated reachable
yaml; previously unlisted config/helper; TS import-equals/import-type; string escapes/static
template literal; computed require/import; lexical relative escape; source/file/directory symlink
escape; relative node_modules bypass; undeclared tsconfig extension/type or Expo plugin. Syntax,
missing setup files or accidental type errors are not undeclared-import controls.

Run new focused tests against old source as negative controls, then against final source. Repeat the
real F1 fixture against repaired guard and restore/typecheck actual candidate. Run applicable final
source checks, installed topology and normal required local tier when parent assigns the host lease;
maintain exact source/command/result bindings. Independent executed-source review precedes
acceptance; final-head CI and parent integration remain separate.

Claim limits: static candidate source/config ownership and declared dependency references for the
documented syntactic/config vocabulary. Runtime reflection, arbitrary configuration code semantics,
subprocess commands, archive qualification and native/service execution remain their existing
owners. Do not infer native compilation/mount/performance/continuity from this result.

## Escalation

Stop dependent acceptance for changed accepted inputs, invalid provenance, an unintended control
failure or a material unresolved finding. Source edits wait for the parent-assigned isolated
worktree and independent Claude plan challenge. No installation, GitHub write, full/browser/native
suite, device/resource use or merge is authorized for this worker until separately assigned.
