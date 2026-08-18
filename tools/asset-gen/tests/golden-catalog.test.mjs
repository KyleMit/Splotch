import { beforeAll, describe, expect, it } from 'vitest';
import { scoreEyeFill } from '../lib/eye-fill.mjs';
import {
  diffGoldenPage,
  GOLDEN_METRICS,
  GOLDEN_VERDICTS,
  scoreGoldenNightEyes,
  scoreGoldenPage,
} from '../lib/golden-catalog.mjs';
import { loadTrio } from './fixtures/composite-eye/load.mjs';

const get = (obj, path) => path.split('.').reduce((value, key) => value?.[key], obj);

async function scoreFixture(name) {
  const { comp: composite, light, pen } = await loadTrio(name);
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

describe('golden catalog frame coverage direction', () => {
  it('reports an increase beyond noise as a regression', () => {
    const out = diff({ outline: { frameCoverage: 0.11 } }, { outline: { frameCoverage: 0.12 } });

    expect(out.regressions).toContain('fixture/page  outline.frameCoverage 0.11 -> 0.12');
    expect(out.info).toEqual([]);
  });

  it('reports a decrease beyond noise as informational movement', () => {
    const out = diff({ outline: { frameCoverage: 0.12 } }, { outline: { frameCoverage: 0.11 } });

    expect(out.regressions).toEqual([]);
    expect(out.info).toContain('fixture/page  outline.frameCoverage 0.12 -> 0.11 (moved)');
  });

  it('ignores movement within noise', () => {
    const out = diff({ outline: { frameCoverage: 0.11 } }, { outline: { frameCoverage: 0.114 } });

    expect(out.regressions).toEqual([]);
    expect(out.info).toEqual([]);
  });
});

describe('golden catalog blank-orb verdict', () => {
  // Scoring a fixture runs the full-resolution eye pipeline (~550 ms each), and
  // both direction tests need the same pair — only the argument order to diff()
  // differs. diffGoldenPage treats the score objects as read-only, so one scoring
  // pass feeds both.
  let good;
  let blank;
  beforeAll(async () => {
    good = await scoreFixture('unicorn-tall');
    blank = await scoreFixture('stegosaurus-tall');
  });

  it('reports shipped-good to recovered-blank as a regression while the band judge stays true', () => {
    expect(good.night.eyesOk).toBe(true);
    expect(blank.night.eyesOk).toBe(true);
    expect(good.night.orbOk).toBe(true);
    expect(blank.night.orbOk).toBe(false);

    const out = diff(good, blank);
    expect(out.regressions).toContain('fixture/page  night.orbOk ok -> FAIL');
    expect(out.improvements).toEqual([]);
  });

  it('reports recovered-blank to shipped-good as an improvement', () => {
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

describe('golden catalog missing-key detection', () => {
  it('reports a key dropped from the current score shape as a loud regression', () => {
    const out = diff({ outline: { solidOk: true } }, { outline: {} });

    expect(out.regressions).toContain(
      'fixture/page  outline.solidOk MISSING from score shape (current side)'
    );
  });

  it('reports a key added to the current score shape as a loud regression', () => {
    const out = diff({ outline: {} }, { outline: { solidOk: true } });

    expect(out.regressions).toContain(
      'fixture/page  outline.solidOk MISSING from score shape (golden side)'
    );
  });

  it('stays silent when a whole section is structurally absent on both sides', () => {
    const out = diff({}, {});

    expect(out.regressions).toEqual([]);
  });

  it('reports a page gaining a whole section (a freshly committed raw fill) as informational, not one regression per leaf', () => {
    const out = diff(
      { outline: { solidOk: true } },
      {
        outline: { solidOk: true },
        light: {
          keep: 0.99,
          localKeep: 0.95,
          eyeCores: 2,
          eyeLively: 2,
          driftOk: true,
          eyesOk: true,
        },
      }
    );

    expect(out.regressions).toEqual([]);
    expect(out.info).toContain('fixture/page  light section added (re-freeze to adopt)');
  });

  it('reports a page losing a whole section as informational, not one regression per leaf', () => {
    const out = diff(
      { outline: { solidOk: true }, night: { orbOk: true, orbFailed: 0, orbMinCoreDark: 0.4 } },
      { outline: { solidOk: true } }
    );

    expect(out.regressions).toEqual([]);
    expect(out.info).toContain('fixture/page  night section removed (re-freeze to adopt)');
  });
});

describe('golden catalog shape drift guard', () => {
  it('scores a real fixture through the extracted producer and resolves every catalog path', async () => {
    const { comp: nightRaw, light: lightRaw, pen } = await loadTrio('horse-tall');
    const entry = await scoreGoldenPage({
      page: 'fixtures/horse-tall',
      pen,
      lightRaw,
      nightRaw,
      chalk: null,
    });

    for (const path of GOLDEN_VERDICTS) expect(get(entry, path), path).not.toBeUndefined();
    for (const path of Object.keys(GOLDEN_METRICS))
      expect(get(entry, path), path).not.toBeUndefined();
  });
});
