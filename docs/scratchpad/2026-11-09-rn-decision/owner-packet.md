# Owner packet: what only your eyes or fingers can judge

At most 10 cases, about 20 minutes. Every app is pre-installed and labelled. Do them in any order;
skip any you don't have time for. Reply with the case number and a word or two each.

Lanes append candidate cases under "Candidates"; the orchestrator curates them into the numbered
list.

## Cases

*(being prepared)*

## Candidates

* **(setup) iPad automation.** Settings › Developer › Enable UI Automation on (authenticate if
  asked) so WebDriverAgent works again; then draw a line in `art.splotch.app.baseline.main` (all
  icons say "Splotch"; the orchestrator names which).
* **(perf) iPad first stroke after a cold start, both apps.** Swipe the app away, open it, and as
  soon as the paper shows draw one slow long line; do it 4 times each in `art.splotch.app.dev` then
  `art.splotch.app.baseline.main`. Does the line freeze for a blink early in the first stroke? (RN
  replay froze 0.1–0.16 s in 4 of 7 cold starts; shipping is unmeasured on the iPad.)
