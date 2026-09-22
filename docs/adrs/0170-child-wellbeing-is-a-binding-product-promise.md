# ADR-0170: Child Wellbeing Is a Binding Product Promise

**Status:** Active **Date:** 2026-09

## Context

`docs/QUALITY.md` names **Child Wellbeing** as an axis under Promise, and until this record it was
the one axis backed by nothing: a paragraph extrapolated from decisions already visible in the code,
with "Backed by. Nothing yet." under it. Issue #1437 asked whether that paragraph should be ratified
or rewritten, and the owner's decision was to make the axis a binding product promise — specific
enough to reject a feature, with three things named as non-negotiable: no engagement-extending
mechanics, AI that builds on rather than replaces the child's creation, and motor-development impact
as part of the bar.

Every other axis asks whether the app is built well. This one asks whether the app should be in a
two-year-old's hands at all, and it is the only axis that can veto a change that scores perfectly on
all the others. The product has been making these calls consistently by instinct: a wordless canvas
that paints no text ([ADR-0075](0075-no-web-font-preload-on-drawing-route.md)), no analytics or
telemetry SDK of any kind ([ADR-0060](0060-user-feedback-github-issue-endpoint.md),
[ADR-0073](0073-enforcing-csp-first-party-reporting.md)), no accounts and no purchases (`/privacy`),
every operation that reaches past drawing gated behind an adult
([ADR-0094](0094-settings-surface-operation-level-parental-gates.md)), AI image creation off until a
parent switches it on ([ADR-0127](0127-ai-image-creation-requires-explicit-opt-in.md)), and a
generation prompt measured for how faithfully it keeps the child's own layout
([ADR-0118](0118-composition-anchored-generation-prompt.md)). But an unstated standard stops
nothing: the next feature can quietly cross it, and there is no shared text to appeal to when one
does.

Alternatives considered:

* **Leave it as the paragraph in `docs/QUALITY.md`.** Rejected. A summary line has no room for the
  evidence or the reasoning, and "no engagement loop" is not specific enough to quote against a pull
  request. The paragraph stays, tightened, as the pointer to this record.
* **A checklist in the review skill only.** Rejected as the whole answer. A checklist tells a
  reviewer what to look for but not why, and a rule with no recorded reasoning is relitigated at
  every PR. The review skill gets one line pointing here instead.
* **Adopt an external children's-design code wholesale.** Rejected. The age-appropriate design codes
  regulate data and content, which the Privacy, Content Safety, and Compliance axes already hold.
  None of them says whether a drawing app makes a two-year-old better off, which is the question
  this axis exists to ask.
* **Measure it.** Rejected. Measuring wellbeing means measuring the child — session length, return
  rate, retention — and that instrumentation is exactly what this promise forbids. The axis is
  enforced by review, not by a metric.

## Decision

### The bar

The app asks whether a two-year-old is better off for having used it, not whether they stayed
longer. Better off means three concrete things: they made something that is theirs, their hand and
eye got the practice a crayon on paper would have given them, and the session ended on their terms
with nothing tugging them back. A feature earns its place by making a session better. Making a
session longer, or the next one sooner, is never a reason to build something, and a change that
improves every other axis while worsening this one is declined.

### Session shape

A session ends when the child or the parent ends it. The app has no opinion about when the next one
should happen and no way to ask for it. Concretely, the following mechanics are forbidden:

* Streaks, daily goals, activity calendars, and any count of days or sessions shown to the child.
* Reminders and notifications of any kind. The app requests no notification permission on any
  platform (`android/app/src/main/AndroidManifest.xml` declares only network and legacy storage
  permissions; `web/src` registers no notification API) and never sends a message to a device the
  app is not open on.
* Rewards for returning: unlocks, badges, collectibles, "new today" markers — anything whose state
  depends on how often or how long the app has been opened.
* Timers, countdowns, progress toward a goal, "keep going" nudges, and "one more" prompts. Nothing
  starts the next activity on its own; the canvas waits.
* Reporting engagement to the maker. No analytics, no session events, no usage telemetry (the
  Privacy axis). The one server-side count is the free-picture allowance per installation pseudonym
  ([ADR-0105](0105-server-authoritative-free-ai-grants.md)), kept for cost control, never per child
  and never read back as a usage signal.

