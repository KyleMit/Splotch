---
name: architecture
description: Splotch tech stack, file-by-file source map of web/src/, route table, and the canonical UI element glossary. Use when navigating unfamiliar parts of the codebase, deciding where new code belongs, or needing the proper name of a UI element.
---

# Splotch — Architecture

The reference lives in **`docs/ARCHITECTURE.md`**. Read the section that matches the question rather
than the whole file.

| Section               | Answers                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tech Stack**        | What framework/library handles a concern, and which of the two build targets it applies to                                                   |
| **Source Map**        | What a given `web/src/lib/` module owns, and where new code belongs — one row per module, with the ADR that shaped it                        |
| **`web/src/routes/`** | Every route, whether it is prerendered (SSG) or rendered per request (SSR), and why                                                          |
| **UI Elements**       | The canonical name of a UI element, and the **Layout notes** that open the section — read those before positioning any new on-screen control |

Two things worth knowing before you read:

* **Use the glossary's names.** The UI Elements section is the naming authority for anything the
  child or parent sees on screen. Naming a control something new in code, a commit, or a PR
  fragments the vocabulary.
* **The Source Map is written per module, so read the row before editing the file.** Most rows carry
  the constraint that explains the module's shape — the bundle boundary it protects, the ADR it
  implements, the invariant a refactor would quietly break.

Related: `design` for the token vocabulary and component primitives, `api` for the `/api/*`
contracts, `adrs` for the decision behind a given shape.
