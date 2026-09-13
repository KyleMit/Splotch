# ADR-0094: Brand the Utility Surface as Settings and Gate Sensitive Operations Individually

**Status:** Active **Date:** 2026-08

## Context

The app's corner utility modal is mostly ordinary settings: appearance, sound, saving, drawing
controls, setup help, release notes, feedback, and about information. Its former parent-oriented
name implied that entering the modal itself separated a grown-up from a child. It does not: the
corner button performs no age check or parental challenge, and adding one around the whole modal
would put harmless preferences behind unnecessary friction.

App-store kids policies are narrower. Particular operations, especially external links or purchases,
can require a parental gate. Treating the whole modal as the gate would both misdescribe the current
interaction and make it easy for a future operation to inherit a false assumption that opening the
modal proves adulthood.

Alternatives considered:

* **Keep parent-oriented branding and rely on the inconspicuous corner button.** Rejected: a button
  a child may ignore is a usability choice, not a parental gate.
* **Put one parental challenge in front of the entire modal.** Rejected: appearance, sound, and
  control preferences do not all require gating, and the blanket challenge would penalize every
  settings visit.
* **Rename the modal but continue treating entry as proof of adulthood.** Rejected: this would
  change the label without fixing the unsafe compliance assumption.

## Decision

Brand the corner utility surface as **Settings** throughout the product, accessibility tree, code,
tests, automation, store material, and documentation. The implementation vocabulary is
`SettingsButton`, `SettingsModal`, `settingsModal`, `#settingsButton`, `#settingsModal`, and
`lib/components/settings/`; the button uses the existing `settings.svg` cog.

Opening Settings is **not** a parental gate and must never be used as evidence that the current user
is an adult. Any operation that app-store policy requires to be gated owns its challenge at the
operation boundary, immediately before the sensitive action. This change establishes that boundary
but does not add or remove a challenge for any individual operation.

The responsive section-list and first-open mounting behavior remain the decisions in ADR-0061 and
ADR-0049. The per-operation policy is recorded separately because it governs future links,
purchases, and other compliance-sensitive actions regardless of how Settings is laid out.

## Consequences

* \+ The visible name matches the modal's primary purpose and its cog icon follows the platform
  convention for settings.
* \+ Harmless preferences remain directly reachable without an unnecessary parental challenge.
* \+ Compliance-sensitive actions cannot accidentally rely on modal entry as a substitute for an
  explicit gate.
* − Each sensitive operation must identify, implement, and test its own parental-gate requirement;
  there is no blanket wrapper that covers future additions automatically.
* − Store-review checklists must audit actions inside Settings individually rather than describing
  the modal itself as protected.

## Amendment (2026-08): Parent Center policies

The gate frequency is now an explicit per-feature policy rather than one remember choice shown
inside every challenge. Settings includes a **Parent Center** section with an independent frequency
control for:

* generating an AI image;
* reporting an AI picture;
* viewing external links;
* sending feedback;
* opening Parent Center itself.

Every feature can use Every time, Per session, or Never on web and Android. Native iOS keeps Never
visible for external links but unavailable: App Store Review Guideline 1.3 requires Kids Category
link-outs to stay behind a parental gate. Activating that unavailable choice expands an inline
explanation instead of changing the policy. The default remains Every time for every feature (kept
by the store builds, superseded for the web build by the 2026-08-11 amendment below).

Opening Settings remains ungated. Opening Parent Center is a protected operation at that section's
boundary and defaults to Every time; after an adult changes its own policy, future opens follow the
selected mode just like the other three features. The section is the only policy editor, so the old
Buttons toggle and the challenge modal's inline remember choice are removed.

The selections persist through `storage.ts`. A Per session solve is recorded independently for that
feature in memory and resets when the app reloads; Never bypasses only that feature. Every protected
operation calls `requireParentalGate(feature, …)` at its action boundary. External links request an
immediate handoff after the solve because delaying the replay would lose the trusted tap's browser
user activation and trigger popup blocking.

Alternatives considered:

* **One global frequency for every protected action.** Rejected: a family may be comfortable
  generating repeatedly in one session while still requiring every external link or feedback send to
  be checked.
