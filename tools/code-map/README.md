# Code map

Generates the tables in `docs/CODE-MAP.md`: lines of code per area of the repository, per sub-bucket
within each large area, and per functional domain within `web/src`. The prose around the tables is
maintained by hand through the `reconcile-code-map` skill.

## Entry point

```bash
npm run gen:code-map
```

`tools/code-map/gen-code-map.mjs` counts one commit's tree and rewrites the generated blocks of the
map in place, then formats the file with dprint.

| Flag            | Default | Meaning                                                                                                                     |
| --------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `--ref <rev>`   | `HEAD`  | Commit whose tree is counted                                                                                                |
| `--assignments` | off     | Print every tracked path with its area, bucket, subdomain, line count, and `web/src` rule as TSV instead of writing the map |

The generator also warns about any `web/src` domain rule that matched no file, which is how a rename
or deletion shows up.

## Inputs and outputs

* **Input:** the blobs of one commit, listed with `git ls-tree -r` and read with
  `git cat-file --batch`. The working tree is never read, so the same ref always regenerates the
  same tables and a dirty checkout cannot leak into the counts. Commit first, then regenerate from
  that commit.
* **Output:** the four marked blocks of `docs/CODE-MAP.md` — `snapshot`, `coverage`, `totals`, and
  `splits`, each between `<!-- code-map:generated:start NAME -->` and
  `<!-- code-map:generated:end NAME -->`. Everything outside the markers is prose the generator
  never touches. A missing marker fails the run rather than appending a block somewhere.

## Rules

`lib/code-map-rules.mjs` holds every counting decision:

* `EXCLUSION_CLASSES` — ordered; the first class that matches names why a file is left out.
* `AREAS` — disjoint by construction. `classifyPath` throws `UnmappedPathError` for a path no area
  claims, so a new top-level directory has to be given an area (or an exclusion) before the map can
  be generated.
* `WEB_SRC_DOMAIN_RULES` — ordered, first match wins, matched against the file's *subject*: a
  co-located test or test harness classifies as the module it exercises. The last rules are
  directory-wide fallbacks (`lib/components/*` → Core UI controls, `lib/state/*` → App state,
  `lib/*` → Focused utilities, anything else → Routes / app shell), so a new file always lands
  somewhere plausible; `--assignments` shows which rule placed it.
* `DOMAIN_SUBDIVISIONS` — the subdomain rules and definitions for the drawing engine and AI
  generation.

## Tests

`tests/code-map-rules.test.mjs` runs every path `git ls-files` reports through the rules and fails
if one matches no area or more than one. That test fails on a pull request that adds a new top-level
directory, and the fix is a rule, not a regenerated map. The map itself is not drift-checked in CI:
every commit changes some count, so a drift gate would fail nearly every pull request.
`tests/code-map-report.test.mjs` covers the tallies, the rendering, and the block splice. Both run
in `npm run test:tools`.

## Maintenance

Change a rule when the map misplaces something, not to make a number look better. Record the
judgment in the map's Method section when it changes what counts, and in the rules module's comments
when it only changes where something counts.
