# Decision criteria

How the user decides, inferred from about 150 of their past decisions and then confirmed and tuned
by them. Two uses: **who** owns a decision (part A), and **how** to weigh the options once it is
yours to weigh (part B). The native handler applies both; the rival agent reviewing an autonomous
decision reads this same file, so both judge against one standard.

## A. Whose decision is it

### The user's — never decided autonomously

1. **Anything a parent or child would see.** New UI, copy, labels, a changed behavior. The user
   chose to hide a picker that could not work, wrote their own Android Back rule, and took six
   rounds on one settings label. **Carve-out:** a typo, an obvious bug, or a small, well-reasoned
   visual nudge (a 1px alignment fix) is an agent call. Adding UI that did not exist is never a
   carve-out.
2. **Names the user will talk in.** Skills, skill families, concepts, roles, anything user-facing.
   Internal code names — identifiers, files, modules — are the agent's, decided by B3.
3. **Anything resting on a fact only the user has.** Who actually uses a feature, their home network
   and threat model, how often they ship, what they saw on the device, what a product behavior is
   *for*. If the recommendation would flip on a fact you cannot check, it is theirs.
4. **Permissions, security posture, standing grants, and money.** Merging a PR that passed rival
   review is already granted and needs no decision.
5. **Declaring work done, or exempting a measurement from a rule** — a budget allowance, a
   reclassified red cell, closing an epic. The user tests these for fairness ("shouldn't every other
   cell get to claim some budget as well?").
6. **When the honest conclusion is that the question is wrong** — a rule treated as fixed does not
   fit how the project actually runs, or every option rests on a bad premise. Say so and hand it
   back; do not pick the least-bad option inside a broken frame.
7. **Redirecting effort beyond the unit of work in hand** — trading product work for harness work,
   resequencing a campaign. Ordering within the unit is the agent's.

### The agent's

Everything else, most of all: code structure and refactors, internal naming, test strategy, tooling
and process mechanics, and measurement methodology — especially when an existing ADR, repo rule,
spec, or measurement already points the way. The user has never overridden a recommendation of that
kind that was anchored to one of those.

## B. How to weigh the options

In priority order. An earlier rule beats a later one when they pull apart.

1. **Check before arguing.** No recommendation may rest on an unchecked estimate. When a cheap probe
   can settle the question — try both tunnels, measure the real numbers, count the call sites — run
   it instead of weighing guesses.
2. **Ongoing burden outweighs one-time cost.** In the user's words: "If it just fails on work to
   adopt — no biggie, let's burn the tokens — but if adopting is potentially brittle and requires
   its own set of maintenance, that's the larger barrier." A cleaner result whose main con is a
   one-time development cost wins. The user took a rename with five times the churn for a uniform
   rule, and three hours of analysis over one.
3. **A uniform, mechanically enforceable rule beats case-by-case judgment.** The `State` suffix
   everywhere over "bare noun except where it collides"; skill families over one good name.
4. **The conventional tool beats a bespoke one.** Stylelint over a hand-rolled guard; the platform's
   own Back convention; the first-party path over a custom harness.
5. **Build nothing for a problem that has not happened.** No speculative guards, limits, modes,
   options, or process steps; delete modes nobody uses. Rules 2 and 5 do not conflict: if the need
   is real now, build it properly whatever it costs once; if it is hypothetical, do not build it.
6. **A gate that can never honestly pass is broken.** Tooling must fit how the user actually works.
   At several product merges a day, "exactly current" is a bar nothing meets; "how stale" is useful.
7. **Proportion to the real audience.** A handful of users and one admin; do not harden for
   hypothetical scale. **Child safety is an absolute veto** whatever the data says (a top-ranked
   verb was dropped for its predatory connotation). Parent usability and platform convention come
   before maximal toddler-proofing, with the child's drawing still protected.
8. **Ceremony matches size.** A small, clear fix is a quick PR, no issue. ADRs are for product
   decisions; tooling decisions go in skill notes. Open-ended work becomes a detailed issue an
   independent session can pick up.
9. **When still tied, prefer what can be undone** — and never take an irreversible step on an
   unverified signal (roll forward on a possibly flaky red rather than auto-revert).

## Where agents have misjudged the user

Lean against each of these; every one was an override.

* **Abstract caution about permissions.** Reason from a concrete threat model — what could an
  attacker actually do, and what boundary already stands in the way.
* **Over-building process** — guards, rungs, caps, and record-keeping nobody asked for.
* **Under-scoping** when the extra value is real. A cheaper pick that reads as avoiding the better
  path gets challenged: "is 1 the clearly better stat and we are just apprehensive about cutting
  over?"
* **Treating a repo rule as fixed** when it conflicts with how the project actually runs.
* **Estimates nobody checked**, stated in the same voice as facts.
