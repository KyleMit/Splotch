# Abandoned iPhone performance trials, 2026-10-02

Six original local experiment commits were published on 2026-10-04 UTC as draft evidence PRs and
closed without merging. Five were rejected after a physical trial; one was parked before
measurement. Their source and tests remain reviewable in the linked diffs. The PR descriptions
record the attempted mechanism, retained validation, outcome and proof limits.

| Attempt                                              | Disposition and canonical frame P95/max                                | Evidence PR                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| Freeze retired AI dial/preview progress              | Timed rejection: 25/75 → 29/58 ms                                      | [2637](https://github.com/KyleMit/Splotch/pull/2637) |
| Give the palette a transform backing hint            | Timed rejection: 33/38 → 33/38 ms                                      | [2638](https://github.com/KyleMit/Splotch/pull/2638) |
| Remove the completed screenshot flash                | Timed rejection: 18/56 → 18/38 ms                                      | [2639](https://github.com/KyleMit/Splotch/pull/2639) |
| Hint transform backing for the departing clear sheet | Timed rejection: plain 18/41 → 21/37 ms; coloring 20/38 → 21/37 ms     | [2640](https://github.com/KyleMit/Splotch/pull/2640) |
| Conceal retired coloring content with opacity        | Timed rejection: selection 20/38 → 17/39 ms                            | [2642](https://github.com/KyleMit/Splotch/pull/2642) |
| Original coloring-content opacity attempt            | Untimed, parked and superseded; no performance verdict for this commit | [2643](https://github.com/KyleMit/Splotch/pull/2643) |

All timed rows concern physical iPhone Safari web in portrait/light with four repeats. AI used
WebDriver element-click activation; palette, screenshot and clear used native touch; the coloring
family recorded mixed activation. Native touch and native profiler attachment do not identify an
installed native app. Each PR retains its exact input and preparation limits.

These are the retained canonical P95/max values, not averages or blended raw-callback statistics.
Every timed candidate remained red under its original gate. Selection's 17 ms P95 passed the 20 ms
threshold, but three repeated maximum breaches kept it red. The plain clear candidate's maximum was
unconfirmed; its 21 ms P95 independently failed. Lower observed maxima or faster readiness are not
gate clearance, reproducible gains or proof of which owner caused the cost.

The branches retain their original commits and parent af31a00d11cee749f7cbc24bd61035970453aca5.
Candidate commit/build identities were checked against retained reports when archiving. Tests,
scoring and loaded-asset byte checks were not rerun; the listed historical checks are not current CI
certification. The original untimed coloring branch does not inherit the later implementation's
measurement.

Private raw traces, images, drivers and campaign packets remain local. Their absence from these PRs
limits independent reconstruction of the physical results; the preserved source and explicit
historical account still prevent repeating the same attempt without new evidence.

Related evidence from the overnight product work is already preserved in
[the rejected direct SVG bitmap conversion](https://github.com/KyleMit/Splotch/pull/2632) and
[the offline resource probe stopped by a faulty prerequisite](https://github.com/KyleMit/Splotch/pull/2633).
The working export, save and tablet palette fixes remain in
[PR 2631](https://github.com/KyleMit/Splotch/pull/2631); they are separate from these abandoned
trials.
