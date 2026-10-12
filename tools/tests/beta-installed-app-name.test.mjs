import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BETA_APP_NAME,
  transformTemplateMember,
} from '../migration/lib/native-template-transforms.mjs';
import { readTemplateManifest } from '../migration/lib/native-template.mjs';

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
    expect(BETA_APP_NAME).toBe('Splotch');
    expect(config.expo.name).toBe(BETA_APP_NAME);
    expect(installedNames(android, ios)).toEqual([config.expo.name, config.expo.name]);
  });

  it('replays launcher names from verified template preimages and rejects changed preimages', () => {
    const manifest = readTemplateManifest(new URL('../../', import.meta.url).pathname);
    const paths = [
      'package/android/app/src/main/res/values/strings.xml',
      'package/ios/HelloWorld/Info.plist',
    ];
    const originals = paths.map(
      (path) => manifest.members.find((member) => member.path === path).originalText
    );
    const transformed = originals.map((original, index) =>
      transformTemplateMember(paths[index], Buffer.from(original)).bytes.toString()
    );
    expect(installedNames(...transformed)).toEqual(['Splotch', 'Splotch']);
    expect(() =>
      transformTemplateMember(
        paths[0],
        Buffer.from(originals[0].replace('Hello App Display Name', 'Changed'))
      )
    ).toThrow('launcher name');
    expect(() =>
      transformTemplateMember(
        paths[1],
        Buffer.from(
          originals[1].replace(
            '<key>CFBundleExecutable</key>',
            '<key>CFBundleDisplayName</key><string>Changed</string><key>CFBundleExecutable</key>'
          )
        )
      )
    ).toThrow('display name already exists');
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
