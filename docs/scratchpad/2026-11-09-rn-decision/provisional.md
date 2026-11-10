# Provisional recommendation (2026-11-10, ~T+4.5 h; updated ~T+8.5 h)

**Verdict: keep shipping (SvelteKit + Capacitor) for now. Confidence: about 75%.** It was 60% when
Claude and Codex first reached it independently. It rose to 65–70% after shipping's multi-finger
result and the pricing of RN's known repairs. It rose to 75% after the Galaxy brushes lane found
four more RN-only defects and none in shipping (below). The number is judgement, not a measured
probability.

The breadth pass found **no clear RN advantage** for users on any platform. That is not the same as
proving the arms equal: the most heavily weighted measurement, iPad drawing under real touch, is
still unknown. Under the campaign's rule RN has to show a user win to pay for its extra upkeep, and
it has not shown one yet. Day 1's strongest pro-RN signal, shipping losing multi-finger ink on the
iPad, turned out to be mostly an artefact of scripted touch on the simulator. With real fingers,
what is left is cosmetic, and a 10-line fix removes it.

The Galaxy brushes lane (T+8.5 h) tied on dense Crayon and Magic, and it showed the jank counter
does catch a known stall, so the Galaxy smoothness tie stands. Every new user-visible difference it
found is an RN defect, and three of the four lose ink or taps. Two of them run through code the iPad
shares.

This is a judgement about the frozen candidates (RN `427756f14`, shipping `ef3d1eb20`). Repairs that
fix tests validate are reported separately and are never credited as measured quality. Lane notes in
this folder carry the methods, devices and raw evidence paths.

## Scorecard (user-facing quality; weight iPad > Galaxy > web)

| Axis                    | iPad                                                                                          | Galaxy                                                                                                                                                                                                   | Web                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Drawing smoothness      | **unknown**: the fair pair needs scripted touch on the real iPad (owner case 1)               | tie on Pen, dense Crayon and Magic (janky frames within 0.4 pt; the counter catches a known stall); dense picture favours RN, not pre-registered                                                         | tie (60 fps both)                                                                      |
| First stroke and launch | RN: first stroke stalls 105–163 ms in 4 of 7 cold launches; shipping unmeasured on the device | RN draws nothing for a stroke 0.3 s after closing Settings (5 of 5); otherwise tie, RN's first dot 25–40 ms later; shipping shows controls ~150 ms sooner                                                | lean RN: first ink 2.55 vs 3.00 s, LCP 1.05 vs ~1.7 s (short of the 1 s clear-win bar) |
| Core journeys           | mostly equal; the majors on each side are conditional (simulator only)                        | 22 checks equal; RN fails Clear or drops the next stroke right after an Eraser lift (10 of 10 tries), loses strokes after Clear with an opt-in setting, and takes 0.6–0.85 s per Undo on a dense picture | equal smoke pass                                                                       |
| Memory                  | unmeasured                                                                                    | RN grows 3.9–7.1× shipping's in a 10-min Crayon session (guardrail 2×)                                                                                                                                   | not measured                                                                           |
| Looks                   | parity apart from one shipping layout bug                                                     | parity apart from two minor RN bugs                                                                                                                                                                      | parity (33 pairs pixel-identical)                                                      |
| AI art                  | failure handling identical; a real picture and saving it **unknown** (production is down)     | same                                                                                                                                                                                                     | success and failure paths identical against a fake image model                         |

## Defects that matter

RN breaks both guardrails the campaign set in advance, each in more than one place:

* **Lost contact** (ink that never appears): after Clear with Auto-Save on, after Clear right after
  an Eraser lift, and right after closing Settings.
* **Memory growth** at least twice shipping's: with Undo, and with plain drawing over a long
  session.

RN cannot be accepted until each is repaired or explicitly dispositioned, however a feel check comes
out.

