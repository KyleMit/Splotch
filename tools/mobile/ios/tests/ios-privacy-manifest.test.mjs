import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8');
const privacyInventory = JSON.parse(read('tools/mobile/privacy-permission-inventory.json'));

const MANIFEST_PATH = 'ios/App/App/PrivacyInfo.xcprivacy';
const PROJECT_PATH = 'ios/App/App.xcodeproj/project.pbxproj';
const INFO_PATH = 'ios/App/App/Info.plist';

// A privacy manifest that exists on disk but isn't in the target's Resources
// build phase is not in the .ipa, and the upload still fails ITMS-91053 —
// with a file sitting right there that says otherwise. Xcode owns the pbxproj,
// so nothing but a test connects the two.
describe('iOS privacy manifest', () => {
  const manifest = read(MANIFEST_PATH);
  const project = read(PROJECT_PATH);
  const info = read(INFO_PATH);

  it('declares the app as non-tracking', () => {
    expect(manifest).toMatch(
      new RegExp(
        `<key>NSPrivacyTracking</key>\\s*<${privacyInventory.iosPrivacyManifest.tracking}/>`
      )
    );
    expect(privacyInventory.iosPrivacyManifest.trackingDomains).toEqual([]);
    expect(manifest).toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
  });

  it('matches the reviewed required-reason API inventory', () => {
    // @capacitor/preferences writes through UserDefaults.standard and ships no
    // manifest of its own, so the app target has to carry the declaration.
    const declarations = [
      ...manifest.matchAll(
        /<dict>\s*<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>([\s\S]*?)<\/dict>/g
      ),
    ]
      .map(([, category, body]) => ({
        category,
        reasons: [...body.matchAll(/<string>([^<]+)<\/string>/g)].map((match) => match[1]).sort(),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
    const expected = privacyInventory.iosPrivacyManifest.requiredReasonApis
      .map(({ category, reasons }) => ({ category, reasons: [...reasons].sort() }))
      .sort((a, b) => a.category.localeCompare(b.category));

    expect(declarations).toEqual(expected);
  });

  it('declares the complete collected-data set as unlinked, non-tracking app functionality', () => {
    const declaredDataTypes = [
      ...manifest.matchAll(
        /<string>(NSPrivacyCollectedDataType(?!Purpose)[^<]+)<\/string>/g
      ),
    ]
      .map((match) => match[1])
      .sort();

    const expectedDataTypes = privacyInventory.dataCategories.map(({ iosType }) => iosType).sort();
    expect(declaredDataTypes).toEqual(expectedDataTypes);

    for (const category of privacyInventory.dataCategories) {
      const declaration = manifest.match(
        new RegExp(
          `<dict>\\s*<key>NSPrivacyCollectedDataType</key>\\s*<string>${category.iosType}</string>[\\s\\S]*?</dict>`
        )
      )?.[0];

      expect(declaration, category.id).toBeDefined();
      expect(declaration, category.id).toMatch(
        new RegExp(
          `<key>NSPrivacyCollectedDataTypeLinked</key>\\s*<${category.linked}/>`
        )
      );
      expect(declaration, category.id).toMatch(
        new RegExp(
          `<key>NSPrivacyCollectedDataTypeTracking</key>\\s*<${category.tracking}/>`
        )
      );
      const purposes = [
        ...declaration.matchAll(/<string>(NSPrivacyCollectedDataTypePurpose[^<]+)<\/string>/g),
      ].map((match) => match[1]);
      expect(purposes, category.id).toEqual(category.iosPurposes);
    }
  });

  it('matches the reviewed iOS permission usage descriptions', () => {
    const descriptions = Object.fromEntries(
      [...info.matchAll(/<key>(NS[^<]+UsageDescription)<\/key>\s*<string>([^<]+)<\/string>/g)].map(
        ([, key, value]) => [key, value]
      )
    );
    const expected = Object.fromEntries(
      privacyInventory.permissions.iosUsageDescriptions.map(({ key, value }) => [key, value])
    );

    expect(descriptions).toEqual(expected);
  });

  it('opens and closes a single plist dict', () => {
    expect(manifest).toContain('<!DOCTYPE plist');
    expect(manifest.match(/<dict>/g)?.length).toBe(manifest.match(/<\/dict>/g)?.length);
    expect(manifest.trimEnd().endsWith('</plist>')).toBe(true);
  });

  it('is referenced by the Xcode project and copied into the bundle', () => {
    expect(project).toContain('PrivacyInfo.xcprivacy */ = {isa = PBXFileReference');
    expect(project).toContain('PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile');

    const resourcesPhase = project.slice(
      project.indexOf('/* Begin PBXResourcesBuildPhase section */'),
      project.indexOf('/* End PBXResourcesBuildPhase section */')
    );
    expect(resourcesPhase).toContain('PrivacyInfo.xcprivacy in Resources');
  });
});
