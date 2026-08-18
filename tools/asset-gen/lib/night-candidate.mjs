export function passesNightCandidate(candidate, config) {
  return (
    candidate.night.bgLuma <= config.nightLumaMax &&
    candidate.line.lineWhite >= config.lineWhiteMin &&
    candidate.halo.haloScore <= config.haloScoreMax &&
    candidate.eyes.passes
  );
}

function nonEyeGateFailures(candidate, config) {
  return (
    Number(candidate.night.bgLuma > config.nightLumaMax) +
    Number(candidate.line.lineWhite < config.lineWhiteMin) +
    Number(candidate.halo.haloScore > config.haloScoreMax)
  );
}

export function preferNightCandidate(candidate, incumbent, config) {
  if (!incumbent) return true;
  const candidatePasses = passesNightCandidate(candidate, config);
  const incumbentPasses = passesNightCandidate(incumbent, config);
  if (candidatePasses !== incumbentPasses) return candidatePasses;
  if (candidatePasses) {
    if (candidate.halo.haloScore !== incumbent.halo.haloScore)
      return candidate.halo.haloScore < incumbent.halo.haloScore;
    return candidate.drift.ratio < incumbent.drift.ratio;
  }
  if (candidate.eyes.failed !== incumbent.eyes.failed)
    return candidate.eyes.failed < incumbent.eyes.failed;
  const candidateFailures = nonEyeGateFailures(candidate, config);
  const incumbentFailures = nonEyeGateFailures(incumbent, config);
  if (candidateFailures !== incumbentFailures) return candidateFailures < incumbentFailures;
  if (candidate.halo.haloScore !== incumbent.halo.haloScore)
    return candidate.halo.haloScore < incumbent.halo.haloScore;
  return candidate.drift.ratio < incumbent.drift.ratio;
}