| Defect                                                                                                                                                                                          | Arm      | Severity                                                                                                                                      | Evidence                                                                          | Status                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clear within ~1 s of an Eraser lift fails with "Something went wrong — A picture observation is still settling" (6 of 10), or clears and drops the next stroke (6 of 10); default settings      | RN       | major, **contact-loss guardrail**                                                                                                             | Galaxy, on-device timing; every try hit one or the other; shipping 10 of 10 clean | not priced; Clear and the idle blank-page scan share one image decoder (`src/drawing/inkCoverage.ts`). Shared code, so the iPad very likely has it                                                                                                                                                                                                                                                          |
| A stroke ~0.3 s after closing Settings draws nothing (5 of 5; fine from 0.5 s)                                                                                                                  | RN       | **blocker** by the pre-registered first-stroke rule; the lane calls it major because the window is under 0.5 s (a call made after the result) | Galaxy, on-device timing; shipping 5 of 5 fine                                    | not priced; the paper stays blocked until the closing sheet's exit animation ends. Shared code, iPad very likely                                                                                                                                                                                                                                                                                            |
| Strokes within ~0.8 s after Clear never appear when Auto-Save on Delete is on                                                                                                                   | RN       | major, **contact-loss guardrail**                                                                                                             | Galaxy, on-device timing                                                          | **fix validated**: input stays locked while the picture saves; the fix passed 14 of 14 (+210/−70, 7 files), ~1 day. The first dot still shows 0.5–0.9 s late until the save moves off the JS thread (+1.5–3 days)                                                                                                                                                                                           |
| Memory grows with drawing and Undo: a 10-min Crayon session grows +258 / +478 MB against shipping's +67 (3.9–7.1×), all native heap; Undo alone plateaus at 624–706 MB, ~2.1× shipping's 314 MB | RN       | major, **memory guardrail**                                                                                                                   | Galaxy                                                                            | **Undo part bounded, fix partial**: Skia's GPU cache keeps one texture per Undo step and is never purged, and a Skia canvas isn't freed until garbage collection. The fix (+125/−45, 5 files, plus a one-line native Skia patch) bounds Undo at 412–427 MB but still misses the growth limit. Untested against the drawing growth (+305–313 MB in 5 min of Crayon before any Undo). 1–2 days, plus unpriced |
| Undo on a dense Crayon picture shows 0.6–0.85 s after each tap (shipping 40–60 ms); after 5 min, a brush tap 2 s later is ignored                                                               | RN       | major                                                                                                                                         | Galaxy, 1 run per arm; the jank counter cannot see it                             | not priced                                                                                                                                                                                                                                                                                                                                                                                                  |
| First stroke stalls 105–163 ms after cold launch (drawing sound blocks the main thread)                                                                                                         | RN       | major                                                                                                                                         | real iPad, 4 of 7                                                                 | **fix validated**: launch race confirmed; 4-line fix (+20/−1 with tests) cleared 10 of 10 cold launches outside first-after-install; ~½ day to land. Shipping unmeasured                                                                                                                                                                                                                                    |
| Sound loop wrap stalls drawing 113 ms (2 of 39 wraps); first launch after install stalls the first stroke 81–183 ms                                                                             | RN       | loop wrap: **major** under the pre-registered 100 ms rule; first-after-install: minor, once per install                                       | real iPad                                                                         | found by the audio fix test; the loop wrap needs the robust audio rewrite                                                                                                                                                                                                                                                                                                                                   |
| New ink hidden after a rotation (also after page or theme changes) until a menu opens                                                                                                           | RN       | major                                                                                                                                         | iPad simulator, 2 of 40 under realistic pacing                                    | **fix validated**: RN's compatibility layer for older-style native views loses track of the paper view's children; a one-file fix (+36/−9) passed 0 of 24. ~1 day to land, plus 0.5–1 day for a second view with the same exposure. Real iPad plausible, unchecked                                                                                                                                          |
| Two- and three-finger lines stop early; fast zigzags gain loops                                                                                                                                 | shipping | **cosmetic with real fingers**                                                                                                                | iPad simulator, 7 of 13                                                           | investigated: scripted touch arrives in one burst and WebKit keeps only the last point of each extra finger (a simulator artefact). What is left is shipping never drawing a stroke's last half-segment (5–18 pt with real fingers); a 10-line fix passed 0 cuts in 30 tries                                                                                                                                |
| Custom-colour button half off-screen in landscape on the 12.9"                                                                                                                                  | shipping | major (looks), minor (use)                                                                                                                    | simulator and real iPad                                                           | not priced                                                                                                                                                                                                                                                                                                                                                                                                  |
| Night Mode doesn't recolour ink already drawn; brush and size buttons have no screen-reader names                                                                                               | shipping | minor                                                                                                                                         | Galaxy                                                                            | not priced                                                                                                                                                                                                                                                                                                                                                                                                  |
| SDK 27 build doesn't launch on iPadOS 27 until UIScene is adopted                                                                                                                               | shipping | chore before next iOS release                                                                                                                 | simulator, tested +38-line fix                                                    | priced: ~0.5 day                                                                                                                                                                                                                                                                                                                                                                                            |
| RN's first dot 25–40 ms later than shipping's after a cold launch or Clear (the line catches up by ~200 ms)                                                                                     | RN       | minor                                                                                                                                         | Galaxy, on-device timing                                                          | not priced                                                                                                                                                                                                                                                                                                                                                                                                  |
| RN reaches the AI error card ~5 s later on native; cause unexplained                                                                                                                            | RN       | minor, unverified                                                                                                                             | iPad simulator, Galaxy                                                            | could also delay real pictures                                                                                                                                                                                                                                                                                                                                                                              |

