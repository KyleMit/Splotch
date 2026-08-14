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

**Meet the rest of the guidance with what the app already has, name where each lives** so a future
change can't quietly remove one, **and say plainly which ones are not met**:

| OpenAI asks for                        | Splotch's answer                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| Age-appropriate content filters        | The safety system instruction + orchestrator refusal path (ADR-0023, ADR-0113) |
| Reporting and escalation for high risk | The in-app "Report this picture" / "Report this refusal" flow (ADR-0104)       |
| Disclosure to the parent               | `/privacy`, written to be skimmed by a parent in 30 seconds                    |
| Age-appropriate disclosure to the user | **Not met.** The user is two. See below                                        |
| Age assurance where appropriate        | The parental gate in front of the AI action and outbound links (see below)     |
| Use the most current flagship model    | **Not met.** The orchestrator is pinned to `gpt-5.1`; see the open items below |

The disclosure rows are two different obligations and were previously answered as one. The guidance
asks for disclosure *to the minor* about the AI tool and its responsible use; `/privacy` is written
for a parent, and no version of it is a disclosure a two-year-old receives. Nor is there an obvious
thing to build: the app has no chat, no text the child reads, and one visual action. What it has
instead is a parental gate in front of that action, which is a disclosure to the person who can
actually understand one. That is a defensible position for this audience, but it is not the row
OpenAI asked for, and recording it as satisfied would have been the kind of paper compliance the
rest of this ADR exists to avoid.

The age-assurance row is the weakest of the ones that are met and should not be read as more than it
is. `PARENTAL_GATE_FEATURES` covers `aiImage`, `imageReport`, `externalLinks`, `feedback`, and
`parentCenter` — the *action*, not the credential. There is no gate in front of entering a key
(deliberately: gates never sit in front of Settings, ADR-0094), the `?ai_access_token=` invite path
is not gated at all, and web builds default every gate to `never`. It is a speed bump on the action,
not age assurance, and OpenAI's guidance asks for the latter "where required or otherwise
appropriate".

**Set `store: false` on every Responses request, production and tooling alike.** This is the one
retention leg that is ours to control, and it was initially missed: without it the API keeps the
response — the child's drawing and the picture made from it — for 30 days, readable in the account's
logs, and on a BYOK run that is the parent's own dashboard. It is entirely separate from the
abuse-monitoring copy, and nothing in the app reads a response back later, so there is nothing to
trade for it. The bake-off harness sets it too: its corpus is synthetic, so it is not the same
privacy question, but "every request" that quietly meant "every production request" is how a second
call site comes to be written without it.

**A retention window is not a deletion promise, and `/privacy` must not describe it as one.**
OpenAI's data-controls policy allows a copy to be kept past 30 days where the law requires it or
where it is reasonably necessary to prevent harm, and an image its classifier flags as potential
CSAM is retained for manual review **even under ZDR**. That last exception is not a footnote for
this app — the input is children's drawings, which is exactly the material the scanner is looking
at. The page states the ordinary window, names the exceptions, and links the policy so a parent can
check rather than take our word for it.

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
* **+** Every under-18 obligation is named here with a disposition — met and owned, or open and why
  — so deleting one is a reviewable act rather than an oversight, and an unmet one is visible rather
  than absent.
* **−** **ZDR is not enabled, and cannot be enabled from this repo.** Until OpenAI grants it, the
  app processes under-13 personal data with a 30-day abuse-monitoring copy on the provider side,
  which is what the guidance asks developers not to do. `store: false` removes the retention leg we
  control; abuse monitoring is not one of them. This is an outstanding action on the account owner,
  not a task in the backlog, and it is the single biggest open item in the migration.
* **−** ZDR is unavailable for some endpoints and models regardless of approval, so eligibility has
  to be confirmed for the specific image path this app uses, not in general.
* **−** **The safety orchestrator is a model behind.** The guidance asks applications serving minors
  to use OpenAI's most current flagship models; `ORCHESTRATOR_MODEL` is `gpt-5.1` and the current
  flagship is `gpt-5.6-sol`. This is deliberately not a slug change: that model is not a wrapper
  around the image tool, it is the thing that decides whether a drawing is refused, and swapping it
  unmeasured trades a documented gap for an undocumented safety one. The disposition is to re-run
  the red-team corpus (ADR-0023) against the current flagship and either adopt it or record the
  measured exception here — tracked as issue 1047, because it costs a paid run and a human looking
  at every result.
* **−** **There is no disclosure the user themselves receives**, and for a two-year-old audience
  there may not be a meaningful one. The parental gate stands in for it. Worth revisiting if the app
  ever gains a surface a child reads, or an older audience.
* **−** The guidance is a third-party document that can change. It is worth re-reading whenever the
  provider or the audience changes, and the age floor here (2+) leaves no margin.
