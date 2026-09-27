# GitHub workflow readers

These commands collect live GitHub facts for the Splotch agent workflows. They use the locally
authenticated `gh` CLI and never mutate GitHub. Run them through the npm catalog:

| Command                                  | Input                                                  | Output                                                                       |
| ---------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `npm run show:pr-state -- <number>`      | PR number, optional `--repo owner/name` and `--json`   | Current head, merge metadata, registered checks, and all review threads      |
| `npm run show:epic-children -- <number>` | Epic number, optional `--repo owner/name` and `--json` | Every nested sub-issue, direct counts by parent, and unique descendant count |

Without `--repo`, `gh repo view` resolves the current checkout's repository. Both commands fail on
authentication errors, malformed API data, or incomplete pagination. The PR reader checks the head
again before reporting, and fails if it moved during collection. Use `npm --silent run` when piping
a command's output into another program so npm's banner is not included.

The PR command reports only **registered** checks. Agents still derive the expected CI set from
workflow definitions and required-check configuration before calling a PR mergeable. The epic
command supplies the child tree; agents still read each child's comments and classify its state.

`tools/github/lib/github-cli.mjs` owns `gh` execution and shared argument validation. Focused tests
live in `tools/github/tests/`; `npm run test:tools` runs them in CI.
