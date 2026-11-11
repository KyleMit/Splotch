# Frozen clip scorer for RN's win test

This is the frozen scorer for `../rn-win-test.md`, Part 1. It scores the owner's 240 fps slo-mo
clips for shift lag (apparent tracking delay). It was frozen 2026-11-11 ~16:30 EST, after amendment
4 and before any film.

* `rn-win-scorer.tar.gz` holds the tools (`bin/`, including `lib/` and `compare-blocks`), the
  synthetic-clip generator, the exact-geometry reference ("oracle"), the validation and sensitivity
  runners, the scorer's own README, and every validation and block-comparison report.
* `MANIFEST.sha256` lists a SHA-256 for each of those files. To check a copy, extract the archive
  and run `shasum -a 256 -c MANIFEST.sha256` there. All 25 entries verified at commit time.
* Synthetic validation, 79 clips and 570 strokes:
  * Error per stroke against the oracle: median +0.34 ms (5–95%: −0.17 to +0.62).
  * A planted 25 ms difference reads 24.99 (Pen) and 25.07 (Crayon).
  * Every planted fidelity failure is flagged.
* Six four-block synthetic sets, on 130–150 mm swipes, each return the verdict its truth implies:
  * RN 30 vs 55: RN win.
  * 30 vs 42: tie.
  * 15 vs 40: RN win.
  * 5 vs 40: RN win, through below-floor strokes.
  * Shipping 30 vs 55: shipping win.
  * A hidden lead: below floor.
  * Moving e by ± 2 mm changes a difference by at most 0.6 ms.
* **Swipes must be 130–150 mm long.** On the old 100 mm swipes, a 55 ms arm keeps too few scorable
  strokes, and a true 25 ms advantage ties.
* **Below floor**, as implemented: a stroke whose ink is complete but whose tip was visible 2 mm
  clear in fewer than 10 fast frames. A stroke whose tip was visible but whose frames were censored
  stays unscorable. Giving it a floor would understate a long delay.
* `compare-blocks` refuses a scores table that is not committed and unmodified in git. Its
  `--allow-uncommitted` flag is for the synthetic tests only.
