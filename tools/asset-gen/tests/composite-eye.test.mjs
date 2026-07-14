// Regression tests for the composite blank-orb eye detector
// (lib/composite-eye.mjs). Guards both directions at once:
//
//   • TRUE POSITIVES — two recovered pre-fix night eyes that composite to a
//     blank white orb (stegosaurus-tall's solid-pen orb, the original the gate
//     was built for; horse-tall's chalk-whitened ringed orb, a distinct
//     mechanism). These MUST stay flagged.
//   • LEGIBLE OVER-FLAGS — three shipped eyes the FIRST version of the detector
//     wrongly flagged, because it measured the light pupil's whole FOOTPRINT and
//     a legible dark-mode eye draws a small pupil inside a big white sclera, so
//     the footprint reads white just like a real orb. These MUST pass.
//
// The fix measures a small disc AT the catchlight core instead: a legible eye
// has its pupil there (dark), a blank orb has white there. Fixtures are the
// (comp, light, pen) trio the detector consumes, stored full-res (the eye finder
// is native-resolution bound). Rebuild them with
// tools/asset-gen/.coloring-samples/orb-fixtures/build-fixtures.mjs.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scoreCompositeEyes, CORE_DARK_FRAC_MIN } from '../lib/composite-eye.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/composite-eye');

async function score(name) {
  const [comp, light, pen] = await Promise.all([
    readFile(join(FIXTURES, `${name}.comp.webp`)),
    readFile(join(FIXTURES, `${name}.light.webp`)),
    readFile(join(FIXTURES, `${name}.pen.webp`)),
  ]);
  return scoreCompositeEyes(comp, light, pen);
}

let manifest;
beforeAll(async () => {
  manifest = JSON.parse(await readFile(join(FIXTURES, 'manifest.json'), 'utf8'));
});

describe('composite-eye blank-orb detector', () => {
  describe('true positives — a blank white orb must be flagged', () => {
    for (const name of ['stegosaurus-tall', 'horse-tall']) {
      it(`flags ${name}`, async () => {
        const r = await score(name);
        expect(r.passes).toBe(false);
        expect(r.failed).toBeGreaterThan(0);
        // the worst pupil is empty at the core — well under the threshold
        expect(r.worst).not.toBeNull();
        expect(r.worst.blankOrb).toBe(true);
        expect(r.worst.coreDarkFrac).toBeLessThan(CORE_DARK_FRAC_MIN);
      });
    }
  });

  describe('legible over-flags — a small pupil in a big white sclera must pass', () => {
    for (const name of ['unicorn-tall', 'owl-tall', 'square-tall']) {
      it(`passes ${name}`, async () => {
        const r = await score(name);
        expect(r.passes).toBe(true);
        expect(r.failed).toBe(0);
        // every confirmed pupil has real dark at its core, clear of the threshold
        expect(r.pupils.length).toBeGreaterThan(0);
        for (const p of r.pupils) {
          expect(p.blankOrb).toBe(false);
          expect(p.coreDarkFrac).toBeGreaterThan(CORE_DARK_FRAC_MIN);
        }
      });
    }
  });

  it('separates the two classes with margin on both sides of the threshold', async () => {
    const worstOf = async (name) => {
      const r = await score(name);
      return r.pupils.reduce((m, p) => Math.min(m, p.coreDarkFrac), Infinity);
    };
    const trueP = Math.max(await worstOf('stegosaurus-tall'), await worstOf('horse-tall'));
    const legible = Math.min(
      await worstOf('unicorn-tall'),
      await worstOf('owl-tall'),
      await worstOf('square-tall')
    );
    // blank orbs sit below the bar, legible eyes above it — with air between.
    expect(trueP).toBeLessThan(CORE_DARK_FRAC_MIN);
    expect(legible).toBeGreaterThan(CORE_DARK_FRAC_MIN);
    expect(legible - trueP).toBeGreaterThan(0.1);
  });

  it('every fixture matches its manifest expectation', async () => {
    expect(manifest.length).toBe(5);
    for (const entry of manifest) {
      const r = await score(entry.name);
      expect(r.passes).toBe(!entry.expectBlankOrb);
    }
  });
});
