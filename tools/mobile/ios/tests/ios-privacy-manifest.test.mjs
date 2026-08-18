import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8');
const compact = (value) => value.replace(/\s+/g, ' ');

const MANIFEST_PATH = 'ios/App/App/PrivacyInfo.xcprivacy';
const PROJECT_PATH = 'ios/App/App.xcodeproj/project.pbxproj';
const IOS_LISTING_PATH = 'store-assets/STORE-LISTING-IOS.md';
const ANDROID_LISTING_PATH = 'store-assets/STORE-LISTING-ANDROID.md';
const PRIVACY_PAGE_PATH = 'web/src/routes/privacy/+page.svelte';
const FREE_GENERATIONS_PATH = 'web/src/lib/freeGenerations.ts';
const AI_LIMITS_PATH = 'web/src/lib/ai/limits.ts';
const IMAGE_REPORT_PATH = 'web/src/lib/imageReport.ts';
const NATIVE_DOC_PATH = 'docs/MOBILE/native.md';
const API_DOC_PATH = 'docs/API.md';

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
  const iosListing = read(IOS_LISTING_PATH);
  const androidListing = read(ANDROID_LISTING_PATH);
  const privacyPage = read(PRIVACY_PAGE_PATH);
  const freeGenerations = read(FREE_GENERATIONS_PATH);
  const aiLimits = read(AI_LIMITS_PATH);
  const imageReport = read(IMAGE_REPORT_PATH);
  const nativeDoc = read(NATIVE_DOC_PATH);
  const apiDoc = read(API_DOC_PATH);

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

  it('keeps the store declarations and parent-facing policy aligned with the manifest', () => {
    expect(iosListing).toContain('**User Content → Customer Support**');
    expect(iosListing).toContain('**Identifiers → Device ID**');
    expect(iosListing).toContain('**Usage Data → Product Interaction**');
    expect(androidListing).toContain('**Device or other IDs**');
    expect(androidListing).toContain('**App activity → App interactions**');
    expect(compact(privacyPage)).toContain('platform-provided app or vendor identifier');
    expect(compact(privacyPage)).toContain('attempt and success counts');
  });

  it('derives driftable privacy claims from their implementation constants', () => {
    const freeLimit = freeGenerations.match(/FREE_GENERATION_LIMIT = (\d+)/)?.[1];
    const reportDays = imageReport.match(/IMAGE_REPORT_RETENTION_DAYS = (\d+)/)?.[1];
    const jobMinutes = aiLimits.match(
      /GENERATION_JOB_TTL_MS = (\d+) \* 60 \* 1000/
    )?.[1];

    expect(freeLimit).toBeDefined();
    expect(reportDays).toBeDefined();
    expect(jobMinutes).toBeDefined();
    expect(privacyPage).toContain('FREE_GENERATION_LIMIT');
    expect(privacyPage).toContain('IMAGE_REPORT_RETENTION_DAYS');
    expect(privacyPage).toContain('GENERATION_JOB_TTL_MS');
    expect(iosListing).toContain(`up to ${freeLimit} free creations`);
    expect(androidListing).toContain(`up to ${freeLimit} free creations`);
    expect(iosListing).toContain(`after ${reportDays} days`);
    expect(androidListing).toContain(`after ${reportDays} days`);
    expect(compact(nativeDoc)).toContain(`expire after ${jobMinutes} minutes`);
    expect(compact(apiDoc)).toContain(`expires after ${jobMinutes} minutes`);
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
