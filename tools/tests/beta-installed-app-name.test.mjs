import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const candidate = new URL('../../experiments/native-architecture/', import.meta.url);
const config = JSON.parse(readFileSync(new URL('app.json', candidate), 'utf8'));

function installedNames(android, ios) {
  return [
    android.match(/<string name="app_name">([^<]+)<\/string>/)?.[1],
    ios.match(/<key>CFBundleDisplayName<\/key>\s*<string>([^<]+)<\/string>/)?.[1],
  ];
}

describe('beta installed app identity', () => {
  it('uses the product name in Expo and both native launchers', () => {
    const android = readFileSync(
      new URL('android/app/src/main/res/values/strings.xml', candidate),
      'utf8'
    );
    const ios = readFileSync(new URL('ios/HelloWorld/Info.plist', candidate), 'utf8');
    expect(config.expo.name).toBe('Splotch');
    expect(installedNames(android, ios)).toEqual([config.expo.name, config.expo.name]);
  });

  it('detects a template label on either native platform', () => {
    expect(
      installedNames(
        '<resources><string name="app_name">Hello App Display Name</string></resources>',
        '<dict><key>CFBundleDisplayName</key><string>HelloWorld</string></dict>'
      )
    ).not.toContain(config.expo.name);
  });
});
