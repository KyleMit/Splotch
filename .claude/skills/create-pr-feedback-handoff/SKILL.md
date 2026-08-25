---
name: create-pr-feedback-handoff
description: Build a copy-paste handoff prompt directing another agent to review every PR this session produced with the leave-pr-review skill — enumerating each PR (a stacked campaign has several), then adding the spots that deserve special attention and an adversarial pass on the overall strategy as extra focus areas layered on top of a full review sweep. Use when asked to create a PR feedback or review handoff, to hand this session's PRs to an independent reviewer, or to prep a second-opinion review prompt.
---

# Create a PR feedback handoff prompt

Package this session's PRs for an independent reviewer: one self-contained prompt the user can paste
into a fresh agent session. The receiving agent reviews with the `leave-pr-review` skill; this
skill's job is to hand it the complete PR inventory, the authoring session's own doubts, and the
ordering rule that keeps those doubts from narrowing the review.

The deliverable is the prompt itself, in a fenced block in the chat reply. It is **not** a
`docs/handoff/` packet — that directory belongs to `create-handoff` and is consumed by
`resume-handoff` to continue in-flight work; a review handoff is consumed by a different agent that
starts from the PRs alone.

## 1. Enumerate the PRs

Every PR this session created or materially changed is in scope — a session running stacked PRs
(`create-stacked-prs`) has several. For each, record from live PR state — copy numbers, URLs, and
branch names from tool output, never from memory: number, URL, title, head branch, base branch, and
a one-line scope.

For a stack, list the chain bottom → top and say so in the prompt: each PR's base is the branch
below it, so the reviewer must diff each PR against **its own base**, never against `main`.
`leave-pr-review`'s setup already records the PR's base OID for exactly this reason, but the prompt
should still call it out — a reviewer who misses it reviews the same change N times.

## 2. Pick the extra focus areas

Two kinds, both drawn from the authoring session's privileged position — you know where this work is
weakest, and the handoff is the place to say so. A handoff that lists only safe areas wastes the
reviewer's independence.

* **Specific attention areas** — the judgment calls that could have gone another way, workarounds
  and hacks, assumptions never verified empirically, the diff you are least confident in, the spot a
  reviewer needs context to even notice. One line each: where, and why it deserves the extra look.
* **An adversarial pass on the overall strategy** — summarize the approach the campaign took (its
  decomposition, sequencing, architecture) in a line, and explicitly invite the reviewer to argue it
  should have been built differently. Line-level review cannot see this; ask for it by name.

## 3. State the ordering rule

The generated prompt must make the sequencing explicit: **full sweep first, extra areas after.** The
focus areas are additive, never exclusive — they must not narrow the review. The reviewer runs a
complete `leave-pr-review` pass over every enumerated PR before driving into the extra areas, so the
authoring session's blind spots still get independent coverage; a prompt that leads with the focus
areas gets a review of only the focus areas.

## The prompt template

Fill this skeleton. Keep skill names bare (the receiving agent may be Claude or Codex), and keep the
prompt self-contained — the reviewer starts with none of this session's context:

```md
Review every PR below in <owner>/<repo> with the leave-pr-review skill. Invoking that skill is your
authorization to post each review as inline comments on its PR.

PRs to review (bottom → top of the stack — diff each against its own base branch, not main):

1. PR #<N> — <title> — <url> — head `<branch>`, base `<branch>` — <one-line scope>
2. …

Do a **full review sweep of every PR first** — nothing below limits that. Then drive into these
extra focus areas:

* <file or area> — <why the authoring session flags it>
* …
* Adversarial pass on the overall strategy: the campaign <one-line approach>. Argue the strongest
  case that it should have been shaped differently, and include that assessment in the review
  summary.

Context you'll need: <how to run and verify, nonstandard setup, anything the reviewer can't infer
from the repo>.
```

Drop the stack framing for a single-PR session; everything else holds. If the user wants the
findings somewhere other than PR comments, say so in the prompt with `leave-pr-review`'s mode
overrides (`mode=chat`, `mode=issues`) instead of the authorization sentence.

## After the review lands

The chain closes on the author's side: the reviewer posts with `leave-pr-review`, and this session
or a successor works the comments with `address-pr-review` — whose stacked-campaign mode sweeps the
whole chain and lands every fix in one feedback PR at the tip.
