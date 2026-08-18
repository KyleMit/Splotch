import { describe, expect, it } from 'vitest';
import {
  chooseNightCandidate,
  nightRunFailureMessage,
  passesNightCandidate,
  preferNightCandidate,
} from '../lib/night-candidate.mjs';

const config = {
  nightLumaMax: 60,
  lineWhiteMin: 150,
  haloScoreMax: 2,
  driftThreshold: 0.004,
};

function candidate(overrides = {}) {
  return {
    night: { bgLuma: 30 },
    line: { lineWhite: 220 },
    halo: { haloScore: 0.5, rawScore: 0.5 },
    eyes: { passes: true, failed: 0 },
    drift: { ratio: 0 },
    ...overrides,
  };
}

describe('night candidate halo gate and ranking', () => {
  it('accepts the threshold and rejects a normalized score above it', () => {
    expect(passesNightCandidate(candidate({ halo: { haloScore: 2, rawScore: 2 } }), config)).toBe(
      true
    );
    expect(
      passesNightCandidate(candidate({ halo: { haloScore: 2.001, rawScore: 2.001 } }), config)
    ).toBe(false);
  });

  it('does not turn the raw crop-review signal into an automatic rejection', () => {
    expect(
      passesNightCandidate(candidate({ halo: { haloScore: 1.9, rawScore: 5.1 } }), config)
    ).toBe(true);
  });

  it('prefers the lower halo score among otherwise acceptable takes', () => {
    const cleanerHalo = candidate({
      halo: { haloScore: 0.4, rawScore: 0.4 },
      drift: { ratio: 0.003 },
    });
    const cleanerDrift = candidate({
      halo: { haloScore: 1.5, rawScore: 1.5 },
      drift: { ratio: 0 },
    });
    expect(preferNightCandidate(cleanerHalo, cleanerDrift, config)).toBe(true);
  });

  it('returns the drift-clean take that stops the real retry loop', async () => {
    const drifting = candidate({
      attempt: 1,
      halo: { haloScore: 1.9, rawScore: 1.9 },
      drift: { ratio: 0.05 },
    });
    const driftClean = candidate({
      attempt: 2,
      halo: { haloScore: 1.95, rawScore: 1.95 },
      drift: { ratio: 0.0001 },
    });
    const attempts = [drifting, driftClean];

    const result = await chooseNightCandidate({
      maxAttempts: 3,
      config,
      runAttempt: async (attempt) => attempts[attempt - 1],
    });

    expect(result.attempt).toBe(2);
    expect(result.attemptsRun).toBe(2);
    expect(result.accepted).toBe(true);
  });

  it('keeps surviving eyes ahead of halo when every take fails a hard gate', () => {
    const livingEyes = candidate({
      night: { bgLuma: 70 },
      halo: { haloScore: 4, rawScore: 4 },
    });
    const deadEyes = candidate({
      halo: { haloScore: 2.1, rawScore: 2.1 },
      eyes: { passes: false, failed: 1 },
    });
    expect(preferNightCandidate(livingEyes, deadEyes, config)).toBe(true);
  });
});

describe('night candidate run outcome', () => {
  it('counts every rejected review sample without calling it a render failure', () => {
    expect(
      nightRunFailureMessage({ renderFailures: 0, gateFailures: 2, missingCandidates: 0 })
    ).toBe('2 candidate(s) failed gates.');
  });

  it('reports independent render, gate, and apply-input failures together', () => {
    expect(
      nightRunFailureMessage({ renderFailures: 1, gateFailures: 2, missingCandidates: 3 })
    ).toBe(
      '1 render(s) failed. 2 candidate(s) failed gates. 3 requested candidate(s) missing for apply.'
    );
  });
});
