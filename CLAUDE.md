# Splotch – Claude Instructions

## Project docs

The `docs/` folder is the source of truth for design decisions and ongoing work. Consult these files before proposing architecture changes or answering questions about the codebase:

| File | When to read it |
|------|----------------|
| `docs/ARCHITECTURE.md` | Anytime you need the full tech stack, source map, or UI element hierarchy |
| `docs/adrs/README.md` | Before making or discussing any architectural decision — check if it's already documented |
| `docs/TESTING.md` | Before writing, running, or modifying tests |
| `docs/MOBILE.md` | Before touching anything Android/iOS/Capacitor related |
| `docs/BACKLOG.md` | When asked what to work on next |
| `docs/TODO.md` | When using `/fix-next-todo` or `/review-todos` |

If you discover that a doc is out of date while working, update it as part of the same task — don't leave it stale.

## Architectural Decision Records

`docs/adrs/` is the home for architectural decisions. Follow these rules every session:

**Before proposing an architectural approach:** read `docs/adrs/README.md` to check if the decision space is already covered. Reference the relevant ADR number in your response.

**When a significant decision is made or confirmed:** use `/create-adr` to document it. A decision is significant if it chose one approach over real alternatives, has non-obvious consequences, or encodes a constraint a future contributor would want to understand.

**At the end of any session that touched architecture, testing, infrastructure, or build tooling:** briefly consider running `/update-adrs` to catch anything that changed.

ADRs live in the repo and are committed alongside the code they describe. They are not internal memory — they're part of the project.

## Memory vs. ADRs

The auto-memory system (`memory/`) and `docs/adrs/` serve different purposes. Use the right one:

| What it is | Where it goes |
|------------|---------------|
| Architectural/technical decision (chose X over Y, with context) | `docs/adrs/` via `/create-adr` |
| Behavioral feedback (how Claude should work in this project) | `memory/` — `feedback` type |
| User preferences and background | `memory/` — `user` type |
| Temporal project context (active incidents, deadlines, in-flight work) | `memory/` — `project` type |
| Pointers to external systems | `memory/` — `reference` type |

If you find yourself about to write a `project`-type memory about a technical approach or tradeoff, stop and write an ADR instead — it should be committed to the repo, not stored only in Claude's local memory.

## Conventions

- **No comments** unless the WHY is non-obvious. Well-named identifiers are the documentation.
- **TypeScript everywhere.** No plain `.js` source files in `src/`.
- **Svelte 5 runes only.** No legacy stores (`writable`, `readable`, `derived` from `svelte/store`).
- All npm scripts use `cross-env` for env vars so they work on Windows `cmd.exe`.
- The `CAPACITOR=true` env var at build time is the single signal for all web-vs-native branching. Do not add runtime platform branches that could be build-time branches instead.