What exists today, and why it stays on the right side of the line:

* The install banner ([ADR-0039](0039-pwa-install-prompt-ux.md)) asks the *parent* to put the web
  app on the home screen. It appears once, returns after five and after ten qualifying sessions,
  says "One last reminder", and then never again. Adult-addressed, bounded, and permanently quiet
  afterwards: that shape is the ceiling for any future prompt. A prompt addressed to the child, or
  one without an end, is over the line.
* The session counters (`web/src/lib/state/sessionCounters.svelte.ts`) exist for that banner and for
  the "unseen section" dots in Settings. Both are adult-facing, both saturate at their last
  milestone, and neither leaves the device.
* Sounds and haptics answer the hand in the moment — a stroke, the clear gesture crossing its
  threshold ([ADR-0131](0131-adaptive-clear-feedback.md)). None marks a milestone or a return.
* The confetti in the AI result stage falls while a picture is being made
  (`web/src/lib/components/AiResultStage.svelte`); it is waiting ambiance, not a payoff for coming
  back.

### AI builds on the child's drawing, never replaces it

This is the load-bearing section. What the product does today:

* **The child's drawing is the only input.** There is no text prompt and no blank-canvas generation.
  The prompt (`web/src/lib/ai/prompt.ts`) tells the model to paint directly over the child's
  drawing, keep every shape where and at the size the child drew it, treat scribbled fill as intent,
  and never add objects or characters the child did not draw. ADR-0118 measured that framing against
  prettier alternatives and chose the child's layout over the model's.
* **An adult opens the door.** AI image creation is off until a parent turns it on (ADR-0127), and
  each generation sits behind the grown-up check (ADR-0094).
* **The result sits beside the drawing, never in its place.** The finished picture opens in a dialog
  above the canvas (`AiImageResult.svelte`); the paper underneath is untouched, and no action writes
  the picture onto it. It can be saved to photos or downloaded, and it can be reported. What the
  child made stays what the child made.
* **Waiting does not hold the child.** A still-generating picture minimizes to a polaroid in the
  corner and the canvas stays usable ([ADR-0116](0116-minimize-a-waiting-generation.md),
  [ADR-0117](0117-a-waiting-picture-is-a-polaroid.md)).
* **The magic brush is automation of the same shape.** Color from the coloring page's fill appears
  only where the child's own stroke went ([ADR-0043](0043-magic-brush-color-sheet-reveal.md)).
* **The provider is held to the child's standard**, not the other way round
  ([ADR-0114](0114-under-18-api-obligations.md)).

The rule those facts obey: **AI and automation act on what the child made, where the child made it,
at the parent's say-so, and put the result next to the child's work rather than in its place.** A
future AI feature must take the child's own work as its input, leave the canvas the child's, be off
by default and gated (ADR-0127, ADR-0094), and present its output as a separate, labeled artifact.
It must not generate from nothing or from a text prompt, suggest what to draw, correct or tidy or
"improve" strokes on the canvas as the child draws, put a character or a chat in front of the child,
or produce anything for the child to pass off as their own.

### Motor development is part of the bar

A two-year-old's hand is the user. The app is built for chunky strokes, large targets, no precision
demands, and forgiving gestures, and it stays that way:

* **Chunky strokes.** Five stroke levels from 2 px to 22 px, with the eraser at twice the pen
  because a toddler erasing wants big sweeps, not precision
  (`web/src/lib/state/strokeWidth.svelte.ts`); a crayon that reads and behaves like wax
  ([ADR-0065](0065-crayon-brush-textured-wax.md)).
* **Large targets and no reading.** The canvas chrome is giant wordless buttons; the drawing route
  paints no text at all (ADR-0075). The touch-target floor lives in the `Button` primitive so no
  call site can shrink it.
* **No precision demands.** Clearing is a deliberate drag past a threshold, never a tap
  (`web/src/lib/actions/dragToClear.ts`); multi-finger contact and pinches cannot zoom the app away
  from the child ([ADR-0076](0076-scope-toddler-zoom-lock-element-level.md), the one recorded
  accessibility deduction, taken for exactly this reason); the paper stays put on rotation
  ([ADR-0050](0050-locked-paper-view-on-rotation.md)); a stylus tap that iPadOS would swallow is
  guarded ([ADR-0038](0038-scribble-guard-cancel-stylus-touch-streams.md)).
