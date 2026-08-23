# `docs/scratchpad` — investigation narratives and audit trails

Working material kept on purpose: the notes, evidence, and run output that explain **how** a result
was reached, retained so a later reader can check the reasoning instead of re-deriving it. Flake
hunts, timing probes, API evaluations, profiling captures, overnight triage runs, contact sheets
from a one-off audit.

## Scratchpad vs. scrapbook

The two trees are both committed, and both hold output nobody wants to regenerate. The split is
**audience**, not file type:

|               | [`/scrapbook`](../../scrapbook/README.md)                                 | `docs/scratchpad`                                                                 |
| ------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Holds         | Polished, published artifacts worth consuming on their own                | Raw notes, evidence, and audit trails behind a result                             |
| Read by       | Anyone browsing the project, months later, cold                           | Someone working on the thing the note is about                                    |
| Shape         | A designed entry page in the shared scrapbook chrome, listed on the index | Whatever the investigation produced — Markdown, a one-off HTML sheet, a data file |
| Served        | Live on GitHub Pages, one card per collection                             | Not served; read in the repo or through GitHub's blob view                        |
| Test to apply | "Would someone want to open this rendered, months from now?"              | "Would someone re-litigating this decision want to see the working?"              |

So a profiling run's ranked findings write-up is scratchpad; the cross-platform performance matrix
built from many such runs, laid out against the release gates, is scrapbook. A screenshot triage
sweep is scratchpad; the responsive page inventory it sampled from is scrapbook.

A scratchpad note that grows a real audience — one people link to, return to, and read as a finished
thing — has outgrown this folder. Promote it with `npm run scrapbook:publish`, give it an entry page
in the shared chrome, and register it in the index registry
([`tools/scrapbook/lib/scrapbook-index.mjs`](../../tools/scrapbook/lib/scrapbook-index.mjs)).

## Conventions

* Name a note for its subject and the month or day it covers (`e2e-flake-hunt-2026-08-11.md`), or
  give a multi-file run its own folder (`perf/2026-07-22-draw-profile/`).
* Convert relative dates to absolute — these are read long after the session that wrote them.
* Keep a note when a later ADR depends on its chronology or evidence. When its thresholds or
  provenance go stale, **update the note** rather than treating it as a live plan or silently
  trusting it.
* A tree of **verbatim run output** is kept exactly as the tool wrote it, and its path is listed in
  `.prettierignore` so nothing reformats those bytes. Add the line when you add such a tree.
  Hand-authored files here — a probe harness, a helper script — are maintained source and stay in
  Prettier's scope. Notes are Markdown, which dprint owns like the rest of the repo (ADR-0057).
* A page carried in from somewhere else keeps its look but not its old navigation: repoint or strip
  links that resolved against the tree it came from, or they dead-end from the new location.
* Nothing here is a backlog. A durable TODO is a GitHub issue (`docs/ISSUE-WORKFLOW.md`); a decision
  is an ADR (`docs/adrs/`); a pause-and-resume packet is a handoff (`docs/handoff/`).
