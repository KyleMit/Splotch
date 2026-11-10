# Provisional recommendation (2026-11-10, ~T+4.5 h)

**Verdict: keep shipping (SvelteKit + Capacitor) for now. Confidence: moderate, about 60%.**

User-facing quality is a tie on every platform the breadth pass could measure, and the campaign's
rule sends a tie to shipping, because RN's extra upkeep has to be paid for by a user win. Neither
arm has a blocker. The verdict is weakly held: the most heavily weighted measurement, iPad drawing
under real touch, is still unknown, and the strongest pro-RN signal (shipping losing multi-finger
ink on the iPad) is not yet confirmed on real hardware.

Builds: RN `427756f14`, shipping `ef3d1eb20`, both frozen. Lane notes in this folder carry the
methods, devices and raw evidence paths.

## Scorecard (user-facing quality; weight iPad > Galaxy > web)

| Axis                    | iPad                                                                                  | Galaxy                                                                             | Web                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Drawing smoothness      | **unknown**: the fair pair needs scripted touch on the real iPad (owner case 1)       | tie (janky frames 1.45% RN vs 1.78%); dense picture favours RN, not pre-registered | tie (60 fps both)                                                                      |
| First stroke and launch | RN-only major: first stroke stalls 105–163 ms in 4 of 7 cold launches (drawing sound) | tie; shipping shows controls ~150 ms sooner, RN first ink ~40 ms later             | lean RN: first ink 2.55 vs 3.00 s, LCP 1.05 vs ~1.7 s (short of the 1 s clear-win bar) |
| Core journeys           | mostly equal; one major each way (below)                                              | 22 checks equal; RN-only major behind an opt-in setting                            | equal smoke pass                                                                       |
| Looks                   | parity apart from one shipping layout bug                                             | parity apart from two minor RN bugs                                                | parity (33 pairs pixel-identical)                                                      |
| AI art                  | identical, failures included                                                          | identical                                                                          | identical                                                                              |

## Defects that matter

| Defect                                                                                            | Arm      | Severity                      | Evidence                       | Status                                |
| ------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ------------------------------ | ------------------------------------- |
| First stroke stalls 105–163 ms after cold launch (drawing sound blocks the main thread)           | RN       | major                         | real iPad, 4 of 7              | fix test running                      |
| New ink invisible after a rotation until a menu opens                                             | RN       | major                         | iPad simulator, 4 of 9         | fix test running; real iPad unchecked |
| Two- and three-finger lines stop early; fast zigzags gain loops                                   | shipping | major if real fingers see it  | iPad simulator, 7 of 13        | cause investigation running           |
| Custom-colour button half off-screen in landscape on the 12.9"                                    | shipping | major (looks), minor (use)    | simulator and real iPad        | not priced                            |
| Strokes within ~0.6 s after Clear vanish when Auto-Save on Delete is on                           | RN       | major, opt-in only            | Galaxy, 6 of 6                 | not priced; likely a blocking save    |
| Memory climbs with Undo (413 vs 314 MB)                                                           | RN       | minor                         | Galaxy                         | not priced                            |
| Night Mode doesn't recolour ink already drawn; brush and size buttons have no screen-reader names | shipping | minor                         | Galaxy                         | not priced                            |
| SDK 27 build doesn't launch on iPadOS 27 until UIScene is adopted                                 | shipping | chore before next iOS release | simulator, tested +38-line fix | priced: ~0.5 day                      |

## Cost to carry

* **Upkeep, next 12 months:** the ranges overlap. RN 6–17 agent-days plus 3–6 owner device sessions
  (taking the latest SDK 58 patches took about an agent-hour). Shipping 6–12 agent-days,
  front-loaded by a SvelteKit 3 migration that is not yet shippable (offline breaks) and Capacitor
  9, still in beta. The desk review's −2 on upgrade risk narrows to about −1 for RN.
* **App size** is accepted by the owner. **Cutover data loss** is accepted by the owner.

## Top 3 flip risks

1. **Shipping's multi-finger ink loss is real and built into the WebView.** If iPadOS or WKWebView
   takes the touches and no app-level fix gets them back, shipping has an unfixable user-facing loss
   on the top-weighted platform. Toddlers draw with several fingers. With RN's own iPad bugs fixed,
   that would make RN clearly better on iPad and flip the verdict. *Check:* the shipping
   investigation now running, then real fingers or scripted touch on the real iPad.
2. **The fair iPad drawing pair under real touch.** RN wins it only if shipping freezes for 100 ms
   or more in at least 4 of 6 dense-Crayon runs while RN, with the sound fix, never does, and RN
   cuts lost in-contact time by at least half in every pair. That would flip the verdict. *Check:*
   needs owner case 1 (one minute on the iPad).
3. **RN's iPad bugs are expensive or real-device-only.** If the rotation bug reproduces on the real
   iPad and has no small fix, or the sound stall needs the 1–2-day native audio rewrite, RN's case
   weakens further and the verdict firms to a no-go. *Check:* the two RN fix tests now running.

## What happens next (days 2–4: depth only on these risks)

* The three fix tests and investigations report; each result updates this page.
* Owner packet: case 1 first, then masked A/B feel checks (first stroke, dense Crayon, palm and
  multi-finger) once its cases are curated.
* Codex challenges this recommendation; contested calls go through walk-through-decision in
  autonomous mode.

Separate from the decision: **production AI generation is down for everyone** (OpenAI rejects a
request setting). A fix session is proposed for the owner; shipping it needs a main deploy.