* **Forgiving.** Twenty steps of undo
  ([ADR-0086](0086-tiled-dirty-region-snapshots-for-frame-bounded-undo.md)); one brush axis, and the
  app never launches into an eraser a child cannot find their way out of
  ([ADR-0067](0067-brush-menu-single-brush-axis.md)).

The rule: a control a two-year-old's hand cannot operate is a control the child does not have. A
feature that needs precision — small targets, double-taps, long-press menus, drag handles, typed
input — is adult-facing and lives in Settings behind the gate, or is not built. And the drawing
stays the child's own hand: no snapping strokes to shapes, no auto-straightening, no "tidying" of
what the hand did beyond rendering it faithfully.

### What we will never build

Stated so that a pull request can be measured against each line:

1. **No mechanic that rewards coming back or staying.** No streaks, daily rewards, unlockables,
   badges, levels, or collections that fill over time.
2. **No notifications or reminders.** No notification permission, no push, no message reaching a
   device while the app is closed.
3. **No nudges addressed to the child.** No timers, countdowns, goals, "keep going", "one more", or
   autoplay of the next activity. An adult-addressed prompt is bounded and ends for good, as the
   install banner does.
4. **No advertising, no purchase presented to the child, no upsell on the canvas.** Paid AI access
   is configured by an adult in Settings (`docs/MOBILE/compliance.md`, "No IAP, no purchase
   steering").
5. **No measurement of the child.** No analytics, session length, return rate, or usage reporting to
   us or to anyone. The per-installation free-picture count (ADR-0105) is the only server-side count
   and stays a cost control.
6. **No AI that draws from nothing, draws for the child, or draws over the child's canvas**, and no
   AI that talks to the child.
7. **No character, voice, or chat that addresses the child or asks the child for anything.** A
   mascot may react to what happened; it does not speak to the child or make requests.
8. **No social surface.** No accounts, no sharing between users, no comments, no gallery of other
   children's work.
9. **No canvas control that needs precision**, per the motor section above.

### How this axis is applied

* **It vetoes.** A change that adds anything on the list above is declined, not iterated toward; a
  change that scores perfectly on every other axis and worsens this one is declined too. The test,
  when in doubt: does this make a session better, or longer and more frequent? If the honest answer
  is the latter, it fails.
* **At issue triage.** A feature request that fails the bar closes as `wont-do` citing this record
  (the flow in `docs/ISSUE-WORKFLOW.md`), so the decision is visible where the request was made.
* **At PR review.** The `leave-pr-review` skill's evidence bullet names this record. A change that
  touches the drawing route's chrome, any prompt shown to the child, notifications or permissions,
  the AI path, or the session counters is checked against the never-build list, and a finding quotes
  the line it breaks.
* **At ADR time.** A future decision that wants an exception amends this record explicitly rather
  than routing around it. The install banner's shape is the documented ceiling for prompts; a third
  adult-addressed prompt reopens that judgement here.

## Consequences

* \+ A reviewer can reject a feature by quoting a line, and the author can see which one.
* \+ The decisions the product had already made by instinct now have a home and a stated reason, so
  they stop being relitigated one feature at a time.
* \+ The AI section turns a measured prompt choice (ADR-0118) and an opt-in default (ADR-0127) into
  a rule that outlives both implementations.
* − Features that are ordinary in a children's app are off the table for good: a daily coloring
  page, streaks, a "time to draw" notification, a prompt library. Each would plausibly raise usage.
  We forgo them.
* − The most-requested shape of AI feature, "draw me a cat" from a text prompt, is excluded by rule,
  not by effort. Parents who want it will not get it here.
* − The axis cannot be measured, only reviewed. No metric will ever say the promise is being kept;
  the review is the whole mechanism.
* − Two adult-facing prompts remain (the install banner, the Settings dots) and are documented here
  as the ceiling. That is a judgement, and a reviewer who reads them as nudges is not wrong to raise
  it; the answer is this record, and the line is that they address the adult and end.
* − The mascot that reacts on error screens sits near line 7. The line is drawn at addressing the
  child: reacting is allowed, speaking to or asking the child is not. A future mascot feature has to
  argue its side of that line here.
