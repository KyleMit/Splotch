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

## `mode=autonomous` and the criteria file (2026-09-25)

Requested as: tell apart decisions that need making from decisions *the user* needs to make; let the
agent pick its own calls when there is a clear favorite; write the weighing criteria down ahead of
time; and send every agent-made decision to a rival before proceeding. The user's framing: simpler
is better and YAGNI applies, but never shy from the better, cleaner approach just because its main
con is one-time development cost — "let's burn the tokens and do the dev"; code decisions are mostly
the agent's, product and user-facing decisions keep the user's hand on the wheel.

### How the criteria were derived

`criteria.md` was inferred from transcripts, then played back and tuned by the user. Method: every
assistant message in the local Claude transcripts that presented options or a recommendation was
paired with the user's next reply (101 pairs, 36 sessions), plus every `AskUserQuestion` with its
answer (52 questions, 26 sessions), 2026-08-24 to 2026-09-26. Four isolated subagents ledgered them;
Codex transcripts held only rival-agent runs, no user decisions. About 150 real decisions; the user
took the agent's recommendation about 55% of the time.

The load-bearing finding is where the other 45% landed. **Zero overrides** of a code-architecture or
measurement recommendation anchored to an existing ADR, repo rule, spec, or measurement. Overrides
clustered in naming (skill families, role names, a `groom` veto on child-safety grounds, a settings
label taken through six rounds), user-facing behavior (a picker hidden rather than hinted, an
Android Back rule the user wrote), facts only the user had (their commit rate, home network, being
the only admin user), new machinery (a drift guard, a batch limit, permission rungs, a DHCP
reservation — all declined), declaring done or exempting a measurement, and wrong premises. Those
clusters became part A. Part B's ordering comes from the stated tie-breaks — the 2026-08-26 "burn
the tokens" quote, "that's just a crazy high bar", "is 1 the clearly better stat and we are just
apprehensive about cutting over?" — and from the two code overrides (`State` suffix everywhere,
stylelint over a bespoke guard), both of which B2–B4 reproduce.

A 2026-09-24 session is the empirical case for the rival step: the user, handed eight confident
recommendations, ordered a rival per walkthrough instead of ruling, and the rival flipped or
corrected five of them.

### Choices the user made in the playback

| Question                           | Chosen                                                                                                                                                   | Rejected                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Naming line                        | Internal code names are the agent's (B3); names the user talks in are theirs                                                                             | All naming to the user — costs a stop on every identifier                             |
| Rival disagrees                    | One reconciliation round; low stakes proceeds on the handler's pick even split; hold only high stakes with no option both accept                         | Escalate every disagreement — one decision would stall or quarantine an overnight run |
| `ship-issue` / `address-pr-review` | Their "pick the best reversible option" rule is replaced by this mode, but only where the run would otherwise have asked the user ("ask yourself first") | A rival walkthrough for every ambiguity — one Codex run per trivial call              |
| Redirecting effort (A7)            | The user's only when it reaches beyond the unit in hand                                                                                                  | Every sequencing call                                                                 |

The same playback asked that a campaign's morning report lay out each autonomous decision briefly
and why the pick won, which is now in `ship-campaign`'s report.

### Why the boundary still holds

The skill still implements nothing: autonomous mode ends at a locked decision record and the calling
work acts on it. Keeping that line means the skill stays a thinking aid and the side effects stay in
the skills that already own them.

### Open / unvalidated

* **The high/low stakes line is a guess** — "cannot be undone by reverting the unit's own commits,
  or more than about a day to unpick, or other decisions wait on it". Watch the morning reports: a
  low-stakes lock the user reverses is evidence the line is too loose.
* **Criteria drift.** `criteria.md` is a snapshot of one month of decisions. When the user overrides
  an autonomous record, that override is new evidence; fold it into the criteria rather than into
  memory.
* **Rival cost per decision is unmeasured.** Each consult is a fresh rival process; if campaigns
  start spending noticeable time here, the trigger ("would have asked the user") is the knob.
