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
});
