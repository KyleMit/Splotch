# Owner packet: what only your eyes or fingers can judge

At most 10 cases, about 20 minutes. Every app is pre-installed and labelled. Do them in any order;
skip any you don't have time for. Reply with the case number and a word or two each.

Lanes append candidate cases under "Candidates"; the orchestrator curates them into the numbered
list.

## Cases

1. **Do this first, 1 minute: unlock scripted touch on the iPad.** On the iPad: Settings › Developer
   › Enable UI Automation → on (authenticate if asked). This unblocks scripted touch on the real
   iPad for the three checks that decide the iPad verdict: the fair drawing comparison, whether RN's
   invisible-ink-after-rotation bug happens on real hardware, and whether shipping really cuts
   multi-finger lines short. Then tell Claude it's done.

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
* **(visual) iPad ink corners, both apps.** In `art.splotch.app.dev`, then
  `art.splotch.app.baseline.main`, draw a fast, tight zigzag with one finger. Scripted strokes show
  RN rounding sharp corners into waves and shipping keeping them sharp: which follows your finger,
  and does either look wrong?
* **(visual, fold into the web case) Dialog backdrop on web.** While Settings is open in each web
  build: RN blurs the page behind the dialog and shipping only dims it. Masked reviewers split (two
  called RN's blur "smeared/broken", one preferred it). Does either look broken?
* **(ai) After the server's OpenAI `400` is fixed (all AI is down now, both arms).** On the iPad
  make one Magical picture in `art.splotch.app.dev`, then `art.splotch.app.baseline.main`; compare
  the wait and the result card, then Download (2 generations).
* **(journeys-ipad) Rotate, then draw, in RN.** In `art.splotch.app.dev`, rotate the iPad 3–4 times,
  drag the trash to clear, and draw a line after each rotation. Does the line show up straight away?
  (On the simulator RN left new ink invisible until a menu opened in 4 of 9 rotations; shipping 0 of
  8.)
* **(journeys-ipad) Two or three fingers at once, both apps.** Draw 2–3 parallel lines together,
  then a fast scribble, in `art.splotch.app.baseline.main`, then `art.splotch.app.dev`. Do any lines
  stop early, or does an extra loop appear? (Simulator: shipping cut 7/13 lines and looped fast
  zigzags; RN clean.)
* **(journeys-ipad) Sound on/off, both apps.** Draw with Sound on, then off (Settings › Sound), in
  each app: is the drawing sound right, and silent when off? (No log evidence for shipping's Web
  Audio.)
* **(journeys-android) TalkBack on the Galaxy, both apps.** Turn TalkBack on and swipe through the
  canvas controls, then open Brushes, Stroke width and Settings › Sound in each app. Does every
  control get a spoken name, and do switches say on or off? (The accessibility tree shows shipping's
  brush and size options with no name; RN names them all.)
* **(journeys-android) Sound off on the Galaxy, both apps.** Draw with Sound on, then turn it off in
  Settings › Sound and draw again. Is each app silent when off? (RN proven by OS audio players;
  shipping's WebView keeps an audio stream open even while muted.)
* **(journeys-android) Held finger and colour tap on the Galaxy, both apps.** Hold one finger
  drawing, tap Blue with another, keep moving the first finger. Does the line continue, and in which
  colour? (Under injected input both apps stopped the held line at a dot.)
