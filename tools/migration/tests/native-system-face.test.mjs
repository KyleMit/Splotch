import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const hubRowFace = read('experiments/native-architecture/src/rsdDrawing/hubRowFace.native.ts');
const application = read(
  'experiments/native-architecture/android/app/src/main/java/art/splotch/migration/probe/MainApplication.kt'
);

// The family the hub rows name natively, and the one Android registers as the system typeface.
const namedFamily = (source) => source.match(/fontFamily: '([^']+)'/)?.[1] ?? null;
const registeredFamily = (source) =>
  source.match(/private const val SYSTEM_UI_FONT_FAMILY = "([^"]+)"/)?.[1] ?? null;

// The body of onCreate: from its declaration to the next member at the same indent.
function onCreate(source) {
  const start = source.indexOf('override fun onCreate(');
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const end = rest.slice(1).search(/\n {2}override fun /);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

describe('the hub rows’ system face on Android', () => {
  it('registers the family the hub rows name, so it takes their semibold weight', () => {
    expect(namedFamily(hubRowFace)).toBe('system-ui');
    expect(registeredFamily(application)).toBe(namedFamily(hubRowFace));
    expect(onCreate(application)).toContain(
      'ReactFontManager.getInstance().addCustomFont(SYSTEM_UI_FONT_FAMILY, Typeface.DEFAULT)'
    );
  });

  it('fails when the two sides name different families', () => {
    const renamed = hubRowFace.replace("fontFamily: 'system-ui'", "fontFamily: 'ui-sans-serif'");
    expect(renamed).not.toBe(hubRowFace);
    expect(registeredFamily(application)).not.toBe(namedFamily(renamed));
  });
});
