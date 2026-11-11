# Can RN put a solid win on the board? (pre-registered 2026-11-11 13:45 EST)

**The owner's stop rule (2026-11-11 ~13:40):** "what would it take for RN to be a win at this point.
Let's see if we can get something solidly in the win column, and if we can't establish it, call it a
fun little experiment that we'll ultimately pass on". This test decides whether the campaign goes
on. Without a solid RN win here, the decision is keep shipping and the campaign closes early.

## Why this test

Every scorecard row is even or leans shipping (`provisional.md`). Neither side has a floor, so the
tie rule decides. More fix tests only change RN's repair bill; they cannot create a win.

One user-facing advantage is still unmeasured. On the iPad RN presents at ~116 fps against
shipping's ~51 (`ipad-experiment.md`). Codex round 4 rules that the frame rate alone earns nothing.
What a child feels is whether the line keeps up with the finger, and the iPad's touch-to-ink latency
was never measured (`ipad-experiment.md`, "What the experiment still cannot measure"). On the
Galaxy, where both apps present at 120 Hz, RN's first dot lands 25–40 ms *later* than shipping's
(`provisional.md`, defects). So an RN latency win is not assumed.

## Builds and setup

Best versions on the iPad:

* RN: `art.splotch.app.dev.best` (`claude/best-rn` @ e703b8b79).
* Shipping: `art.splotch.app.baseline.best` (`claude/best-shipping` @ f9d3b6ff6).

Both are masked as App A and App B, using `owner-packet.md`'s key procedure.

**Amended ~14:00 EST, before any film,** from Codex's check of this plan. The original is in commit
08b0529db. The changes: trail time replaces catch-up as the main measure; each brush gets a reversed
second block; conditions are matched; scoring rules are tighter; and both routes need a clear,
order-repeated preference.

**Conditions:**

* Each clip starts on a cleared page, Purple at Size 3, in portrait.
* Sound is On in both apps; the owner checks Settings › Sound once in each before the first clip.
* The iPad stays as it is now (charger, brightness, display settings untouched). Its refresh
  behaviour is recorded, not forced.

## Part 1: ink lag on film (objective)

**Amendment 2 (~15:05 EST, before any film).** The scorer's validation on synthetic 240 fps clips
showed that trail time, the first main measure, compresses latency. A 25 ms planted difference read
as 10.5–12 ms. Past about 60 ms of latency it stops responding when the finger rests before the
flick (`rn-win/test/results/sensitivity.txt` in the campaign scratch folder). So the 20 ms line
would have needed 30–50 ms of true advantage, not the 20 ms intended. Shift lag replaces it as the
main measure; it recovered the planted 25 ms as 24.99 and 25.04 ms. Trail time is still reported.
The line, blocks, clips and scoring rules are unchanged.

The owner films the iPad with an iPhone in Slo-mo at 240 fps, propped above the drawing area:

* all four screen corners in view;
* exposure and focus locked;
* the same start habit in every clip (rest then flick, or touch and go).

Each clip holds 8 "flick and freeze" strokes, as separate horizontal lines on fresh paper, about 100
mm long, swiped sideways to the finger and starting at least 20 mm from the screen's edges:

1. Swipe fast and straight.
2. Hold the finger dead still for at least 1 s.
3. Lift and move the hand out of view.

There are eight clips, two reversed blocks per brush:

* Pen: A, B, then B, A.
* Crayon: B, A, then A, B.

**Primary measure: shift lag.** While the finger moves fast, how long ago was the finger where the
ink tip is now?

* For each fast frame: the time since the fingertip's trailing edge stood at (ink tip − e), where e
  is that stroke's settled ink end beyond the trailing edge at the hold.
* The contact offset and any shortfall at the ink's end cancel out of it, so it is the
  touch-to-screen lag a child sees while drawing.
* Per stroke: the median over the 10 fastest frames in which both the ink tip and the trailing edge
  are visible.
* Distances are in millimetres, calibrated from the screen's four corners in each clip.
* Both apps' smoothing, and any prediction, count as part of each shipped experience.

**Cross-check: arrival time.** The time from the fingertip stopping to the ink tip reaching its
trailing edge. It also tracks latency one to one.

* The fingertip has stopped at the first frame after which its trailing edge stays within 1 mm for
  the next 10 frames (42 ms).

**Reported only:** trail time (gap ÷ current speed), and peak finger speed per clip, so A and B can
be compared.

**Scoring rules:**

* A stroke is scorable only if the ink tip and the trailing edge are both visible in at least 10
  fast frames.
* Ink that stops short of where the finger stopped, has a gap, or is missing is a **fidelity
  failure**. It is reported and never counts as a fast result.
* A clip needs at least 5 scorable strokes. A brush with a clip below that cannot show a win.
* Per-stroke values are reported, with the scorer's uncertainty.
* Before anything is scored, the first real clip is checked by eye against the scorer's debug
  images.

**Blind analysis:**

* Each clip is cropped to the same drawing area, with no app chrome, and labelled with an opaque id.
  Its brush is known; its app is not.
* An analysis agent scores it. The scores are written and committed before the key is opened.
* A second, independent agent re-scores every stroke flagged ambiguous plus a random quarter of the
  rest. If the two disagree in a way that changes the outcome, the win is not established.

**Line:** RN wins Part 1 if its median shift lag is at least **20 ms** lower than shipping's in
**every block of both brushes** (four comparisons). Arrival time must not favour shipping by 20 ms
or more in any block. 20 ms is more than one full 60 Hz frame, about five camera frames. Shipping
wins by the mirror line. Anything else is a tie.

## Part 2: masked feel (`owner-packet.md` cases 2–4 and 8)

The cases run as written in `owner-packet.md`, with these additions:

* "No difference" is always a valid answer.
* Each answer is recorded before any Part 1 number is shown.
* If case 3 or 4 shows a preference, it is repeated in the other order (B, then A). It counts only
  if it holds, and only a **clear** preference counts toward a solid win. A mild one is reported:
  Codex round 4 sized it at 5–10 points.
* Case 8 runs RN's repaired Save (`art.splotch.app.dev.export`) if the iOS export spike passes its
  gate (`spike-rn-export-ios.md`). Otherwise it runs RN best, and that is noted.

## What counts as a solid win

Either of:

1. **Latency:** Part 1's line is met **and**, in case 3 (dense Crayon: "does either lag behind your
   finger?"), the owner reports a clear advantage for RN's app that holds after the order is
   swapped.
2. **Feel:** a clear RN preference in case 3 or 4 (dense drawing or multi-finger fidelity) that
   holds after the order is swapped. This is Codex round 4's "clear, repeatable RN advantage".

None of these is solid:

* a latency win the owner cannot feel;
* a mild preference, or one that does not hold after the swap;
* RN doing better in case 2 or 8 alone. Those cases test known bugs that have fixes, not bones.

**If solid:** the verdict moves 20–30 points toward RN (Codex round 4's band), so RN leads at about
55–65%. That is permission to continue, not to ship: the campaign would land RN's ~10–16 agent-day
repair bill (a subtotal) and re-verify before any switch.

**If not:** keep shipping, and the campaign closes early.

**Not measured here:** first-contact responsiveness (the first dot) on the iPad. Cases 2 and 3 cover
it by feel only.

## Results

(filled after the session)
