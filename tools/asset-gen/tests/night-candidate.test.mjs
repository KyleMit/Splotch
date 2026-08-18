import { describe, expect, it } from 'vitest';
import { passesNightCandidate, preferNightCandidate } from '../lib/night-candidate.mjs';

const config = { nightLumaMax: 60, lineWhiteMin: 150, haloScoreMax: 2 };

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
