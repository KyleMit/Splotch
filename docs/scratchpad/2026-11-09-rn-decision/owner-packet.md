# Owner packet: what only your eyes or fingers can judge

At most 10 cases, about 20 minutes. Every app is pre-installed and labelled. Do them in any order;
skip any you don't have time for. Reply with the case number and a word or two each.

Lanes append candidate cases under "Candidates"; the orchestrator curates them into the numbered
list.

## Cases

1. **Do this first, 1 minute: unlock scripted touch on the iPad.** On the iPad: Settings › Developer
   › Enable UI Automation → on (authenticate if asked). This alone unblocks the fair iPad drawing
   comparison, the decision's most heavily weighted measurement. Then tell Claude it's done.

*(the remaining cases are being curated)*

## Candidates

* **(setup) iPad automation.** Settings › Developer › Enable UI Automation on (authenticate if
  asked) so WebDriverAgent works again; then draw a line in `art.splotch.app.baseline.main` (all
  icons say "Splotch"; the orchestrator names which).
* **(perf) iPad first stroke after a cold start, both apps.** Swipe the app away, open it, and as
  soon as the paper shows draw one slow long line; do it 4 times each in `art.splotch.app.dev` then
  `art.splotch.app.baseline.main`. Does the line freeze for a blink early in the first stroke? (RN
  replay froze 0.1–0.16 s in 4 of 7 cold starts; shipping is unmeasured on the iPad.)
* **(web) iPad Safari, both web builds.** Needs an RN branch-preview link from the orchestrator; the
  shipping web is splotch.art. In Safari, scribble fast for ~10 s on each, then open Settings: does
  either lag behind your finger, and do RN's Settings row titles look too light next to shipping's?
* **(ai) After the server's OpenAI `400` is fixed (all AI is down now, both arms).** On the iPad
  make one Magical picture in `art.splotch.app.dev`, then `art.splotch.app.baseline.main`; compare
  the wait and the result card, then Download (2 generations).
