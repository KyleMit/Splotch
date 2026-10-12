// Candidate policy stays separate from generator I/O so retry selection and run
// failure semantics remain directly testable. Passing takes honor the loop's
// drift-clean stop condition before halo quality; when no take passes, surviving
// eyes stay first because a dead expression outweighs the scalar gate misses.
export function passesNightCandidate(candidate, config) {
  return (
    candidate.night.bgLuma <= config.nightLumaMax &&
    candidate.line.lineWhite >= config.lineWhiteMin &&
    candidate.halo.haloScore <= config.haloScoreMax &&
    candidate.warp.localWarpMax <= config.warpMax &&
    candidate.eyes.passes
  );
}

function nonEyeGateFailures(candidate, config) {
  return (
    Number(candidate.night.bgLuma > config.nightLumaMax) +
    Number(candidate.line.lineWhite < config.lineWhiteMin) +
    Number(candidate.halo.haloScore > config.haloScoreMax) +
    Number(candidate.warp.localWarpMax > config.warpMax)
  );
}

export function preferNightCandidate(candidate, incumbent, config) {
  if (!incumbent) return true;
  const candidatePasses = passesNightCandidate(candidate, config);
  const incumbentPasses = passesNightCandidate(incumbent, config);
  if (candidatePasses !== incumbentPasses) return candidatePasses;
  if (candidatePasses) {
    const candidateDrifts = candidate.drift.ratio > config.driftThreshold;
    const incumbentDrifts = incumbent.drift.ratio > config.driftThreshold;
    if (candidateDrifts !== incumbentDrifts) return incumbentDrifts;
    if (candidate.halo.haloScore !== incumbent.halo.haloScore)
      return candidate.halo.haloScore < incumbent.halo.haloScore;
    if (candidate.warp.localWarpMax !== incumbent.warp.localWarpMax)
      return candidate.warp.localWarpMax < incumbent.warp.localWarpMax;
    return candidate.drift.ratio < incumbent.drift.ratio;
  }
  if (candidate.eyes.failed !== incumbent.eyes.failed)
    return candidate.eyes.failed < incumbent.eyes.failed;
  const candidateFailures = nonEyeGateFailures(candidate, config);
  const incumbentFailures = nonEyeGateFailures(incumbent, config);
  if (candidateFailures !== incumbentFailures) return candidateFailures < incumbentFailures;
  if (candidate.halo.haloScore !== incumbent.halo.haloScore)
    return candidate.halo.haloScore < incumbent.halo.haloScore;
  if (candidate.warp.localWarpMax !== incumbent.warp.localWarpMax)
    return candidate.warp.localWarpMax < incumbent.warp.localWarpMax;
  return candidate.drift.ratio < incumbent.drift.ratio;
}

export async function chooseNightCandidate({ maxAttempts, config, runAttempt }) {
  let best = null;
  let attemptsRun = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptsRun = attempt;
    const candidate = await runAttempt(attempt);
    if (preferNightCandidate(candidate, best, config)) best = candidate;
    if (candidate.drift.ratio <= config.driftThreshold && passesNightCandidate(candidate, config))
      break;
  }
  return { ...best, attemptsRun, accepted: passesNightCandidate(best, config) };
}

export function nightRunFailureMessage({ renderFailures, gateFailures, missingCandidates }) {
  const failures = [];
  if (renderFailures) failures.push(`${renderFailures} render(s) failed.`);
  if (gateFailures) failures.push(`${gateFailures} candidate(s) failed gates.`);
  if (missingCandidates)
    failures.push(`${missingCandidates} requested candidate(s) missing for apply.`);
  return failures.join(' ');
}
