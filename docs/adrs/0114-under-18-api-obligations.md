# ADR-0114: Serving Under-13 Users Under OpenAI's Under-18 API Guidance

**Status:** Active **Date:** 2026-08

## Context

The move to OpenAI (ADR-0113) was made because Google's Gemini API terms do not grant permission for
under-18 use and OpenAI's do. That is true, but "OpenAI allows it" is not the whole sentence, and
the rest of it turns out to constrain the architecture.

OpenAI publishes
[under-18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)
for developers serving minors. Most of what it asks for, Splotch already does — but one clause is a
precondition rather than a practice:

> You should not use OpenAI services to process any personal data of children under 13 or the
> applicable age of digital consent without first implementing zero data retention in our API.

Splotch's audience is **two-year-olds**. A drawing a child makes is their personal data. So this
clause is not adjacent to us — it is squarely about us.

Zero data retention (ZDR) is **not a request parameter**. It is an account-level control granted to
"eligible customers" after "prior approval by OpenAI and acceptance of additional requirements",
arranged through their sales team. No amount of code in this repo turns it on.

Two other facts matter and are easy to conflate:

* API content is **not** used to train OpenAI's models by default. This is strictly better than the
  free Gemini tier the app previously told parents about.
* API content **is** retained up to 30 days for abuse monitoring, then deleted. ZDR is what removes
  this leg specifically.

## Decision

**Treat ZDR as a required, outstanding business action, and say so rather than implying it is
already true.** `/privacy` states both halves of OpenAI's posture in the same breath — not used for
training, kept 30 days for abuse monitoring — because stating only the flattering half would be the
kind of accurate-but-misleading disclosure that store review exists to catch. The Play
kids-compliance section carries the same instruction.

**Meet the rest of the guidance with what the app already has, and name where each lives** so a
future change can't quietly remove one:

| OpenAI asks for                        | Splotch's answer                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| Age-appropriate content filters        | The safety system instruction + orchestrator refusal path (ADR-0023, ADR-0113) |
| Age-appropriate disclosure             | `/privacy`, written to be skimmed by a parent in 30 seconds                    |
| Reporting and escalation for high risk | The in-app "Report this picture" / "Report this refusal" flow (ADR-0104)       |
| Age assurance where appropriate        | The parental gate in front of the AI action and outbound links (see below)     |

That last row is the weakest of the four and should not be read as more than it is.
`PARENTAL_GATE_FEATURES` covers `aiImage`, `imageReport`, `externalLinks`, `feedback`, and
`parentCenter` — the *action*, not the credential. There is no gate in front of entering a key
(deliberately: gates never sit in front of Settings, ADR-0094), the `?ai_access_token=` invite path
is not gated at all, and web builds default every gate to `never`. It is a speed bump on the action,
not age assurance, and OpenAI's guidance asks for the latter "where required or otherwise
appropriate".

**Set `store: false` on every request.** This is the one retention leg that is ours to control, and
it was initially missed: without it the API keeps the response — the child's drawing and the picture
made from it — for 30 days, readable in the account's logs, and on a BYOK run that is the parent's
own dashboard. It is entirely separate from the abuse-monitoring copy, and nothing in the app reads
a response back later, so there is nothing to trade for it.

**Do not build anything that depends on OpenAI storing the request.** This is the architectural
consequence, and it is the reason this ADR exists rather than a checklist item. The obvious answer
to the latency problem ADR-0113 surfaced is the Responses API's `background: true`, which polls a
response OpenAI holds for us — and which requires `store: true`. ZDR forces `store` to `false`.

So the elegant option is the one that becomes unavailable at exactly the moment the compliance
posture improves. Generation state is therefore held on our side (ADR-0115), which costs more
plumbing and is unaffected by turning ZDR on.

## Consequences

* **+** The privacy disclosure is true today, not true-once-a-sales-conversation-happens.
* **+** The async design survives ZDR being enabled. Had this been discovered after building on
  `background: true`, enabling ZDR would have broken image generation outright, and the pressure
  would have been to delay the compliance control rather than the feature.
* **+** Every under-18 obligation now has a named owner in the codebase, so deleting one is a
  reviewable act rather than an oversight.
* **−** **ZDR is not enabled, and cannot be enabled from this repo.** Until OpenAI grants it, the
  app processes under-13 personal data with a 30-day abuse-monitoring copy on the provider side,
  which is what the guidance asks developers not to do. `store: false` removes the retention leg we
  control; abuse monitoring is not one of them. This is an outstanding action on the account owner,
  not a task in the backlog, and it is the single biggest open item in the migration.
* **−** ZDR is unavailable for some endpoints and models regardless of approval, so eligibility has
  to be confirmed for the specific image path this app uses, not in general.
* **−** The guidance is a third-party document that can change. It is worth re-reading whenever the
  provider or the audience changes, and the age floor here (2+) leaves no margin.
