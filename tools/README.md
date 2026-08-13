# Repository tools

`tools/` owns Splotch's repository automation: build and release helpers, validation, asset
pipelines, native tooling, test harnesses, performance capture, and project-maintenance workflows.
The root [`package.json`](../package.json) is the public command catalog; run `npm run info` before
invoking an implementation path directly.

## Organization

Automation is folded by durable capability. A single executable with no owned domain files may stay
at the root. A capability with multiple entry points, libraries, fixtures, outputs, or its own
runbook gets a folder. Recognizable sub-capabilities such as a platform or asset family may add one
more named layer.

Runnable files must use `verb-object[-qualifier].mjs`. Supporting modules use purpose nouns and add
a capability qualifier when a generic leaf would be ambiguous. Entry points do not belong in `bin/`,
and generic leaves such as `index.mjs`, `toolchain.mjs`, or `config.mjs` are not used.

ADR-0111's layout is being adopted capability by capability in the migration tracked by issue 975;
until that stack is complete, parts of the tree still follow the earlier names and folder shapes.

The action verbs communicate behavior:

| Verb                                     | Contract                                   |
| ---------------------------------------- | ------------------------------------------ |
| `check`                                  | Read-only validation that can fail         |
| `gen`                                    | Create or regenerate an artifact           |
| `update`                                 | Intentionally replace a committed baseline |
| `capture`                                | Record new evidence                        |
| `analyze`                                | Read existing evidence                     |
| `run`                                    | Orchestrate a workflow                     |
| `start`, `stop`, `serve`, `open`, `show` | Lifecycle or presentation                  |

Precise domain verbs such as `convert`, `normalize`, `optimize`, `publish`, `encrypt`, and `archive`
are welcome when they are more accurate. `audit` names a capability or npm namespace, not an
executable action. ADR-0111 records two bounded `check` exceptions: the existing multi-mode golden
score tool and the deployed Blobs persistence probe, whose validation requires a reversible write.

## Root entry points

Root executables coordinate repository-wide concerns that do not belong to one capability package:

| Entry point                        | Public command or owner                   | Purpose                                                       |
| ---------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| `check-coloring-assets.mjs`        | `check:coloring-assets`                   | Validate the complete coloring-book asset catalog             |
| `check-github-action-versions.mjs` | `check:github-actions`                    | Inventory workflow action pins and optionally query releases  |
| `check-netlify-cli.mjs`            | `predev:netlify`                          | Require an authenticated, linked Netlify CLI                  |
| `check-pwa-precache.mjs`           | `postbuild`                               | Enforce offline-asset coverage and the precache budget        |
| `check-release-seams.mjs`          | `postbuild`, `postbuild:cap`              | Reject profiling and development seams in release output      |
| `open-path.mjs`                    | `ios:open`                                | Reveal a repository-relative path in the OS file manager      |
| `optimize-svg-assets.mjs`          | `optimize:svg-assets`, `check:svg-assets` | Optimize shipped SVGs or detect optimization drift            |
| `print-playwright-version.mjs`     | GitHub setup actions                      | Emit the installed Playwright version for cache keys          |
| `run-quality-checks.mjs`           | `check:quality`                           | Mirror CI's Quality job while reporting every failed step     |
| `run-web-tool.mjs`                 | web build, check, and test commands       | Run root-installed web tools with `web/` as their working dir |
| `stage-netlify-functions.mjs`      | Netlify production build                  | Copy the adapter's SSR function tree to the repository root   |
| `start-cloud-tunnel.mjs`           | `dev:tunnel`                              | Start the cloud preview server and authenticated tunnel       |
| `stop-dev-servers.mjs`             | `dev:stop`                                | Stop listeners on the repository-owned development ports      |

The check and optimization commands are deterministic and local except
`check:github-actions -- --check-latest`, which queries GitHub and reports unknown release data when
the network is unavailable. Despite its migration-defined name, `check:github-actions` remains an
advisory inventory and always exits zero; changing that behavior is outside this rename-only phase.
`open-path.mjs` remains at the root until the mobile phase specializes its sole iOS caller.
`dev:tunnel` requires the cloud-session tunnel credentials documented in
[`docs/CLOUD/Claude.md`](../docs/CLOUD/Claude.md). Contract-enforcing root checks fail nonzero
rather than silently weakening validation when an external prerequisite is missing.

## Capability documentation

Every capability and meaningful sub-capability must have a README that covers:

* its purpose and domain owner;
* runnable entry points and public npm commands;
* inputs, outputs, and committed or generated artifacts;
* prerequisites, including platform tools and environment variables;
* failure behavior and safe recovery;
* maintenance guidance and the focused verification command.

ADR-0111 adopts this requirement capability by capability; a README is added when each capability
migrates, so unmigrated folders may not have one yet.

Structural folders such as `lib`, `tests`, `fixtures`, `assets`, `prompts`, `generated`, `inputs`,
`samples`, and `probes` are documented by their nearest capability README unless they need an
independent runbook.

## Libraries and ownership

`tools/lib/` is the cross-capability dependency foundation. It never imports from a capability
folder. A module belongs there only when unrelated capabilities share it and no narrower domain owns
the concern. Reuse by a second caller does not by itself erase domain ownership: capability-owned
libraries remain under that capability and may be imported across a capability boundary.

Before adding a helper, inspect both `tools/lib/` and the owning capability's `lib/`. Extend the
purpose-named module that already owns the concern or add another purpose-named module; do not
create `utils`, `misc`, or `helpers` grab bags.

## Running and maintaining tools

Run `npm run info` for entry points and prerequisites. All scripts support macOS and Linux unless
their domain is intrinsically platform-bound, in which case they fail fast elsewhere. CLI flags are
parsed explicitly; documented environment variables are fallbacks rather than hidden interfaces.

Moving a tool between directory depths requires a full reference sweep. Update imports, test mocks,
repo-root walks, root and capability-local `package.json` scripts, `scripts-info`, workflows, active
docs, skills, `tools/vitest.config.mjs`, `knip.json`, and the narrow Netlify deploy filter in the
same capability PR. Use `git mv` so review preserves history.

For each capability move, run its focused suite plus:

```sh
npm run test:tools
npm run lint:dead
npm run format:check
npm run info
```

`tools/tests/tool-specifier-resolution.test.mjs` guards relative imports, mocks, and repo-root
walks. `tools/tests/enumerated-build-paths.test.mjs` guards knip and Netlify's explicitly enumerated
paths. Changes to `.ruler` sources require `npm run ruler:apply` followed by `npm run ruler:check`.

## Rename-only migration boundary

The organization and naming migration defined by ADR-0111 is structural and behavior-preserving.
Preserve flags, environment variables, defaults, output directories, artifact names, exit codes, and
runtime behavior. Mechanical import and path fixes are in scope; module decomposition, reusable
performance components, new mobile wrappers, and output renames are deferred until paths stabilize.
Historical and dated records keep the paths that were true when they were written.
