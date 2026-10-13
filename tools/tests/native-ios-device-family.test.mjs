import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const SHIPPING_PROJECT = 'ios/App/App.xcodeproj/project.pbxproj';
const NATIVE_PROJECT = 'experiments/native-architecture/ios/HelloWorld.xcodeproj/project.pbxproj';
const SHIPPING_PLIST = 'ios/App/App/Info.plist';
const NATIVE_PLIST = 'experiments/native-architecture/ios/HelloWorld/Info.plist';
const ORIENTATION_KEYS = ['UISupportedInterfaceOrientations', 'UISupportedInterfaceOrientations~ipad'];

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
  return match ? [...match[1].matchAll(/<string>([^<]+)<\/string>/g)].map((entry) => entry[1]) : null;
}

describe('native iOS device family', () => {
  it('builds the app target for the same devices as the shipping app', () => {
    const shipping = new Set(deviceFamilies(read(SHIPPING_PROJECT)));
    expect([...shipping]).toEqual(['1,2']);
    const targets = appTargetConfigurations(read(NATIVE_PROJECT));
    expect(targets).toHaveLength(2);
    for (const block of targets) expect(deviceFamilies(block)).toEqual([...shipping]);
  });

  it.each(ORIENTATION_KEYS)('declares the shipping %s', (key) => {
    const shipping = orientations(read(SHIPPING_PLIST), key);
    expect(shipping).not.toBeNull();
    expect(orientations(read(NATIVE_PLIST), key)).toEqual(shipping);
  });

  it('reads no family from a project that omits the setting', () => {
    const block = 'isa = XCBuildConfiguration;\nINFOPLIST_FILE = A/Info.plist;\nname = Debug;';
    expect(deviceFamilies(block)).toEqual([]);
    expect(appTargetConfigurations(block)).toHaveLength(1);
  });
});
