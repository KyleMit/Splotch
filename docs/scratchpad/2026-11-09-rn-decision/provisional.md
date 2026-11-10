# Provisional recommendation (2026-11-10, ~T+4.5 h)

**Verdict: keep shipping (SvelteKit + Capacitor) for now. Confidence: moderate, about 60%.** Claude
and Codex reached this independently (Codex's challenge is summarized at the end).

The breadth pass found **no clear RN advantage** for users on any platform. That is not the same as
proving the arms equal: the most heavily weighted measurement, iPad drawing under real touch, is
still unknown. Under the campaign's rule RN has to show a user win to pay for its extra upkeep, and
it has not shown one yet. The verdict is weakly held, because the strongest pro-RN signal (shipping
losing multi-finger ink on the iPad) is not yet confirmed on real hardware.

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

| Defect                                                                                            | Arm      | Severity                                | Evidence                       | Status                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------- | -------- | --------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Strokes within ~0.6 s after Clear never appear when Auto-Save on Delete is on                     | RN       | major, **contact-loss guardrail**       | Galaxy, 6 of 6; controls pass  | not priced; likely a save blocking input                                                                                                                                 |
| Memory grows with Undo: 413 vs 314 MB, 3.8× shipping's growth, still rising over cycles           | RN       | major, **memory guardrail**             | Galaxy                         | not priced; not proven unbounded                                                                                                                                         |
| First stroke stalls 105–163 ms after cold launch (drawing sound blocks the main thread)           | RN       | major                                   | real iPad, 4 of 7              | **fix validated**: launch race confirmed; 4-line fix (+20/−1 with tests) cleared 10 of 10 cold launches outside first-after-install; ~½ day to land. Shipping unmeasured |
| First launch after install stalls the first stroke 81–183 ms; a sound loop wrap stalls 113 ms     | RN       | minor (once per install; 2 of 39 wraps) | real iPad                      | found by the fix test; not priced                                                                                                                                        |
| New ink invisible after a rotation until a menu opens                                             | RN       | major if the real iPad sees it          | iPad simulator, 4 of 9         | fix test running                                                                                                                                                         |
| Two- and three-finger lines stop early; fast zigzags gain loops                                   | shipping | major if real fingers see it            | iPad simulator, 7 of 13        | cause investigation running                                                                                                                                              |
| Custom-colour button half off-screen in landscape on the 12.9"                                    | shipping | major (looks), minor (use)              | simulator and real iPad        | not priced                                                                                                                                                               |
| Night Mode doesn't recolour ink already drawn; brush and size buttons have no screen-reader names | shipping | minor                                   | Galaxy                         | not priced                                                                                                                                                               |
| SDK 27 build doesn't launch on iPadOS 27 until UIScene is adopted                                 | shipping | chore before next iOS release           | simulator, tested +38-line fix | priced: ~0.5 day                                                                                                                                                         |
| RN reaches the AI error card ~5 s later on native; cause unexplained                              | RN       | minor, unverified                       | iPad simulator, Galaxy         | could also delay real pictures                                                                                                                                           |

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

**Toward RN**

1. **Shipping's multi-finger ink loss is real.** Toddlers draw with several fingers. If real fingers
   on the real iPad lose ink in shipping and not in RN, and shipping's fix costs more than RN's iPad
   repairs, RN becomes better on the top-weighted platform. *Check:* the shipping investigation now
   running, then the real-iPad experiment.
2. **The fair iPad drawing pair under real touch.** One pre-registered route to an RN win: shipping
   freezes for 100 ms or more in at least 4 of 6 dense-Crayon runs, RN never does, and RN cuts lost
   in-contact time by at least half in every pair. Other measured user benefits count too. *Check:*
   needs owner case 1.

**Toward a firm no-go**

3. **RN's own defects are expensive or real.** The rotation bug reproduces on the real iPad without
   a small fix, or the post-Clear loss or Undo memory growth resist a repair. *Check:* the rotation
   fix test now running, plus pricing the two guardrail breaches. (The sound stall's fix test
   passed: about half a day to land.)

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

* the rotation fix test and the shipping multi-finger investigation report;
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

Separate from the decision: **production AI generation is down for everyone** (OpenAI rejects a
request setting). A fix session is proposed for the owner; shipping it needs a main deploy.
