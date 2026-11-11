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

Both are masked as App A and App B, using `owner-packet.md`'s key procedure. Each clip starts on a
cleared page with Purple at Size 3 and Sound as found.

## Part 1: ink catch-up on film (objective)

The owner films the iPad with an iPhone in Slo-mo at 240 fps, propped above the drawing area. Each
clip holds 8 "flick and freeze" strokes:

1. Swipe fast and straight across about half the page.
2. Hold the finger dead still for about 1 s.
3. Lift.

There are four counterbalanced clips: Pen A, Pen B, Crayon B, Crayon A.

**Catch-up time**, per stroke: the frame where the ink tip stops advancing, minus the frame where
the fingertip stops moving, at 4.17 ms per frame.

* The fingertip has stopped at the first frame after which it moves under 2 px for 10 consecutive
  frames.
* The ink tip has stopped at the first frame after which it advances under 2 px for 10 consecutive
  frames.
* Both events are in one camera clock, so no synchronization is needed.
* Same rules for both arms.

Secondary, reported only: the trail (fingertip to ink tip) at peak speed, in ms, and any stroke
where either app's ink freezes for 100 ms or more.

**Blind analysis:**

* An analysis agent receives the clips labelled A and B only. The key stays with the orchestrator
  until every number is written down.
* Before unblinding, a stroke is dropped if its fingertip never stops clearly, leaves the frame, or
  is hidden by the hand. Drops are reported.

**Line:** RN wins catch-up if its median is at least **20 ms** lower than shipping's for **both**
Pen and Crayon. 20 ms is more than one full 60 Hz frame, plus margin. Shipping wins by the mirror
line. Anything else is a tie.

## Part 2: masked feel (`owner-packet.md` cases 2–4 and 8)

The cases run as written in `owner-packet.md`, with one addition from Codex round 4. If case 3 or 4
shows a preference, it is repeated in the other order (B, then A), and it counts only if the
preference holds.

## What counts as a solid win

Either of:

1. **Latency:** Part 1's line is met **and**, in case 3 (dense Crayon: "does either lag behind your
   finger?"), the owner names RN's app as keeping up better.
2. **Feel:** a clear RN preference in case 3 or 4 (dense drawing or multi-finger fidelity) that
   holds after the order is swapped. This is Codex round 4's "clear, repeatable RN advantage".

None of these is solid:

* a latency win the owner cannot feel;
* a preference that does not hold after the swap;
* RN doing better in case 2 or 8 alone. Those cases test known bugs that have fixes, not bones.

**If solid:** the verdict moves 20–30 points toward RN (Codex round 4's band), so RN leads. The
campaign then continues, with RN's ~10–16 agent-day repair bill as the cost.

**If not:** keep shipping, and the campaign closes early.

## Results

(filled after the session)
