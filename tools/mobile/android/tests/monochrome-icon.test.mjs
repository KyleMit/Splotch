import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { genAndroidMonochromeIcon } from '../gen-monochrome-icon.mjs';

const ROOT = new URL('../../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const SOURCE = 'assets/icon-monochrome.xml';
const RES = 'android/app/src/main/res';
const LAUNCHERS = ['ic_launcher.xml', 'ic_launcher_round.xml'];
const LAYER = '<monochrome android:drawable="@drawable/ic_launcher_monochrome" />';
const GENERATED =
  '<?xml version="1.0"?><adaptive-icon><background /><foreground /></adaptive-icon>';
const fixtures = [];

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-monochrome-'));
  fixtures.push(root);
  for (const [path, text] of [
    [SOURCE, read(SOURCE)],
    ...LAUNCHERS.map((name) => [`${RES}/mipmap-anydpi-v26/${name}`, GENERATED]),
  ]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Android monochrome launcher artwork', () => {
  it('ships the authored drawable and both adaptive references', () => {
    expect(read(`${RES}/drawable/ic_launcher_monochrome.xml`)).toBe(read(SOURCE));
    for (const name of LAUNCHERS) {
      expect(read(`${RES}/mipmap-anydpi-v26/${name}`).split(LAYER)).toHaveLength(2);
    }
  });

  it('restores layers after vendor generation without changing ordinary icon layers', () => {
    const root = createFixture();
    genAndroidMonochromeIcon(root);
    expect(readFileSync(join(root, `${RES}/drawable/ic_launcher_monochrome.xml`), 'utf8')).toBe(
      read(SOURCE)
    );
    for (const name of LAUNCHERS) {
      const path = join(root, `${RES}/mipmap-anydpi-v26/${name}`);
      const generated = readFileSync(path, 'utf8');
      expect(generated.replace(`    ${LAYER}\n`, '')).toBe(GENERATED);
      genAndroidMonochromeIcon(root);
      expect(readFileSync(path, 'utf8')).toBe(generated);
    }
  });

  it('validates both adaptive definitions before writing either', () => {
    const root = createFixture();
    writeFileSync(join(root, `${RES}/mipmap-anydpi-v26/ic_launcher_round.xml`), '<broken />');
    expect(() => genAndroidMonochromeIcon(root)).toThrow('expected one adaptive icon');
    expect(readFileSync(join(root, `${RES}/mipmap-anydpi-v26/ic_launcher.xml`), 'utf8')).toBe(
      GENERATED
    );
  });

  it('rejects an unexpected monochrome layer', () => {
    const root = createFixture();
    const path = join(root, `${RES}/mipmap-anydpi-v26/ic_launcher.xml`);
    const unexpected = GENERATED.replace('</adaptive-icon>', '<monochrome /></adaptive-icon>');
    writeFileSync(path, unexpected);
    expect(() => genAndroidMonochromeIcon(root)).toThrow('unexpected monochrome layer');
    expect(readFileSync(path, 'utf8')).toBe(unexpected);
  });

  it('renders the silhouette inside the circular adaptive safe area', async () => {
    const source = read(SOURCE);
    expect(source).toContain('android:viewportWidth="108"');
    expect(source).toContain('android:viewportHeight="108"');
    const path = source.match(/android:pathData="([^"]+)"/)[1];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 108 108"><path fill-rule="evenodd" d="${path}"/></svg>`;
    const { data, info } = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ink = [];
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * info.channels + 3] >= 128)
          ink.push([(x + 0.5) / 10, (y + 0.5) / 10]);
      }
    }
    const xs = ink.map(([x]) => x);
    const ys = ink.map(([, y]) => y);
    expect(
      xs.reduce((a, b) => Math.max(a, b)) - xs.reduce((a, b) => Math.min(a, b))
    ).toBeGreaterThanOrEqual(48);
    expect(
      ys.reduce((a, b) => Math.max(a, b)) - ys.reduce((a, b) => Math.min(a, b))
    ).toBeGreaterThanOrEqual(48);
    expect(
      ink.reduce((radius, [x, y]) => Math.max(radius, Math.hypot(x - 54, y - 54)), 0)
    ).toBeLessThanOrEqual(33);
  });

  it('documents the command that preserves the authored layer', () => {
    const { scripts, 'scripts-info': descriptions } = JSON.parse(read('package.json'));
    expect(scripts['gen:android:assets']).toBe(
      'capacitor-assets generate --android && node tools/mobile/android/gen-monochrome-icon.mjs'
    );
    expect(descriptions['gen:android:assets']).toContain(SOURCE);
    expect(read('docs/MOBILE/native.md')).toContain('npm run gen:android:assets');
    expect(read('docs/MOBILE/native.md')).not.toContain('@capacitor/assets generate --android');
  });
});
