---
name: walk-through-decision
description: Walk through a decision in plain language — what is actually being decided, what is at stake, the real options with honest pros and cons, a table of what stays the same and what differs, and one recommended approach — tagging each decision as the agent's to make or the user's. `mode=autonomous` makes the agent's own calls instead of asking, each locked after a rival agent reviews it — or, on a low-stakes call when no rival can run, locked and marked unreviewed; a still-split high-stakes call is held for the user. Use when asked to walk through, think through, or talk through a decision, to weigh options or trade-offs, to compare approaches, or when the question is "which of these should I pick?" and the reasoning matters as much as the answer; and with `mode=autonomous` whenever unattended work reaches a question it would otherwise stop to ask the user.
---

# Walk through a decision

Turn a fuzzy "which way should we go?" into a decision the user can actually make: what is being
decided, what it costs to get wrong, the real options side by side, and one recommendation.

Plain language throughout. The reader is smart and busy, not steeped in whatever corner of the
system this happens to touch.

## Boundaries

This skill **explains a decision. It does not act on one.** It writes no files, opens no PRs,
changes no code, and does not implement whatever gets chosen. It ends at the recommendation and the
first step. If the user picks an option and wants it built, or wants it written down, that is a new
request — wait to be asked.

`mode=autonomous` moves who picks, not where the skill stops. It ends at a **locked decision
record** instead of a recommendation; the work that invoked it proceeds on that record. The mode
still implements nothing, and the rival consultation it runs writes nothing to the repo.

## Whose decision is it

Before weighing anything, classify the decision with part A of [criteria.md](criteria.md): **the
user's** (anything a parent or child sees, names the user talks in, facts only the user has,
permissions, declaring done, a wrong question, redirecting effort) or **the agent's** (everything
else — code, internal naming, tooling, process, measurement). Part B of the same file is how to
weigh the options in either mode, and the recommendation in part 6 below cites the rule that decided
it.

Tag the decision in its first line — *"Yours to make:"* or *"Mine to make:"*. The user asked for
exactly this split: which decisions need them and which the agent can own. In the default mode the
tag lets them skim the agent's calls; in `mode=autonomous` it decides what happens next.

## Ground it before you write it

An unverified claim in a pros-and-cons list is worse than a missing one: on the page it looks
exactly like a verified one, and the user cannot tell them apart.

So before listing a single trade-off, go to whatever counts as primary evidence for *this* decision
and check the claims you are about to make. Two rules hold whatever the decision is about:

* **Measure what is cheap to measure.** A number beats an adjective. "This touches 7 components,
  listed below" is a fact and takes one command; "this would touch a lot of components" is a guess
  in a confident tone.
* **Say when you do not know.** Mark an estimate as an estimate, inline, in the sentence that makes
  the claim — not in a caveat at the bottom that the reader has already stopped reading.

**When the decision is about this codebase**, the repo is the primary evidence and these are not
optional:

* **Read the actual code.** Grep for the call sites, open the files, count what there is to count.
* **Check whether it was already decided.** `docs/adrs/` for architectural decisions and
  `docs/audit-deferred/decisions/` for findings that were triaged rather than fixed. A prior verdict
  is evidence, not a veto — verify its premises still hold and say so either way. If one is stale,
  that is worth surfacing on its own.
* **Reach for the skill that owns the question** — `profiling`, `testing`, `architecture`, `design`
  — when the decision turns on something it covers.

**When it is not** — a naming call, a process change, a product or copy question — the same standard
applies to different evidence: the real constraint, the actual words, the numbers that exist. Do not
run a repo search to look rigorous about a decision the repo has nothing to say about.

## The walkthrough

Six parts, in this order.

### 1. Name the decision

