import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const NATIVE_PROJECT = 'ios/Splotch.xcodeproj/project.pbxproj';
const NATIVE_PLIST = 'ios/Splotch/Info.plist';
const IPHONE_AND_IPAD = '1,2';
const ORIENTATIONS = {
  UISupportedInterfaceOrientations: [
    'UIInterfaceOrientationPortrait',
    'UIInterfaceOrientationLandscapeLeft',
    'UIInterfaceOrientationLandscapeRight',
  ],
  'UISupportedInterfaceOrientations~ipad': [
    'UIInterfaceOrientationPortrait',
    'UIInterfaceOrientationPortraitUpsideDown',
    'UIInterfaceOrientationLandscapeLeft',
    'UIInterfaceOrientationLandscapeRight',
  ],
};

function deviceFamilies(pbxproj) {
  return [...pbxproj.matchAll(/TARGETED_DEVICE_FAMILY = "?([\d,]+)"?;/g)].map((match) => match[1]);
}

// The app target's Debug and Release configurations are the ones that name an Info.plist.
function appTargetConfigurations(pbxproj) {
  return pbxproj
    .split(/isa = XCBuildConfiguration;/)
    .slice(1)
    .filter((block) => /INFOPLIST_FILE = /.test(block.split(/name = (?:Debug|Release);/)[0]));
}

function orientations(plist, key) {
  const escaped = key.replace(/[~]/g, '\\$&');
  const match = plist.match(new RegExp(`<key>${escaped}</key>\\s*<array>([\\s\\S]*?)</array>`));
  return match
    ? [...match[1].matchAll(/<string>([^<]+)<\/string>/g)].map((entry) => entry[1])
    : null;
}

describe('native iOS device family', () => {
  it('builds the app target for iPhone and iPad', () => {
    const targets = appTargetConfigurations(read(NATIVE_PROJECT));
    expect(targets).toHaveLength(2);
    for (const block of targets) expect(deviceFamilies(block)).toEqual([IPHONE_AND_IPAD]);
  });

  it.each(Object.entries(ORIENTATIONS))('declares %s', (key, expected) => {
    expect(orientations(read(NATIVE_PLIST), key)).toEqual(expected);
  });

  it('reads no family from a project that omits the setting', () => {
    const block = 'isa = XCBuildConfiguration;\nINFOPLIST_FILE = A/Info.plist;\nname = Debug;';
    expect(deviceFamilies(block)).toEqual([]);
    expect(appTargetConfigurations(block)).toHaveLength(1);
  });
});