* **Keep the frequency choices inside the challenge.** Rejected: that exposes policy changes at
  every protected action and gives no overview of which behavior applies where.
* **Always force Parent Center even when its row says Per session or Never.** Rejected: the row
  would be a control that does not control the operation it names. The safe default is Every time;
  relaxing it is an explicit choice made from behind the gate.
* **Disable Never for external links on every platform.** Rejected: the Kids Category constraint is
  specific to the iOS distribution; applying it to web and Android would remove a permissible parent
  choice without a policy reason.
* **Hide Never on iOS.** Rejected: keeping the shared table structure stable and explaining the
  unavailable choice makes the platform difference visible instead of silently omitting it.

Consequences:

* \+ Each sensitive action has an independently reviewable and testable policy.
* \+ Parents can see and change the complete protection model in one gated section.
* \+ Feedback submission is protected before any report payload leaves the device.
* \+ Native iOS external links cannot be permanently exempted from their parental gate.
* \+ Web and Android retain the complete frequency choice where that restriction does not apply.
* − Choosing Never for Parent Center means its policy controls subsequently open without a solve on
  that device; this is intentional, visible, and reversible.
* − Adding another protected operation requires a feature id, persisted policy key, Parent Center
  row, boundary call, and tests.

## Amendment (2026-08-08): bundled informational pages are internal navigation

Opening an informational page bundled with the app is not an `externalLinks` operation. Settings
links directly to `/privacy` and `/changelog` without a parental challenge; both routes are
prerendered into the native package and need no network handoff. The external-link policy continues
to guard URLs that leave Splotch. The distinction is the destination boundary, not the section or
anchor element: internal app content stays directly readable, while an actual link-out keeps its
configured Every time / Per session / Never behavior.

## Amendment (2026-08-11): the store builds arm the gates; the web starts open

The gate exists to satisfy app-store kids policies — App Store Guideline 5.1.4 and the Kids
Category, Google Play Families — and only a store build is bound by them. The web app is distributed
by URL and reviewed by nobody, so it now ships with **every policy defaulting to Never**; the native
build keeps **Every time** for all five. `DEFAULT_PARENTAL_GATE_MODE` in
`state/parentalGate.svelte.ts` reads the build-time `__IS_CAPACITOR__` literal, which ADR-0001 makes
the single web-vs-native signal — not a runtime platform sniff. Every mode stays available in Parent
Center on both, so a web parent turns on exactly the checks they want, one at a time; the iOS
external-links restriction above is unchanged and still overrides the default it would otherwise
take. Persisted choices are untouched by the change, and the legacy pre-Parent-Center AI keys still
migrate — but only when one of them was actually written, rather than defaulting a device that never
had one to Every time.

Alternatives considered:

* **Keep Every time everywhere.** Rejected: on the web the first thing a two-year-old meets is a
  multiplication problem in front of a feature their parent already enabled, to satisfy a review
  process the web build never faces.
* **Default the compliance-shaped features (external links, reporting) on, the rest off.** Rejected:
  the split would be arbitrary off a store requirement — the same URL that leaves Splotch is no more
  dangerous on the web than the AI prompt beside it — and a half-armed default is harder to describe
  than either whole one.
* **Branch on the runtime platform (`getPlatform()`).** Rejected: this is exactly the web-vs-native
  branch ADR-0001 requires to be build-time. The runtime read stays where it is genuinely per
  device: the iOS availability rule.

Consequences:

* \+ A web family meets no challenge until a parent asks for one; the toddler-facing app stays
  toddler-facing.
* \+ The store builds keep the compliant posture reviewers check, with no per-feature exceptions.
* − The default now differs by target, so a parental-gate behavior must be described (and tested)
  per build. The unit suite compiles as native and therefore cannot see the web value; the
  Playwright suite drives the real web bundle and pins it there, and specs state the modes they want
  instead of relying on a default.
* − Web copy that names a default (the privacy policy) has to speak for both builds.

## Amendment (2026-08-11): the challenge says where it is configured

A challenge that appears because of a policy now names where that policy lives. Every gate except
Parent Center's own carries a footer — "Manage these checks in Settings › Parent Center", with the
cog and the section's own icon inline — and activating it is one target, not two links to the same
place.

