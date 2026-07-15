import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreEyeFill } from '../lib/eye-fill.mjs';
import { diffGoldenPage, scoreGoldenNightEyes } from '../lib/golden-catalog.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/composite-eye');

async function scoreFixture(name) {
  const [composite, light, pen] = await Promise.all([
    readFile(join(FIXTURES, `${name}.comp.webp`)),
    readFile(join(FIXTURES, `${name}.light.webp`)),
    readFile(join(FIXTURES, `${name}.pen.webp`)),
  ]);
  const lightEyes = await scoreEyeFill(light, pen);
  return {
    night: await scoreGoldenNightEyes(composite, light, pen, lightEyes, { chalked: true }),
  };
}

function diff(was, now) {
  const out = { regressions: [], improvements: [], info: [] };
  diffGoldenPage('fixture/page', was, now, out);
  return out;
}

describe('golden catalog blank-orb verdict', () => {
  it('reports shipped-good to recovered-blank as a regression while the band judge stays true', async () => {
    const good = await scoreFixture('unicorn-tall');
    const blank = await scoreFixture('stegosaurus-tall');

    expect(good.night.eyesOk).toBe(true);
    expect(blank.night.eyesOk).toBe(true);
    expect(good.night.orbOk).toBe(true);
    expect(blank.night.orbOk).toBe(false);

    const out = diff(good, blank);
    expect(out.regressions).toContain('fixture/page  night.orbOk ok -> FAIL');
    expect(out.improvements).toEqual([]);
  });

  it('reports recovered-blank to shipped-good as an improvement', async () => {
    const blank = await scoreFixture('stegosaurus-tall');
    const good = await scoreFixture('unicorn-tall');

    const out = diff(blank, good);
    expect(out.improvements).toContain('fixture/page  night.orbOk FAIL -> ok');
    expect(out.regressions).toEqual([]);
  });

  it('treats a min-core-dark drop that stays above the blank threshold as diagnostic, not a regression', () => {
    // Both frames pass the orb gate; only the supporting metric moved (0.4 -> 0.2,
    // still far above CORE_DARK_FRAC_MIN 0.07) — a benign asset shift, not a blank.
    const was = { night: { orbOk: true, orbFailed: 0, orbMinCoreDark: 0.4 } };
    const now = { night: { orbOk: true, orbFailed: 0, orbMinCoreDark: 0.2 } };

    const out = diff(was, now);
    expect(out.regressions).toEqual([]);
    expect(out.info).toContain('fixture/page  night.orbMinCoreDark 0.4 -> 0.2 (moved)');
  });

  it('still regresses when a min-core-dark collapse actually blanks an orb', () => {
    // The verdict and the failed-pupil counter — not the diagnostic metric — carry
    // the regression when the core genuinely goes blank.
    const was = { night: { orbOk: true, orbFailed: 0, orbMinCoreDark: 0.4 } };
    const now = { night: { orbOk: false, orbFailed: 1, orbMinCoreDark: 0.03 } };

    const out = diff(was, now);
    expect(out.regressions).toContain('fixture/page  night.orbOk ok -> FAIL');
    expect(out.regressions).toContain('fixture/page  night.orbFailed 0 -> 1');
  });
});
