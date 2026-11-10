# Provisional recommendation (2026-11-10, ~T+4.5 h; updated ~T+19.5 h)

**Verdict: keep shipping (SvelteKit + Capacitor) for now. Confidence: about 60–65%** under the
owner's best-bones lens (below). It came down from 65–70% at T+19.5 h, because both of RN's
suspected design floors turned out to be bugs with validated fixes: the memory leak and slow Undo.
No floor has been found on either side beyond the accepted app size, and RN has not yet shown a user
win, so the tie rule still decides it. Not yet through a Codex round. It was 60% when Claude and
Codex first reached it independently, 65–70% after shipping's multi-finger result and the pricing of
RN's known repairs, and 75% once the Galaxy lane's four RN-only defects were counted. The owner then
asked for the app with the best bones: a fixable defect is repair cost, not a verdict. That counts
RN's long bug list for less, so the number comes back down until the floors and the unclear items
are known. The number is judgement, not a measured probability.

**Best-bones lens (owner, 2026-11-10 ~08:45).** Each finding is a floor, fixable (a fix passed its
gate) or unclear. The verdict now turns on:

* the iPad drawing floor (the real-iPad run, under way since 08:34);
* whether RN's memory growth is a leak or a plateau, and whether it can be bounded. This is the top
  priority, because a crash in front of a toddler is the worst outcome. **Answered for the leak
  (T+19 h): a bug, and fixed.** The frozen build leaks in a 32-minute session (peak 926 MB); the
  best fix plateaus (peak 580 MB, well under the smallest supported devices' estimated kill points).
  What remains above shipping is unclear, with three untried fixes (`rn-memory-bones.md`);
* whether RN's Undo can be made fast within the memory budget. **Answered (T+19.5 h): a bug.** Tile
  snapshots take Undo from 621 to 79 ms (p90) within 22.5 MB, byte-identical to a full replay
  (`rn-undo-bones.md`);
* whether RN's lost strokes come from small fixable slips or from the JS-thread design;
* shipping's WebView floors: extra fingers during a main-thread stall, and audio while muted.

The breadth pass found **no clear RN advantage** for users on any platform. That is not the same as
proving the arms equal: the most heavily weighted measurement, iPad drawing under real touch, is
still unknown. Under the campaign's rule RN has to show a user win to pay for its extra upkeep, and
it has not shown one yet. Day 1's strongest pro-RN signal, shipping losing multi-finger ink on the
iPad, turned out to be mostly an artefact of scripted touch on the simulator. With real fingers,
what is left is cosmetic, and a 10-line fix removes it.

The Galaxy brushes lane (T+8.5 h) tied on dense Crayon and Magic, and it showed the jank counter
does catch a known stall, so the Galaxy smoothness tie stands. Every new user-visible difference it
found is an RN defect, and three of the four lose ink or taps. The two lost-ink paths also show on
the iPad simulator, RN only (`ipad-input-loss.md`).

This is a judgement about the frozen candidates (RN `427756f14`, shipping `ef3d1eb20`). Repairs that
fix tests validate are reported separately and are never credited as measured quality. Lane notes in
this folder carry the methods, devices and raw evidence paths.

## Scorecard (user-facing quality; weight iPad > Galaxy > web)

| Axis                    | iPad                                                                                                                                                               | Galaxy                                                                                                                                                                                                            | Web                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Drawing smoothness      | **unknown**: the fair pair needs scripted touch on the real iPad (owner case 1)                                                                                    | tie on Pen, dense Crayon and Magic (janky frames within 0.4 pt; the counter catches a known stall); dense picture favours RN, not pre-registered                                                                  | tie (60 fps both)                                                                      |
| First stroke and launch | RN: first stroke stalls 105–163 ms in 4 of 7 cold launches; shipping unmeasured on the device                                                                      | after a dialog closes RN ignores touch until ~0.3 s, shipping until ~0.24 s (a stroke at 0.3 s: RN 0 of 5, shipping 5 of 5); otherwise tie, RN's first dot 25–40 ms later; shipping shows controls ~150 ms sooner | lean RN: first ink 2.55 vs 3.00 s, LCP 1.05 vs ~1.7 s (short of the 1 s clear-win bar) |
| Core journeys           | mostly equal; on the simulator RN loses a stroke 0.3 s after closing Settings (5 of 5) and fails every Clear right after an Eraser lift (20 of 20), shipping clean | 22 checks equal; RN fails Clear or ignores touch for up to 3.8 s right after an Eraser lift (10 of 10 tries), loses strokes after Clear with an opt-in setting, and takes 0.6–0.85 s per Undo on a dense picture  | equal smoke pass                                                                       |
| Memory                  | unmeasured; estimated best-fix peak ~0.7 GB in 30 min against ~1.35 GB on the smallest supported iPad                                                              | 32-min dense Crayon: frozen RN leaks (peak 926 MB, G +486); RN's best fix plateaus (peak 580, G +160); shipping plateaus (peak 392, G +53). Guardrail 2×: best fix 3.0×                                           | not measured                                                                           |
| Looks                   | parity apart from one shipping layout bug                                                                                                                          | parity apart from two minor RN bugs                                                                                                                                                                               | parity (33 pairs pixel-identical)                                                      |
| AI art                  | failure handling identical; a real picture and saving it **not yet tested** (production AI fixed 2026-11-10 09:17)                                                 | same                                                                                                                                                                                                              | success and failure paths identical against a fake image model                         |

## Defects that matter

RN breaks both guardrails the campaign set in advance, each in more than one place:

* **Lost contact** (ink that never appears): after Clear with Auto-Save on, after Clear right after
  an Eraser lift, and right after closing Settings.
* **Memory growth** at least twice shipping's: with Undo, and with plain drawing over a long
  session.

RN cannot be accepted until each is repaired or explicitly dispositioned, however a feel check comes
out.

| Defect                                                                                                                                                                                                             | Arm      | Severity                                                                                                                                                                                  | Evidence                                                                          | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clear within ~1 s of an Eraser lift fails with "Something went wrong — A picture observation is still settling" (6 of 10), or clears and then ignores touch for 3.0–3.8 s (6 of 10 strokes lost); default settings | RN       | major, **contact-loss guardrail**                                                                                                                                                         | Galaxy, on-device timing; every try hit one or the other; shipping 10 of 10 clean | **fix validated**: Clear waits under the input lock for a slow pixel read-back, and shares one image decoder with the idle blank-page scan. A 2-line fix (Clear with nothing to keep skips the read-back) passed 10 of 10. ~0.5–1 day, or 1–1.5 days keeping shipping's "a blank page records no Clear". iPad simulator: Clear failed 20 of 20 with the same error card, and the paper stayed deaf ≥3 s; shipping clean                                                                                                                                                                                                                     |
| A stroke ~0.3 s after closing Settings or any other dialog draws nothing (5 of 5). Shipping also ignores touch while a dialog leaves, until ~0.24 s; RN's window runs 40–120 ms longer                             | RN       | **blocker** by the letter of the pre-registered first-stroke rule; **minor in practice**, because only the last 40–120 ms of the window is RN-only (both severity calls after the result) | Galaxy, on-device timing; shipping 5 of 5 fine at 0.3 s                           | **fix validated**: the leaving dialog is its own native window and takes every touch until JavaScript dismisses it. A 6-line fix passed 5 of 5 by dropping the close animation (a parity regression); the on-time version is unbuilt. ~0.5–1 day. iPad simulator: lost 5 of 5 at 0.28–0.30 s, fine from 0.46 s; shipping 5 of 5                                                                                                                                                                                                                                                                                                             |
| Strokes within ~0.8 s after Clear never appear when Auto-Save on Delete is on                                                                                                                                      | RN       | major, **contact-loss guardrail**                                                                                                                                                         | Galaxy, on-device timing                                                          | **fix validated**: input stays locked while the picture saves; the fix passed 14 of 14 (+210/−70, 7 files), ~1 day. The first dot still shows 0.5–0.9 s late until the save moves off the JS thread (+1.5–3 days)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Memory grows with drawing and Undo: a 10-min Crayon session grows +258 / +478 MB against shipping's +67 (3.9–7.1×), all native heap; Undo alone plateaus at 624–706 MB, ~2.1× shipping's 314 MB                    | RN       | major, **memory guardrail**                                                                                                                                                               | Galaxy                                                                            | **leak fixed; remainder unclear** (`rn-memory-bones.md`, 32-min runs): frozen RN's floors after each Clear rise 13.5 MB/min, because screen-sized rasters and Skia's GPU cache are freed only by a garbage collection that Android 14+ never triggers in the foreground. The best fix (the guardrails patch plus a GPU-cache purge) holds the floors flat (+0.11 MB/min), peak 926 → 580 MB, no drawing regression. It still fails the 2× gate: G +160 vs ≤107, and memory climbs with one growing picture, set by the height of the Undo replay's peaks. Three untried fixes, ~0.5–0.75 day besides the Undo rewrite. 1.5–2.75 days in all |
| Undo on a dense Crayon picture shows 0.6–0.85 s after each tap (shipping 40–60 ms); after 5 min, a brush tap 2 s later is ignored                                                                                  | RN       | major                                                                                                                                                                                     | Galaxy, 1 run per arm; the jank counter cannot see it                             | **fix validated (bug, not bones)**: tile snapshots, ink model unchanged. On the Galaxy, 24 Undos p50 59.5 / p90 79 ms (frozen 480 / 621 ms); no tap lost after an Undo burst (frozen lost one); 0 differing bytes against a full replay on the device; kept tiles ≤ 22.5 MB. Undo of a Clear still replays on the device (~950 ms), and after any full replay later Undos stay slow until new strokes. ~2–2.5 days with the Clear case                                                                                                                                                                                                      |
| First stroke stalls 105–163 ms after cold launch (drawing sound blocks the main thread)                                                                                                                            | RN       | major                                                                                                                                                                                     | real iPad, 4 of 7                                                                 | **fix validated**: launch race confirmed; 4-line fix (+20/−1 with tests) cleared 10 of 10 cold launches outside first-after-install; ~½ day to land. Shipping unmeasured                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Sound loop wrap stalls drawing 113 ms (2 of 39 wraps); first launch after install stalls the first stroke 81–183 ms                                                                                                | RN       | loop wrap: **major** under the pre-registered 100 ms rule; first-after-install: minor, once per install                                                                                   | real iPad                                                                         | found by the audio fix test; the loop wrap needs the robust audio rewrite                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| New ink hidden after a rotation (also after page or theme changes) until a menu opens                                                                                                                              | RN       | major                                                                                                                                                                                     | iPad simulator, 2 of 40 under realistic pacing                                    | **fix validated**: RN's compatibility layer for older-style native views loses track of the paper view's children; a one-file fix (+36/−9) passed 0 of 24. ~1 day to land, plus 0.5–1 day for a second view with the same exposure. Real iPad plausible, unchecked                                                                                                                                                                                                                                                                                                                                                                          |
| Two- and three-finger lines stop early; fast zigzags gain loops                                                                                                                                                    | shipping | **cosmetic with real fingers**                                                                                                                                                            | iPad simulator, 7 of 13                                                           | investigated: scripted touch arrives in one burst and WebKit keeps only the last point of each extra finger (a simulator artefact). What is left is shipping never drawing a stroke's last half-segment (5–18 pt with real fingers); a 10-line fix passed 0 cuts in 30 tries                                                                                                                                                                                                                                                                                                                                                                |
| Custom-colour button half off-screen in landscape on the 12.9"                                                                                                                                                     | shipping | major (looks), minor (use)                                                                                                                                                                | simulator and real iPad                                                           | not priced                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Night Mode doesn't recolour ink already drawn; brush and size buttons have no screen-reader names                                                                                                                  | shipping | minor                                                                                                                                                                                     | Galaxy                                                                            | not priced                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| SDK 27 build doesn't launch on iPadOS 27 until UIScene is adopted                                                                                                                                                  | shipping | chore before next iOS release                                                                                                                                                             | simulator, tested +38-line fix                                                    | priced: ~0.5 day                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| RN's first dot 25–40 ms later than shipping's after a cold launch or Clear (the line catches up by ~200 ms)                                                                                                        | RN       | minor                                                                                                                                                                                     | Galaxy, on-device timing                                                          | not priced                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| RN reaches the AI error card ~5 s later on native; cause unexplained                                                                                                                                               | RN       | minor, unverified                                                                                                                                                                         | iPad simulator, Galaxy                                                            | could also delay real pictures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Known repair work before each arm reaches its own best

Priced items only; the unpriced ones are listed, not counted. Both sides apply the same acceptance
standard: a fix counts only once a gate shows the defect gone.

| Arm      | Item                                               | Estimate                                                                        |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| RN       | First-stroke sound stall                           | ~0.5 day (validated), or 1.5–2.5 days for the robust audio rewrite              |
| RN       | Sound loop-wrap stall (113 ms, 2 of 39 wraps)      | unpriced alone; covered by the robust audio rewrite                             |
| RN       | Ink hidden after rotation or theme change          | 1–2 days (validated, plus a second view)                                        |
| RN       | Strokes lost after Clear (Auto-Save on)            | ~1 day (validated), +1.5–3 days for prompt ink                                  |
| RN       | Memory leak (pinned rasters, unpurged GPU cache)   | 1–2 days (measured: leak gone; native Skia patch needs ADR-0119 review)         |
| RN       | Clear right after an Eraser lift                   | ~0.5–1 day (validated), or 1–1.5 days keeping shipping's blank-page rule        |
| RN       | Stroke right after closing Settings                | ~0.5–1 day (validated by dropping the close animation; on-time version unbuilt) |
| RN       | Slow Undo on a dense picture                       | 2–2.5 days (validated: tile snapshots)                                          |
| RN       | Memory left after the leak fix (G 3.0× shipping)   | ~0.5–0.75 day for GPU and allocator purges, untried, plus the Undo row          |
| RN       | **Priced total**                                   | **~8.5–14.5 agent-days** (about 9.5–16.5 with the robust audio rewrite)         |
| Shipping | UIScene for iPadOS 27                              | ~0.5 day (validated)                                                            |
| Shipping | Last half-segment of each stroke                   | ~0.25 day (validated)                                                           |
| Shipping | Duplicate move events (zigzag closing curve)       | ~4 lines, priced not built                                                      |
| Shipping | Custom-colour button off-screen on 12.9"           | unpriced                                                                        |
| Shipping | Brush and size buttons have no screen-reader names | unpriced                                                                        |
| Shipping | Night Mode doesn't recolour ink already drawn      | unpriced                                                                        |
| Shipping | **Priced subtotal**                                | **~1 agent-day**, plus four unpriced items                                      |

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

2. **RN's repair bill keeps growing.** RN's priced repairs now come to ~8.5–14.5 agent-days against
   shipping's ~1, and both guardrails break in more than one place. Neither design-level suspect is
   a floor any more: slow Undo is a bug (tile snapshots, validated), and the memory leak is a bug
   whose fix held for 32 minutes, though what remains is still 3× shipping's growth. The three
   lost-ink paths share one trait: RN decides a contact's fate when it lands, so anything still
   holding the paper at that moment (a read-back under the input lock, a dialog window not yet taken
   down) silently eats the stroke. The iPad simulator shows the same two losses, RN only, so they
   are not Android quirks. Their fixes are small, though, so they add to the bill rather than settle
   the call. *Check:* the real-iPad run's block 7 repeats both (exploratory, not scored).

Still unknown and able to move either way: native AI success and saving (production is fixed;
untested in either app), a real screen-reader pass on both apps, a low-end device, and store
distribution.

## Days 2–4: best versions and the unclear items

Running now:

* the real-iPad experiment (frozen candidates, ~4.75 h from 08:34): the iPad drawing floor, plus
  block 7's input-loss repeat;
* RN memory, bones or bug (`rn-memory-bones.md`): **done, verdict unclear.** The leak is a bug and
  the best fix removes it. Whether the rest is bones needs one more run: the best fix plus an Undo
  without the whole-picture replay and two memory purges;
* RN Undo, bones or bug (`rn-undo-bones.md`): **done, bug.** Tile snapshots pass all four
  pre-registered criteria for ~2–2.5 days;
* best versions of both arms (`best-versions.md`): every fix that passed its gate plus the small
  unbuilt ones, on local branches with their own bundle IDs.

Next: RN touch handling under a busy JS thread; shipping's WebView floors on the real iPad after the
run; re-tests of the touched paths on the best versions; the owner's masked feel cases on the best
versions; then Codex round 3 on the reframed verdict.

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

Separate from the decision: **production AI generation was down for everyone** (OpenAI rejected a
request setting). It was fixed on `main` in PR 3223 and has been live since 2026-11-10 09:17
(1.6.2690). Porting the same change to RN's server copy is issue 3224.
