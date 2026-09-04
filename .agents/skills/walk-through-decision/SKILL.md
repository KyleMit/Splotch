---
name: walk-through-decision
description: Walk through a decision in plain language — what is actually being decided, what is at stake, the real options with honest pros and cons, a table of what stays the same and what differs, and one recommended approach. Use when asked to walk through, think through, or talk through a decision, to weigh options or trade-offs, to compare approaches, or when the question is "which of these should I pick?" and the reasoning matters as much as the answer.
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

* **Why it wins** — one or two sentences, tied to what is at stake, not to a tally of bullets.
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

1. **List them all upfront** — numbered, one line each, no detail yet — so the reader can see the
   whole shape before spending attention on any part of it.
2. **Order them by dependency** and say so: "3 only matters if 1 goes the second way."
3. **Then take them one at a time**, full treatment each — stakes, options, table, recommendation —
   and **stop after each one and wait.** The user answers by number.

Do not collapse several decisions into one bundled recommendation. Bundling hides which parts the
user actually agreed with, and it makes the next disagreement about the whole package.

## Anti-patterns

| Do not                                          | Because                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| Present a straw man option                      | It costs the reader trust in every other row of the comparison        |
| End on "it depends" with nothing after it       | That is the question restated, not an answer                          |
| Match the number of pros to cons                | Real options are lopsided; forced balance is a lie about the evidence |
| Assert a cost you did not check                 | It reads identically to one you did, and the reader cannot tell       |
| Lead with the history of how you got here       | Lead with the decision; the reader can ask for the path               |
| Write the table before knowing what is at stake | You end up comparing dimensions that do not matter                    |
| Start implementing the recommended option       | This skill stops at the recommendation                                |