The footer does not close the challenge and raise a second one over it. Parent Center is itself a
protected operation, so `redirectGateToParentCenter()` **retargets the open card**: same problem,
same keypad, new destination, and the copy switches to name it ("Solve the problem to manage
grown-up checks") while the footer — which would now offer the trip already underway — is dropped.
Where Parent Center is set to Never the handoff is immediate. The solve therefore counts as Parent
Center's own: the landing deep-links into that section, and the wide shell's lock card stands aside
for a landing it can only have arrived at through a solve.

Alternatives considered:

* **Close the gate and open Parent Center's own gate over Settings.** Rejected: two challenges back
  to back for one intent, the second appearing after the first was solved.
* **Grant the trip outright on the first solve.** Rejected: the solve was spent on another
  operation's policy, and Parent Center's own row is what says whether opening it needs a check.
* **Link to Settings and let the parent find the section.** Rejected: nobody tapping that footer
  wants the Settings hub; they want the row that produced the challenge in front of them.

## Amendment (2026-09-12): the challenge resists random tapping

A product audit showed the keypad could be passed by tapping at random: the answer auto-submitted
once enough digits were typed, a wrong answer only rolled a new problem, and nothing limited how
many guesses a child got. Random taps at about six a second unlocked the running app in 5 of 7
tries, 10–56 s each. A random two-digit guess is right about one time in a hundred, so the only
lever that keeps the problem adult-easy is the number of guesses a child gets:

* **An explicit check key.** The answer is submitted by the keypad's check key (or Enter), which
  fills the keypad grid's empty twelfth cell, so the portrait card is no taller. On a landscape
  phone the check key sat below the fold, and scrolling to it hid the feedback it produced, so the
  compact landscape card puts the keypad beside the problem instead of under it.
* **Tapping past the answer is a wrong answer.** A digit typed once every dab is filled, or a check
  with dabs still empty, counts as a wrong answer. A grown-up stops when the dabs are full; random
  tapping does not, so most random guesses end as a wrong answer before they become a real attempt.
* **Input is ignored while the card shakes** after a wrong answer.
* **Lockout.** `GATE_WRONG_ANSWERS_BEFORE_LOCKOUT` wrong answers in a row pause the keypad for
  `GATE_LOCKOUT_BASE_MS`, doubling with each further lockout up to `GATE_LOCKOUT_MAX_MS`
  (`state/parentalGateLockout.ts`). The lockout is global rather than per feature and survives
  closing and reopening the card, since closing it is one more random tap away. It is a wall-clock
  deadline held in memory: the card counts the time left down each second, a device that sleeps
  through the pause wakes to find it over, a clock set backwards cannot stretch it past
  `GATE_LOCKOUT_MAX_MS`, and a relaunch clears it.
* **Escalation decays.** A solve resets the streak and the tier, and so does
  `GATE_ESCALATION_QUIET_MS` with no wrong answer and no lockout in force. Without that, a parent
  arriving hours after a child's tapping inherited the child's longest pause, in front of the very
  Parent Center that could relax the policy. The period is longer than the cap, so a child tapping
  without a break never reaches it.
* **Screen readers hear the moments, not the countdown.** The visible line is hidden from assistive
  tech because the countdown rewrites it every second; a separate status region announces a wrong
  answer, a lockout when it starts or when the card reopens into one, and its end. A live region
  stays silent when its text does not change, so a message repeated while it is still showing is
  cleared and set again a moment later.

`parentalGate.mash.test.ts` pins the result with seeded simulated tapping over two-minute runs. Run
against the auto-submitting keypad, the same simulation unlocked it in 1957 of 2000 runs at six taps
a second and 1706 of 2000 at three; the new gate unlocks in 16 and 17 of 2000 (about 0.8%), and the
test fails above 1.5%.

That figure bounds one two-minute window, not a lifetime. Once the pauses reach their cap, a child
who never stops still earns a few guesses every four minutes, so the chance keeps climbing: the same
model at three taps a second measured 16 of 1000 over 10 minutes, 47 of 1500 over 30, and 59 of 1000
over an hour of unbroken tapping (about 1.6%, 3% and 6%). Two minutes is the window the test holds
because it is how long a child plausibly keeps at it; the longer figures are why the cap and the
decay period should not be loosened without re-running them.

Both figures are for random tapping. A child who has learned the card's shape — tap digits until the
dabs are full, then tap the check key — sends a well-formed guess every time, and none of the keypad
rules above touch that: only the lockout budget does. The same simulation measured that child at
three taps a second unlocking in 187 of 2000 two-minute runs (about 9%), which is the one-in-ten the
rejected lockout-alone design gave random tapping. This is a residual risk, not a bound the gate
meets. Closing it means shrinking the budget to about one guess per two minutes, which costs a
grown-up who slips a long wait, or enlarging the answer space, which costs every grown-up more
arithmetic; neither was taken here. `parentalGate.mash.test.ts` pins the measured figure so a change
cannot quietly make it worse.

A grown-up pays one extra tap on a clean answer, and more for a slip: a digit typed past the last
dab or a check before it is complete rolls a new problem and counts toward the lockout, as does a
touchscreen double-registration on the last digit.

Alternatives considered:

* **Lockout alone, keeping auto-submit.** Rejected: each lockout window still hands out every wrong
  answer as a real guess at roughly one-in-85 odds, and the nine a child gets in two minutes add up
  to about one run in ten.
* **Rejecting answers typed implausibly fast.** Rejected: a slow tapper walks under any threshold,
  and a quick grown-up answering 3 × 3 would be told a right answer is wrong.
* **Harder problems (larger operands).** Rejected: the gate should cost a parent a glance, not
  mental arithmetic.
* **One wrong answer re-locks after the first lockout.** Rejected for now: it roughly halves the
  remaining odds, but a parent arriving after a child's tapping would get a single try per wait.

## Amendment (2026-09-13): turning on AI pictures is its own protected operation

Parent Center gains a sixth policy, **Turning on AI pictures** (`aiSetup`), for the AI setup
controls in Settings: switching **Create AI Images**, **Customize AI Style**, or **Auto-Save AI
Images** on, and submitting a key or access code — by Save or by Enter — to be checked. Each runs
through `requireParentalGate('aiSetup', …)` at that control. Switching any of them off, and
forgetting a saved credential, never asks: those only narrow what can leave the device, so a child
can always make Splotch do less. The policy takes the same build-time default as the other five
(Every time in the store builds, Never on the web).

The setup controls were the last data-out operations with no challenge (issue 844). Turning AI
pictures on is where a device first sends something off it for the feature — the free-allowance
check leaves with the installation's one-way code as soon as the switch is on (ADR-0105), before any
drawing does — and submitting a credential sends it to Splotch to verify, then turns the feature on.
ADR-0127 already names the switch as the explicit opt-in; this makes it an adult's opt-in.

Alternatives considered:

* **Share the `aiImage` policy.** Rejected: that row answers how often a child's tap on the AI
  button needs a grown-up, and it is the one families most want to relax to Per session or Never
  once they have chosen AI pictures. Sharing it would unguard the rare consent moment for exactly
  those families, and a parent who switched AI off could not keep a child from switching it back on
  without also re-arming every generation.
* **Share the `parentCenter` policy.** Rejected: Parent Center guards the policies themselves, and a
  family that sets it to Never to stop being asked while adjusting checks has not thereby chosen to
  let a child opt the device into sending data.
* **Record a decision not to gate these controls** (a toddler cannot type a working credential, and
  each generation is already gated). Rejected: the switch sends the installation code on a tap, and
  the auto-save and style options change what a gated generation does without any check.
* **Gate the key field on focus rather than its submission.** Rejected: typing or autofilling the
  field sends nothing; the boundary is the send, and gating focus would challenge a parent before
  they have anything to submit.
* **Gate turning things off as well.** Rejected: it adds friction to the only direction that is
  always safe.

Consequences:

* \+ Every control in Settings that can start or widen a data flow to Splotch's servers or OpenAI
  now owns a challenge at its boundary.
* \+ Families can relax generation without unguarding setup, and the reverse.
* − Store builds ask again at each setup step under Every time: switching AI pictures on and then
  saving a key is two solves. Per session collapses them.
* − Parent Center lists six rows, and the policy vocabulary is one wider for every surface that
  describes it (`/privacy`, the store notes, the compliance ledger).
