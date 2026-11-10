# Owner packet: what only your eyes or fingers can judge

At most 10 cases, about 20 minutes. Every app is already installed. Do case 1 first. Cases 2–4 are
the ones the final verdict needs; if you only have 10 minutes, do 1–4. The rest can be skipped.

## How it works

Tell Claude "packet" when you're free. Claude opens the apps for you as **App A** and **App B** in a
random order and keeps the key, so you judge without knowing which is RN. Every icon says "Splotch",
so don't open them yourself. Reply with the case number and a word or two each.

## Cases

1. **Do this first, about 2 minutes: unlock the iPad experiment.** Settings › Developer › Enable UI
   Automation → on (authenticate if asked). Then Settings › Privacy & Security › Photos: give both
   "Splotch" test apps permission to add photos. The unattended run (~4.5 h) then starts by itself
   and leaves 6 test pictures in Photos.
2. **iPad, first stroke after a cold start (masked).** Claude cold-starts A, then B, 4 times each.
   As soon as the paper shows, draw one slow, long line. Does the line freeze for a blink near its
   start in either app?
3. **iPad, dense Crayon (masked).** Pick Crayon in A, then B, and fill most of the page with fast
   scribbles for about 20 s. Does either lag behind your finger, stutter, or drop ink?
4. **iPad, several fingers and a palm (masked).** In A, then B, on a busy picture: draw 2–3 curved
   lines with fingers together and lift them one at a time, then a fast tight zigzag, then draw with
   your palm resting on the paper. Any line that stops early, extra loops, or stray palm marks?
5. **iPad, held finger plus a colour tap (masked).** Hold one finger drawing, tap a colour with
   another finger, keep moving the first. Does the line continue, and in which colour?
6. **iPad, rotate then draw (masked).** First open a coloring page, set Settings › Appearance to
   Dark and back, and clear the page. Then rotate 3–4 times, clearing and drawing a short line after
   each rotation. Does every line show up straight away, and does a colour swatch land on the paper?
7. **Sound, iPad and Galaxy (masked).** Draw with Sound on, then turn it off (Settings › Sound) and
   draw again. Is the sound right when on, and silent when off?
8. **Galaxy, TalkBack (masked, about 3 minutes).** Turn TalkBack on, swipe through the canvas
   controls, then Brushes, Stroke width and Settings › Sound. Does every control get a spoken name,
   and do switches say on or off?
9. **Optional: iPad Safari, both web builds.** Claude gives you two links. Scribble fast for about
   10 s in each, then open Settings. Does either lag, and does either dialog backdrop look broken?
10. **Later, once production AI is fixed: one AI picture each (masked).** Make one Magical picture
    in A, then B, on the iPad. Compare the wait and the result, then Download. This costs 2
    generations.

## Source candidates (folded into the cases above)

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
