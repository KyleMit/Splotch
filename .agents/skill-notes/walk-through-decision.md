<!-- Source: .ruler/skill-notes/walk-through-decision.md.template -->

# walk-through-decision — design notes

Created 2026-09-04. Requested as: "walk me through a decision in detail — options, pros and cons,
the recommended approach, simple plain language, and a table of similarities and differences where
it helps."

## The four shaping choices

Each was put to the user as an explicit multiple-choice question before anything was written.

| Choice  | Picked                             | Rejected, and why it was on the list                                                                                                                                                                                           |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name    | `walk-through-decision`            | `weigh-options` (loses the "ends in a recommendation" promise), `decide` (a bare verb reads like the agent decides *for* you, and breaks the repo's verb-noun rule), `frame-decision` (accurate but not a phrase anyone types) |
| Home    | `.ruler/skills/`, both agent trees | Personal `~/.claude/skills/` would make it available in every project, but uncommitted, invisible to Codex, and outside ruler. "Both" was offered and refused as a drift generator                                             |
| Ending  | Conversation only                  | "Recommend, then offer to record it" (hand off to `create-adr`) and "always write a record" were both offered and both declined. The skill is a thinking aid; the user did not want it reaching for the filesystem             |
| Visuals | Chat tables, artifact on request   | "Always build an artifact" is too slow for a two-option call; "chat tables only" gives up the case the user has asked for before — mocking up two layouts to compare them by eye                                               |

## Why the boundary section is first and blunt

"Conversation only" is the choice most likely to erode. A skill that has just recommended an
approach is one step from implementing it, and the ambient pressure in this repo is toward action.
So the constraint is stated as its own section near the top — writes no files, opens no PRs,
implements nothing — and repeated as the last row of the anti-patterns table. Two statements, at
both ends, because a rule stated once in the middle of a runbook is a rule that gets skipped.

## Similarities before differences

Most comparison tables in agent output are differences-only. The "same either way" block was
specifically asked for ("similarities and differences") and turns out to carry more weight than it
looks: it is what shrinks a decision that felt large, and it pre-empts the reader re-arguing a
concern the choice does not touch. Hence the ordering rule — similarities first, not as an appendix.

## Concrete cells over ✅/❌

The ban on bare check/cross grids is deliberate and is the rule most likely to be violated, because
a tick grid *looks* like a decisive comparison. It reports the author's conclusion, not the
underlying fact, so it cannot be checked or disagreed with. "11 files" and "+1.4 KB on the boot
path" can be.

## Multi-decision handling comes from a standing user preference

The "list them all upfront, numbered, then one at a time, wait after each, user answers by number"
protocol is not invented here — it is how the user has repeatedly asked to be given decisions. It
was already in Claude's memory as a behavioral preference; encoding it in the skill makes it
reachable from Codex too, and survives a memory reset.

## Round-1 rival review

The Codex rival agent found three instruction-level contradictions, all confirmed and all fixed:
unconditional grounding on a skill advertised as scope-agnostic (above), two-option phrasing in a
two-to-four-option procedure ("A and B", "both options", "the one you are rejecting"), and a
`weigh → consult` group arrow in `skills-guide` that inverted the repo's read-ADRs-first contract.

The pattern worth remembering: every one was an **internal contradiction between the skill's stated
scope and its own imperatives** — not a wrong claim about the world. Prose skills fail that way. A
self-check for the next skill written here is to read the frontmatter description as a promise and
then audit every imperative in the body against it.

## Open / unvalidated

* **The artifact escalation thresholds are guesses.** "Three or more options across many dimensions"
  and "the decision is visual" are plausible triggers, not measured ones. If in practice the offer
  never fires, or fires on decisions that did not need it, tighten them against real cases.
* **No worked example end to end.** The skill shows a table fragment but not a complete walkthrough.
  That was left out to keep the context cost down; if walkthroughs come back thin or mis-shaped, a
  single full example is the cheapest fix and the first thing to try.
* **Grounding is now scope-conditional, and the split is untested.** The first draft ordered an
  unconditional repo inspection before any trade-off, which the round-1 rival review caught as an
  instruction a naming or process decision cannot follow honestly. Measuring and flagging estimates
  now apply to every decision; the code-and-ADR checks apply when the decision is about this
  codebase. What is unvalidated is whether an agent reliably picks the right branch — the failure to
  watch for is a repo search performed to look rigorous about a decision the repo cannot speak to,
  which is why that sentence is stated outright rather than left implied.