## Known repair work before each arm reaches its own best

Priced items only; the unpriced ones are listed, not counted. Both sides apply the same acceptance
standard: a fix counts only once a gate shows the defect gone.

| Arm      | Item                                               | Estimate                                                                                     |
| -------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| RN       | First-stroke sound stall                           | ~0.5 day (validated), or 1.5–2.5 days for the robust audio rewrite                           |
| RN       | Sound loop-wrap stall (113 ms, 2 of 39 wraps)      | unpriced alone; covered by the robust audio rewrite                                          |
| RN       | Ink hidden after rotation or theme change          | 1–2 days (validated, plus a second view)                                                     |
| RN       | Strokes lost after Clear (Auto-Save on)            | ~1 day (validated), +1.5–3 days for prompt ink                                               |
| RN       | Undo memory growth                                 | 1–2 days with a native Skia patch; still misses the growth limit                             |
| RN       | Clear right after an Eraser lift                   | pricing under way                                                                            |
| RN       | Stroke right after closing Settings                | pricing under way                                                                            |
| RN       | Slow Undo on a dense picture                       | pricing under way                                                                            |
| RN       | Memory growth from drawing alone                   | pricing under way                                                                            |
| RN       | **Priced total**                                   | **~5–8.5 agent-days** (about 6–10.5 with the robust audio rewrite), plus four unpriced items |
| Shipping | UIScene for iPadOS 27                              | ~0.5 day (validated)                                                                         |
| Shipping | Last half-segment of each stroke                   | ~0.25 day (validated)                                                                        |
| Shipping | Duplicate move events (zigzag closing curve)       | ~4 lines, priced not built                                                                   |
| Shipping | Custom-colour button off-screen on 12.9"           | unpriced                                                                                     |
| Shipping | Brush and size buttons have no screen-reader names | unpriced                                                                                     |
| Shipping | Night Mode doesn't recolour ink already drawn      | unpriced                                                                                     |
| Shipping | **Priced subtotal**                                | **~1 agent-day**, plus four unpriced items                                                   |

Shipping's SvelteKit 3 migration and Capacitor 9 are charged under upkeep below, not here.

## Cost to carry

* **Upkeep, next 12 months:** the ranges overlap. RN 6–17 agent-days plus 3–6 owner device sessions.
  Shipping 6–12 agent-days, front-loaded by a SvelteKit 3 migration that is not yet shippable
  (offline breaks) and Capacitor 9, still in beta. RN's smooth patch upgrade (about an agent-hour)
  says nothing about a major SDK step; the one on record took about an agent-day plus a regression
  found on device the next day. The desk review's −2 on upgrade risk narrows to about −1 for RN.
* **App size** and **cutover data loss** are both accepted by the owner.

