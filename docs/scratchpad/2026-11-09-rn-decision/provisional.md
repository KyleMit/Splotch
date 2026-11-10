# Provisional recommendation (2026-11-10, ~T+4.5 h)

**Verdict: keep shipping (SvelteKit + Capacitor) for now. Confidence: moderate, about 70%** (60%
when Claude and Codex first reached it independently; raised after shipping's multi-finger result
and the pricing of RN's known repairs, below).

The breadth pass found **no clear RN advantage** for users on any platform. That is not the same as
proving the arms equal: the most heavily weighted measurement, iPad drawing under real touch, is
still unknown. Under the campaign's rule RN has to show a user win to pay for its extra upkeep, and
it has not shown one yet. Day 1's strongest pro-RN signal, shipping losing multi-finger ink on the
iPad, turned out to be mostly an artefact of scripted touch on the simulator. With real fingers,
what is left is cosmetic, and a 10-line fix removes it.

This is a judgement about the frozen candidates (RN `427756f14`, shipping `ef3d1eb20`). Repairs that
fix tests validate are reported separately and are never credited as measured quality. Lane notes in
this folder carry the methods, devices and raw evidence paths.

## Scorecard (user-facing quality; weight iPad > Galaxy > web)

| Axis                    | iPad                                                                                          | Galaxy                                                                                           | Web                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Drawing smoothness      | **unknown**: the fair pair needs scripted touch on the real iPad (owner case 1)               | tie (janky frames 1.45% RN vs 1.78%); dense picture favours RN, not pre-registered               | tie (60 fps both)                                                                      |
| First stroke and launch | RN: first stroke stalls 105–163 ms in 4 of 7 cold launches; shipping unmeasured on the device | tie; shipping shows controls ~150 ms sooner, RN first ink ~40 ms later                           | lean RN: first ink 2.55 vs 3.00 s, LCP 1.05 vs ~1.7 s (short of the 1 s clear-win bar) |
| Core journeys           | mostly equal; the majors on each side are conditional (simulator only)                        | 22 checks equal; RN loses strokes after Clear with an opt-in setting, and memory grows with Undo | equal smoke pass                                                                       |
| Looks                   | parity apart from one shipping layout bug                                                     | parity apart from two minor RN bugs                                                              | parity (33 pairs pixel-identical)                                                      |
| AI art                  | failure handling identical; a real picture and saving it **unknown** (production is down)     | same                                                                                             | success and failure paths identical against a fake image model                         |

## Defects that matter

Two RN findings break guardrails the campaign set in advance: lost contact (ink that never appears)
and memory growth at least twice shipping's. RN cannot be accepted until each is repaired or
explicitly dispositioned, however a feel check comes out.

| Defect                                                                                            | Arm      | Severity                                | Evidence                                       | Status                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | -------- | --------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strokes within ~0.8 s after Clear never appear when Auto-Save on Delete is on                     | RN       | major, **contact-loss guardrail**       | Galaxy, on-device timing                       | **fix validated**: input stays locked while the picture saves; the fix passed 14 of 14 (+210/−70, 7 files), ~1 day. The first dot still shows 0.5–0.9 s late until the save moves off the JS thread (+1.5–3 days)                                                                                             |
| Memory grows with Undo: plateaus at 624–706 MB, ~2.1× shipping's 314 MB                           | RN       | major, **memory guardrail**             | Galaxy                                         | **bounded, fix partial**: Skia's GPU cache keeps one texture per Undo step and is never purged, and a Skia canvas isn't freed until garbage collection. The fix (+125/−45, 5 files, plus a one-line native Skia patch) bounds it at 412–427 MB but still misses the growth limit (+128 vs ≤ +72 MB). 1–2 days |
| First stroke stalls 105–163 ms after cold launch (drawing sound blocks the main thread)           | RN       | major                                   | real iPad, 4 of 7                              | **fix validated**: launch race confirmed; 4-line fix (+20/−1 with tests) cleared 10 of 10 cold launches outside first-after-install; ~½ day to land. Shipping unmeasured                                                                                                                                      |
| First launch after install stalls the first stroke 81–183 ms; a sound loop wrap stalls 113 ms     | RN       | minor (once per install; 2 of 39 wraps) | real iPad                                      | found by the fix test; not priced                                                                                                                                                                                                                                                                             |
| New ink hidden after a rotation (also after page or theme changes) until a menu opens             | RN       | major                                   | iPad simulator, 2 of 40 under realistic pacing | **fix validated**: RN's compatibility layer for older-style native views loses track of the paper view's children; a one-file fix (+36/−9) passed 0 of 24. ~1 day to land, plus 0.5–1 day for a second view with the same exposure. Real iPad plausible, unchecked                                            |
| Two- and three-finger lines stop early; fast zigzags gain loops                                   | shipping | **cosmetic with real fingers**          | iPad simulator, 7 of 13                        | investigated: scripted touch arrives in one burst and WebKit keeps only the last point of each extra finger (a simulator artefact). What is left is shipping never drawing a stroke's last half-segment (5–18 pt with real fingers); a 10-line fix passed 0 cuts in 30 tries                                  |
| Custom-colour button half off-screen in landscape on the 12.9"                                    | shipping | major (looks), minor (use)              | simulator and real iPad                        | not priced                                                                                                                                                                                                                                                                                                    |
| Night Mode doesn't recolour ink already drawn; brush and size buttons have no screen-reader names | shipping | minor                                   | Galaxy                                         | not priced                                                                                                                                                                                                                                                                                                    |
| SDK 27 build doesn't launch on iPadOS 27 until UIScene is adopted                                 | shipping | chore before next iOS release           | simulator, tested +38-line fix                 | priced: ~0.5 day                                                                                                                                                                                                                                                                                              |
| RN reaches the AI error card ~5 s later on native; cause unexplained                              | RN       | minor, unverified                       | iPad simulator, Galaxy                         | could also delay real pictures                                                                                                                                                                                                                                                                                |

## Known repair work before each arm reaches its own best

| Arm      | Item                                      | Estimate                                          |
| -------- | ----------------------------------------- | ------------------------------------------------- |
| RN       | First-stroke sound stall                  | ~0.5 day (validated)                              |
| RN       | Ink hidden after rotation or theme change | 1–2 days (validated, plus a second view)          |
| RN       | Strokes lost after Clear (Auto-Save on)   | ~1 day, +1.5–3 days for prompt ink (validated)    |
| RN       | Undo memory growth                        | 1–2 days, including a native Skia patch (partial) |
| RN       | **Total**                                 | **~4–9 agent-days**                               |
| Shipping | UIScene for iPadOS 27                     | ~0.5 day (validated)                              |
| Shipping | Last half-segment of each stroke          | ~0.25 day (validated)                             |
| Shipping | Custom-colour button off-screen on 12.9"  | not priced, likely small                          |
| Shipping | **Total**                                 | **~1 agent-day** plus minor items                 |

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

Retired: *shipping's multi-finger ink loss is real.* The investigation found that scripted touch on
the simulator arrives in one burst, and WebKit keeps only the last point of each extra finger. Real
fingers on iPad Safari showed no bursts and no cancelled touches. What is left (a stroke's last
half-segment never drawn, 5–18 pt) is cosmetic, and a 10-line fix passed 0 cuts in 30 tries.

**Toward RN**

1. **The fair iPad drawing pair under real touch.** One pre-registered route to an RN win: shipping
   freezes for 100 ms or more in at least 4 of 6 dense-Crayon runs, RN never does, and RN cuts lost
   in-contact time by at least half in every pair. Other measured user benefits count too. *Check:*
   needs owner case 1.

**Toward a firm no-go**

2. **RN's own defects are expensive or real.** The rotation bug's cause is known and its fix is
   small (about a day), so what is left is the second view with the same exposure, or the post-Clear
   loss or Undo memory growth resist a repair. *Check:* the rotation fix test now running, plus
   pricing the two guardrail breaches. (The sound stall's fix test passed: about half a day to
   land.)

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

* the two RN guardrail breaches get priced;
* validated repairs are measured separately from the frozen comparison.

## Codex's challenge (round 1, read-only)

Codex's independent verdict was the same: keep shipping, about 60%. It corrected the first draft,
and every correction is applied above:

* "tie everywhere" turned missing evidence into equality;
* the sound stall is not proven RN-only;
* "no blocker" hid RN's contact-loss and memory guardrail breaches;
* AI parity covered failures only;
* repair cost has to be compared symmetrically.

It added the missing risks listed above and named the real-iPad experiment as the highest-value next
step. No call was contested, so none went to walk-through-decision.

**Caution for every simulator finding:** XCUITest's fast scripted strokes can arrive in bursts. Each
simulator finding needs realistic pacing or real fingers before it counts. RN's rotation bug has
passed that check: it reproduced at ~60 Hz pacing, and its cause is in how native views are mounted,
not in touch input. The multi-finger results did not pass it.

Separate from the decision: **production AI generation is down for everyone** (OpenAI rejects a
request setting). A fix session is proposed for the owner; shipping it needs a main deploy.
