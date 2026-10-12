# Rival review, round 2 (Codex, question mode)

The independent opposite-vendor reviewer ran through the repo's `run-rival-agent` workflow in a
sandboxed worktree pinned at 33a4d43b6ef8. It had read access to the review packet: the draft
`CONCLUSION.md` in [`draft-conclusion-reviewed.md`](draft-conclusion-reviewed.md), `ACCEPTANCE.md`,
the raw runs, and the scorers. Its findings list was empty in both rounds; the review is carried in
the summary below, reproduced verbatim except that packet paths are made relative. Line numbers cite
the packet's copies of `CONCLUSION.md`, `native-session-payload.js` and `native-run-session.mjs` at
review time.

## Question asked

This continues an earlier independent review whose output is rival-round1-findings.json. The subject
is the native-iPad validation of PR 2070's iOS undo-ghost settle; this worktree's HEAD is
33a4d43b6ef8, the merged fix. Read CONCLUSION.md, especially the "Revision after rival round 1"
section, and ACCEPTANCE.md, which gained a confirmation section pre-registered before that series
ran. Then review the new raw data in runs-confirm/, score-confirm.py, score-confirm.txt,
score-first-series.txt and digests.txt.

Check adversarially:

1. Were your round-1 points addressed correctly?
2. Is score-confirm.py correct? In particular, check the non-overlapping undo-window assignment, the
   settle window that excludes the first undo's boundary frame, warmup exclusion, and the
   criterion-4 rule as pre-registered. Recompute the confirmation numbers yourself from the raw
   JSON.
3. Does the confirmation series support the revised verdict ("native validation satisfied for the
   undo path, neutral to beneficial, with a sub-gate one-beat call-frame residual")? Or is something
   still unsupported? Consider the 61 ms fold total in one treatment run.
4. Anything wrong or overstated in the revised text that would be posted to GitHub?

Do not run anything on devices.

## Reviewer summary (verbatim)

Overall: the confirmation series supports the narrow undo-path verdict—neutral to beneficial, with a
sub-gate synchronous call-frame residual—but the statement that every pre-registered criterion
passed is still overstated because criterion 4’s fold-total rule is unresolved.

I independently rescored all eight scored confirmation artifacts from raw stamps/measures, excluding
the four warmups. My results exactly match `score-confirm.txt`, and executing `score-confirm.py`
reproduces both supplied score files byte-for-byte.

Scorer review:

* Undo windows are non-overlapping in these captures. Each includes the frame containing its own
  call and excludes the frame containing the next call; no frame was assigned twice. The
  implementation comment claiming ownership by the call preceding the frame’s start is
  inaccurate—the call-containing frame starts before its assigned call—but the implementation
  matches the intended boundary policy and reported results.
* The settle calculation correctly excludes the interval containing the first undo call. Its
  `y <= first` condition retains only frames completed by the call boundary.
* All `b*-warm-*` runs are correctly excluded.
* The fallback `... or own[:1]` could reintroduce overlap if calls were less than one frame apart,
  but it is never exercised by these 700 ms-spaced captures.

Independent confirmation results:

* Control undo breaches: 0, 1, 1, 0; treatment: 0, 0, 0, 0. Worst windows are 36 ms and 29 ms
  respectively.
* Treatment gate maxima are engine P95 12 ms, next-frame P95 16 ms, and next-frame max 22 ms.
* Call-frame medians are 17 ms in every control and 17, 27, 17, 25 ms in treatment. Post-action P95
  is 26–33 ms in control versus 18–22 ms in treatment.
* Draw, settle, tail, commit, correctness, memory, ghost, depth, and leak figures all reproduce the
  revised text.
* Combined breach-bearing runs are correctly reported as 5/8 control versus 1/8 treatment.

The 61 ms fold total is real rather than a scoring artifact: that treatment run has ten folds of 4–8
ms, all before the first undo, versus a control maximum of 41 ms. It occurs in only one treatment
run and the changed code is not exercised until undo, so it is not persuasive evidence of an undo
regression. However, the original criterion 4 explicitly requires fold totals not to increase beyond
control run-to-run spread. The confirmation addendum explicitly applies the “control maximum + 17
ms, in at least two treatment runs” exception rule to draw/settle/tail max-frames and separately
gives commits a 3 ms tolerance; it never says that rule applies to fold totals. `score-confirm.py`
accordingly prints fold totals without adjudicating them. Therefore the sentence claiming 61 ms is
“below the pre-registered two-run rule,” and the verdict “under ... the pre-registered criteria,”
are not supported as written. The GitHub text should either report criterion 4’s fold-total clause
as an outstanding exception while retaining the narrower undo-path pass, or explicitly disclose that
applying the repeatability rule to fold totals is a post-hoc interpretation.

The round-1 statistical, overlapping-window, presentation-proxy, next-frame-P95, 42 ms mechanism,
and first-series criterion-4 points were otherwise addressed. One factual correction remains: the
revision says treatment run 1 had the 48 ms draw, 21 ms tail, and 5 ms commit maximum. Run 1 had
48/17/2; the 21 ms tail and 5 ms commit maximum occurred in treatment run `04-treatment`. Say those
exceptions occurred “across the treatment arm.”

Provenance improved through stable per-arm digests and runtime entry-chunk checks, but the artifacts
copy `appDigest` from `digests.txt` rather than hashing the installed bundle. Also, the supplied
driver normally skips reinstalling consecutive same-arm blocks, so the claimed forced reinstall
before the second treatment block requires an unrecorded manual reset/install. This does not
overturn the warmup-controlled undo result, but the categorical reinstall claim should be backed by
an install log or qualified.

Recommended verdict: “The native confirmation validates the undo path under the repository undo
gates and shows neutral-to-beneficial behavior, with a disclosed sub-gate call-frame residual.
Formal criterion 4 remains ambiguous because one treatment run’s 61 ms fold total exceeded the
control spread.”