## Flip risks

Repair cost is compared symmetrically: a shipping defect does not have to be unfixable to count for
RN, only more expensive to fix than RN's equivalent.

Resolved: *the simulator's 55% cuts showed a major real-finger defect.* Scripted touch on the
simulator arrives in one burst, and WebKit keeps only the last point of each extra finger; with
paced input the cuts disappear (0 of 50). Still open: *shipping keeps multi-finger fidelity in the
installed app*. The real-finger evidence is two Safari recordings, not the frozen app, and samples
for extra fingers during a main-thread stall stay unrecoverable even after the tail fix. Owner case
4 checks it.

**Toward RN**

1. **The fair iPad drawing pair under real touch.** One pre-registered route to an RN win: shipping
   freezes for 100 ms or more in at least 4 of 6 dense-Crayon runs, RN never does, and RN cuts lost
   in-contact time by at least half in every pair. Other measured user benefits count too. Even then
   RN carries the repair bill below before it can ship. *Check:* needs owner case 1.

**Toward a firm no-go**

2. **RN's repair bill keeps growing.** Five RN defects are priced at ~5–8.5 agent-days. Four more
   from the Galaxy brushes lane are not priced yet, and both guardrails now break in more than one
   place. A firm no-go follows if those four add several days, or if a repair fails its gate.
   *Check:* the pricing lane now running, and the real-iPad run repeating the two new input-loss
   paths.

Still unknown and able to move either way: native AI success and saving once production is fixed, a
real screen-reader pass on both apps, a low-end device, and store distribution.

## Days 2–4: depth only on these risks

The single most valuable step is one counterbalanced, pixel-witnessed Release/Release experiment on
the real iPad, frozen candidates first:

* cold first strokes with sound on;
* dense Crayon and Magic brush;
* multi-finger and palm contact;
* rotate, Clear and Undo, then draw again.

It needs owner case 1, then runs unattended. The three masked owner feel cases (first stroke, dense
Crayon, palm and multi-finger) go with it. Meanwhile:

* the four new RN defects get priced: a fix test for the two input-loss paths, and a code-read
  estimate for slow Undo and drawing memory;
* an exploratory, unscored block added after the pre-registered ones repeats Clear-after-Eraser and
  Settings-then-draw on the real iPad (first on the simulator);
* validated repairs are measured separately from the frozen comparison.

## Codex's challenges (read-only)

Codex's independent verdict was the same: keep shipping, about 60%. It corrected the first draft,
and every correction is applied above:

* "tie everywhere" turned missing evidence into equality;
* the sound stall is not proven RN-only;
* "no blocker" hid RN's contact-loss and memory guardrail breaches;
* AI parity covered failures only;
* repair cost has to be compared symmetrically.

It added the missing risks listed above and named the real-iPad experiment as the highest-value next
step. No call was contested, so none went to walk-through-decision.

Round 2 (after the four fix tests) kept the verdict and called 65–70% defensible. Its corrections
are applied above: RN's priced repairs add up to ~5–8.5 days, not 4–9; shipping's figure is a priced
subtotal with four unpriced items; the multi-finger question is resolved for the simulator but open
for the installed app; and the 113 ms loop-wrap stall breaks the pre-registered 100 ms rule. Its
seven edits to the real-iPad plan are applied and dry-run. It also listed checks still missing in
either direction. Two remain open: dense drawing with several real fingers during a stall, and RN's
audio after resume. The other two have since run on the Galaxy, long-session Crayon and Magic memory
and Clear right after an Eraser lift, and RN fails both (above). The 75% has not yet been through a
Codex round.

**Caution for every simulator finding:** XCUITest's fast scripted strokes can arrive in bursts. Each
simulator finding needs realistic pacing or real fingers before it counts. RN's rotation bug has
passed that check: it reproduced at ~60 Hz pacing, and its cause is in how native views are mounted,
not in touch input. The multi-finger results did not pass it.

Separate from the decision: **production AI generation is down for everyone** (OpenAI rejects a
request setting). A fix session is proposed for the owner; shipping it needs a main deploy.