One sentence, at the top: *"You're choosing between A and B for X"* — or, with more on the table,
*"You're picking one of three ways to do X."* If you cannot write that sentence, you do not yet know
what is being decided — ask before going further. If several decisions are tangled together, see
[Several decisions at once](#several-decisions-at-once).

### 2. Say what is at stake — before any options

Two or three sentences the reader can use to size how much attention this deserves.

* **What goes wrong if we pick wrong**, concretely.
* **How hard it is to undo.** Can you change your mind next month, or are you living with it? Say it
  that way, not as "one-way door".
* **What it touches** — files, users, other decisions waiting on this one.
* **What it costs to not decide today.** Sometimes the honest answer is "nothing, and you will know
  more in two weeks" — that is a real finding, not a dodge.

### 3. Find the real options

Two to four. Every one has to be something a reasonable person would actually pick.

* Include **"keep what we have"** whenever it is genuine. It usually is, and it is the option most
  often left off.
* **No straw men.** An option that exists to make another look good wastes the reader's time and
  costs you their trust in the whole comparison.
* **Name the obvious candidate you left out**, and say in one line why it is out — otherwise the
  reader spends the rest of the walkthrough wondering about it.
* Do not invent a third option to look thorough. Two real options is a complete list.

### 4. Show what is the same and what differs

The table. See [The comparison table](#the-comparison-table).

### 5. Pros and cons, per option

Short bullets, concrete, no scoring. Two rules that do the real work:

* State **the strongest argument against the option you are about to recommend.** If you cannot find
  one, you have not looked hard enough, and the reader will find it later without you.
* State **the strongest argument for each option you are not recommending.** Same reason — with
  three or four on the table that means each of them, not just the runner-up.

### 6. Recommend one

See [The recommendation](#the-recommendation).

## The comparison table

Options are columns. The things that vary are rows. Build it in two blocks, and put the similarities
**first**:

* **Same either way** — every dimension all the options handle identically. This block is what stops
  the reader from re-litigating something the choice does not actually touch, and it is usually the
  fastest way to shrink a decision that felt big.
* **Where they differ** — one row per dimension that genuinely differs.

|                      | Same either way                   |
| -------------------- | --------------------------------- |
| Where the code lives | `web/src/lib/state/` in both      |
| Test story           | Same Vitest suite, no new harness |
| Rollback             | Revert one commit in both         |

|                            | Option A: extend the store | Option B: new module                    |
| -------------------------- | -------------------------- | --------------------------------------- |
| **Files touched**          | 3                          | 11                                      |
| Work to build              | About half a day           | Two days                                |
| Cost if we are wrong       | Revert one commit          | Unpick 11 files, roughly a day          |
| Startup bundle             | +0 KB                      | +1.4 KB on the boot path                |
| What it makes easier later | Nothing in particular      | Per-folder settings, if that ever lands |

Rules:

* **Put the dimension that decides it first.** The reader should be able to stop after row one.
* **Concrete cell values, not verdicts.** "11 files" beats "more invasive"; "+1.4 KB on the boot
  path" beats a red ✗. A bare ✅/❌ grid tells the reader what you concluded, not what is true.
* **Drop a row that differs trivially.** Nine rows where two matter reads as a tie.
* **Keep cells to a few words.** A cell that needs a paragraph belongs in the pros and cons.

**Skip the table** when two options differ along one axis — a sentence is better, and a two-row
table is a costume for a sentence.

**Offer an artifact** — one line, and only build it if asked — when either holds:

* the decision is **visual** (layout, spacing, a UI arrangement), where mocking both up beats
  describing them; or
* there are **three or more options across many dimensions**, where a chat table stops being
  readable.

## Plain language

* **Spell out jargon the first time**, in the same sentence. "Idempotent — running it twice does the
  same thing as running it once."
* **Concrete consequence beats abstract quality.** "If this is wrong, you rewrite the save path,
  about a day" lands; "less maintainable" does not.
* **Use real numbers where they exist**, and say so plainly when a number is a guess.
* **One idea per sentence.** Short sentences.
* **No hedging stacks.** "This might arguably be somewhat slower" says nothing. Either it is slower,
  or you do not know yet — say which.
* **Do not re-explain what the user just told you.** Start from what they said.

## The recommendation

**One option, named, in the first sentence.** Then:

* **Why it wins** — one or two sentences, tied to what is at stake, not to a tally of bullets. Name
  the [criteria.md](criteria.md) rule that tipped it ("B2: the cost is one-time") when one did.
* **The cost you are accepting** by picking it. Every recommendation has one.
* **What would change your mind** — the specific fact or number that would flip it. This is what
  lets the reader disagree usefully instead of just deferring.
* **The first step** — one concrete thing to do, small enough to start today.

If the answer genuinely depends on something unknown, do not hide behind "it depends". Say what it
depends on, say which way each answer points, and ask that question — that *is* the recommendation.

Never pad the cons on your pick to look even-handed, and never bury the pick in the middle of a
paragraph. The reader should be able to find it without reading twice.

## Several decisions at once

When the ask contains more than one decision:

1. **List them all upfront** — numbered, one line each, tagged yours or mine, no detail yet — so the
   reader can see the whole shape before spending attention on any part of it.
2. **Order them by dependency** and say so: "3 only matters if 1 goes the second way."
3. **Then take them one at a time**, full treatment each — stakes, options, table, recommendation —
   and **stop after each one and wait.** The user answers by number.

Do not collapse several decisions into one bundled recommendation. Bundling hides which parts the
user actually agreed with, and it makes the next disagreement about the whole package.

## `mode=autonomous`

For work that runs without the user present — a campaign, `ship-issue` or `address-pr-review` in
their autonomous modes — or when the user asks the agent to make its own calls.

**The trigger is narrow: use it where you would otherwise have asked the user.** Ask yourself first.
A small ambiguity with an obvious answer, one you were never going to raise, is just decided and
noted by the calling skill; routing it through here buys a rival run it did not need.

**Several decisions** are taken in dependency order without waiting between them: the one-at-a-time
stop in [Several decisions at once](#several-decisions-at-once) is for a user who is answering. A
decision that depends on a parked one is parked with it.

### 1. Classify

Tag the decision with part A of [criteria.md](criteria.md). **The user's decision is never made
here.** Write its full walkthrough anyway, since it is exactly what the user will read, and return
it as a **parked** decision. Carry on with whatever does not depend on it. A unit of work that
cannot move without the answer is blocked, and the calling skill's rule for a blocked unit applies.

### 2. Walk through it in full

The same six parts, the same grounding. The analysis that would help the user reason about the
decision is the analysis the rival needs to check it, so do not abbreviate because nobody is
reading. Then pick, weighing with part B of the criteria, and size the stakes from part 2:

* **High stakes** — the pick cannot be undone by reverting this unit's own commits, a wrong pick
  costs more than about a day to unpick, or other decisions are waiting on it.
* **Low stakes** — everything else. Picking a direction and moving matters more here than being
  certain of it.

A narrow pick is still a pick. With no favorite between two options, take the one B9 prefers and say
it was close.

### 3. Rival review

Every agent-made decision goes to a rival before it is locked. Write a question file, at an absolute
path outside the checkout, holding the full walkthrough, the pick, the stakes call, and this ask:

> Read `.ruler/skills/walk-through-decision/criteria.md`. Check every factual claim in the
> walkthrough against this checkout. Check the classification: is this actually the user's decision
> under part A? Then answer AGREE or DISAGREE with the pick. If DISAGREE, give your pick, the
> criteria rule behind it, and whether you could accept the handler's pick as a second choice.

Launch it through `run-rival-agent` with `--uncommitted --question-file`. The question flag alone
scopes the rival's worktree to committed `main`, which would miss this branch's work, any
uncommitted edit the decision turns on, and a criteria change still in flight. The answer arrives in
the session's `findings.json` `summary`. Read the answer and verify it, as you would a review:

* **The rival reclassifies it as the user's** → park it. Two agents disagreeing about whether the
  user should see something resolves toward the user seeing it.
* **The rival finds a factual error** → correct the walkthrough and re-pick. That counts as the
  reconciliation round below.
* **AGREE** → locked.
* **DISAGREE** → one reconciliation round.

**Reconciliation — one round, then decide.** Weigh the rival's case honestly against the criteria;
conceding is a good outcome, not a loss. Then send a fresh question carrying both positions and your
response, and ask for the rival's final answer: AGREE with your pick now, or name any option both of
you can accept, including either side's second choice.

| After reconciliation                       | Result                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| Agree, or both accept one option           | Locked on that option                                                         |
| Still split, low stakes                    | Locked on the handler's pick; the split is recorded                           |
| Still split, high stakes, no common option | Held for the user, both positions attached; the run continues with other work |

Neither side digs in over direction-picking. The user would rather a low-stakes call be made and
explained than have one decision stall an overnight run or quarantine something that matters.

If the rival cannot run before it has answered, a low-stakes pick is locked and recorded as
**unreviewed**, and a high-stakes one is held. If it answered DISAGREE and then cannot run for the
reconciliation question, treat the first answer as final: a low-stakes pick locks as **split,
reconciliation unavailable** with the rival's position kept, and a high-stakes one is held.

### 4. The decision record

Return one per decision, to be carried into the PR body and the final report by the calling skill,
and into a campaign's morning report:

* The question, tagged, and the options in one line each.
* The pick, and why it wins, citing the criteria rule.
* The rival outcome: agreed, converged after reconciliation, split (low stakes), split with
  reconciliation unavailable, or unreviewed — with the rival's position whenever it gave one.
* How to reverse it.

A parked or held decision returns its full walkthrough instead, ready for the user to answer by
number.

## Anti-patterns

| Do not                                          | Because                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| Present a straw man option                      | It costs the reader trust in every other row of the comparison        |
| End on "it depends" with nothing after it       | That is the question restated, not an answer                          |
| Match the number of pros to cons                | Real options are lopsided; forced balance is a lie about the evidence |
| Assert a cost you did not check                 | It reads identically to one you did, and the reader cannot tell       |
| Lead with the history of how you got here       | Lead with the decision; the reader can ask for the path               |
| Write the table before knowing what is at stake | You end up comparing dimensions that do not matter                    |
| Decide one of the user's decisions autonomously | Part A of the criteria exists because those were the overrides        |
| Send an obvious call through the rival          | The trigger is "I would have asked the user", not every choice        |
| Defend your first pick through reconciliation   | The goal is the better option, not the handler's                      |
| Start implementing the recommended option       | This skill stops at the recommendation                                |
