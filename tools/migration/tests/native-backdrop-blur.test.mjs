import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRAWING_THEMES } from '../../../experiments/native-architecture/src/drawing/theme.ts';

const APP = join(import.meta.dirname, '../../../experiments/native-architecture');
const read = (path) => readFileSync(join(APP, path), 'utf8');
const JS = read('src/platform/backdropBlur.tsx');
const SWIFT = read('ios/HelloWorld/SplotchBackdropBlur.swift');
const OBJC = read('ios/HelloWorld/SplotchBackdropBlur.m');
const PROJECT = read('ios/HelloWorld.xcodeproj/project.pbxproj');

const sorted = (values) => [...new Set(values)].sort();
const jsKeys = () =>
  sorted(
    [...JS.match(/type BackdropBlurTransition = Readonly<\{([^}]*)\}>/)[1].matchAll(/(\w+):/g)].map(
      (match) => match[1]
    )
  );

// The blur view's name and its one prop cross from TypeScript into Swift, which shares no code
// with it, so each side is read here.
describe('the native backdrop blur view', () => {
  it('is registered under the name the JavaScript requires', () => {
    const name = JS.match(/requireNativeComponent<[^>]*>\(\s*'(\w+)'/)[1];
    expect(OBJC).toContain(`RCT_EXTERN_MODULE(${name}Manager, RCTViewManager)`);
    expect(OBJC).toContain('RCT_EXPORT_VIEW_PROPERTY(blur, NSDictionary)');
    expect(SWIFT).toContain(`@objc(${name}Manager)`);
    for (const file of ['SplotchBackdropBlur.swift', 'SplotchBackdropBlur.m'])
      expect(PROJECT).toContain(`/* ${file} in Sources */,`);
  });

  it('reads only the transition keys the JavaScript sends', () => {
    expect(jsKeys()).toEqual(['durationMs', 'easing', 'radius', 'theme']);
    const swift = sorted([...SWIFT.matchAll(/blur\?\["(\w+)"\]/g)].map((match) => match[1]));
    expect(swift).toEqual(jsKeys());
  });

  it('keeps an iOS blur style for every paper theme', () => {
    const styles = SWIFT.match(/styles: \[String: [^\]]*\] = \[([\s\S]*?)\n {2}\]/)[1];
    const themes = sorted([...styles.matchAll(/"(\w+)": \(/g)].map((match) => match[1]));
    expect(themes).toEqual(sorted(Object.keys(DRAWING_THEMES)));
  });
});
