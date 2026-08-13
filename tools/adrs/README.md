# ADR integrity tooling

This capability protects the mechanical identity and index invariants of the architectural decision
records in `docs/adrs/`. It detects conflicts that Git cannot: duplicate numbers on one branch, a
new record taking a number already used by the live base branch, mismatched headings, incomplete or
duplicate index entries, and local ADR links whose label or target is wrong.

## Entry point

| Entry point               | Public command       | Purpose                                                   |
| ------------------------- | -------------------- | --------------------------------------------------------- |
| `check-adr-integrity.mjs` | `npm run check:adrs` | Validate the working tree and compare additions to a base |

Pass `--base=<ref>` to select the comparison ref. The default is `origin/main`. The standalone ADR
Integrity workflow invokes the script directly because it deliberately uses the runner's built-in
Node installation and does not install project dependencies. Its only prerequisites are Node and a
Git checkout containing the requested base ref.

## Inputs and outputs

The checker reads record filenames and first headings from `docs/adrs/`, parses canonical entries
and local links from `docs/adrs/README.md`, and asks Git which records the branch genuinely added.
It writes only diagnostics. In GitHub Actions it also emits workflow-command annotations for the
offending paths and lines; locally it prints the same failures as plain text.

`lib/adr-integrity.mjs` owns the dependency-free parsing, comparison, and diagnostic formatting.
`tests/adr-integrity.test.mjs` covers those pure rules. Keep both compatible with the default Node
version on GitHub's runner unless the workflow is intentionally changed to install Node.

## Failure behavior

An integrity violation exits nonzero. If the base ref cannot be read, the checker warns and narrows
validation to the working tree rather than claiming the cross-branch comparison succeeded. A
four-digit filename that is not lower-kebab-case also warns because it is excluded from the record
set and would otherwise disappear silently.

When a number collides, renumber the later-landed record and update its H1, canonical index entry,
and every reference to that ADR number. Do not hand-edit only the reported link or suppress the base
comparison.

## Maintenance

The index parser intentionally recognizes the two canonical shapes documented in ADR-0095 rather
than implementing general Markdown parsing. Update the parser and its focused cases together if the
index presentation changes. Preserve rename-aware Git comparison so retitling an existing record
does not look like a newly added collision.

Run the focused verification with:

```sh
npm run test:tools -- tools/adrs/tests/adr-integrity.test.mjs
npm run check:adrs
```
