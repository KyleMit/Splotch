// The verdicts a drawing capture is judged by, derived one way for every reader
// that scores a capture, so no two readers can disagree about which captures
// count.
import { DEFAULT_CAPTURE_RUNTIME, inputFidelity } from './input-fidelity.mjs';
import { summarizeRun } from './real-screen-stats.mjs';
import { refreshRegimeVerdict } from './refresh-regime.mjs';

// The summaries and the fidelity verdict a capture recorded are the ones its
// runner computed on the day, from whatever estimator and expectations that
// checkout held, so a correction to either would reach published cells only
// through device time. Both are re-derived from the raw frame table (`report`)
// when the caller has one; without it the stored summaries are all there is.
//
// Fidelity is judged only when the capture carried a verdict at all. A runner
// that writes none (the desktop transport) is not held to one: deriving one for
// it would mark every desktop cell unscoreable on a trusted-touch check that
// Playwright cannot satisfy by construction. The target's declared runtime
// judges the input; the runtime the capture recorded stands in only when the
// caller knows no target, and the default only when neither exists.
//
// A PRESERVED matrix cell keeps the verdict it was published with, because
// re-deriving one needs the raw input samples and a preserved cell has only
// normalized results — the same reason it keeps its published scores rather than
// being re-scored. So a target captured on both sides of a recapture can show a
// fresh mode judged by the current expectations beside a preserved mode judged
// by the ones in force when it was taken. That is the standing cost of preserved
// evidence (ADR-0138), marked as such in the matrix, and it resolves when the
// mode is recaptured — not a second verdict for the same measurement.
export function drawingVerdicts(artifact, { report, captureRuntime, refreshRegime }) {
  const summaries = report ? summarizeRun(report) : artifact?.summaries;
  const fidelity = artifact?.fidelity
    ? inputFidelity(
        summaries?.phases?.[0]?.input ?? {},
        captureRuntime ?? artifact.fidelity.runtime ?? DEFAULT_CAPTURE_RUNTIME
      )
    : null;
  return {
    summaries,
    fidelity,
    regime: refreshRegimeVerdict(summaries?.intervalMs, refreshRegime, summaries?.regimeMixture),
  };
}
