import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8');

const MANIFEST_PATH = 'ios/App/App/PrivacyInfo.xcprivacy';
const PROJECT_PATH = 'ios/App/App.xcodeproj/project.pbxproj';

const EXPECTED_COLLECTED_DATA_TYPES = [
  'NSPrivacyCollectedDataTypeCustomerSupport',
  'NSPrivacyCollectedDataTypeDeviceID',
  'NSPrivacyCollectedDataTypeOtherDiagnosticData',
  'NSPrivacyCollectedDataTypeOtherUserContent',
  'NSPrivacyCollectedDataTypeProductInteraction',
];

// A privacy manifest that exists on disk but isn't in the target's Resources
// build phase is not in the .ipa, and the upload still fails ITMS-91053 —
// with a file sitting right there that says otherwise. Xcode owns the pbxproj,
// so nothing but a test connects the two.
describe('iOS privacy manifest', () => {
  const manifest = read(MANIFEST_PATH);
  const project = read(PROJECT_PATH);

  it('declares the app as non-tracking', () => {
    expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(manifest).toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
  });

  it('declares a reason for the UserDefaults required-reason API', () => {
    // @capacitor/preferences writes through UserDefaults.standard and ships no
    // manifest of its own, so the app target has to carry the declaration.
    expect(manifest).toContain('NSPrivacyAccessedAPICategoryUserDefaults');
    expect(manifest).toMatch(/<string>CA92\.1<\/string>/);
  });

  it('declares the complete collected-data set as unlinked, non-tracking app functionality', () => {
    const declaredDataTypes = [
      ...manifest.matchAll(
        /<string>(NSPrivacyCollectedDataType(?!Purpose)[^<]+)<\/string>/g
      ),
    ]
      .map((match) => match[1])
      .sort();

    expect(declaredDataTypes).toEqual(EXPECTED_COLLECTED_DATA_TYPES);

    for (const dataType of EXPECTED_COLLECTED_DATA_TYPES) {
      const declaration = manifest.match(
        new RegExp(
          `<dict>\\s*<key>NSPrivacyCollectedDataType</key>\\s*<string>${dataType}</string>[\\s\\S]*?</dict>`
        )
      )?.[0];

      expect(declaration, dataType).toBeDefined();
      expect(declaration, dataType).toMatch(
        /<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<false\/>/
      );
      expect(declaration, dataType).toMatch(
        /<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<false\/>/
      );
      expect(declaration, dataType).toContain(
        'NSPrivacyCollectedDataTypePurposeAppFunctionality'
      );
    }
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
