import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { buildMetadataOncePerProcess, deriveWebVersion } from '../../web/buildVersion.ts';
import { isWhatsNewSeen } from '../../experiments/native-architecture/src/settings/whatsNewStamp.ts';
import { parseSoundSettings } from '../../experiments/native-architecture/src/settings/soundSettingsCodec.ts';
import { webVersionHeadTag } from '../migration/build-native-web.mjs';
import { FEEDBACK_APP_VERSION } from '../../experiments/native-architecture/src/feedback/feedbackCopy.ts';

const WEB_APP_VERSION = join(
  import.meta.dirname,
  '../../experiments/native-architecture/src/platform/appVersion.web.ts'
);

// A document head holding exactly the tags given, answering `meta[name="…"]` as a browser does.
function headWith(...tags) {
  const metas = tags.map((tag) => ({
    name: /name="([^"]*)"/.exec(tag)?.[1],
    content: /content="([^"]*)"/.exec(tag)?.[1],
  }));
  return {
    querySelector: (selector) =>
      metas.find((meta) => selector === `meta[name="${meta.name}"]`) ?? null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

// Shipping web shows deriveWebVersion's major.minor.<commit count>; the RN web export writes the
// same derivation into its version meta, and every place RN web shows or reports the version reads
// it from there (#3008). Negative control: an appVersion.web.ts that returns the package version
// fails the first test.
it('shows and reports the version the export writes, derived as shipping web derives it', async () => {
  const { appVersion } = buildMetadataOncePerProcess({ isCapacitor: false, env: {} });
  expect(appVersion).toMatch(/^\d+\.\d+\.\d+$/);
  expect(appVersion).not.toBe(FEEDBACK_APP_VERSION);
  vi.stubGlobal('document', headWith(webVersionHeadTag(appVersion)));
  const { APP_VERSION } = await import(WEB_APP_VERSION);
  expect(APP_VERSION).toBe(appVersion);
});

it('falls back to the package version only where no export wrote the meta', async () => {
  vi.stubGlobal('document', headWith());
  const { APP_VERSION } = await import(WEB_APP_VERSION);
  expect(APP_VERSION).toBe(FEEDBACK_APP_VERSION);
});

// A saved settings record carries the What's New stamp, so the codec must accept every version a
// web build can stamp, deriveWebVersion's fallbacks included, or a parent's settings would fail to
// load after opening What's New. Negative control: the former x.y.z-only stamp rejects the SHA
// fallback here.
const SAVED_SETTINGS =
  '{"version":16,"soundEnabled":true,"strokeWidth":"medium","eraserWidth":"medium","appearance":"system","aiEnabled":false,"parentPolicies":{"ai":"always","imageReport":"always","externalLinks":"always","feedback":"always","parentCenter":"always"},"coloringBookEnabled":true,"soundVolume":50,"drawingSoundEnabled":true,"deleteSoundEnabled":true,"undoButtonEnabled":true,"strokeWidthControlEnabled":true,"orientation":"portrait","saveOnDeleteEnabled":false,"buttonScale":100,"reduceMotion":"system","whatsNewSeen":null,"pencilEraserEnabled":true,"applePencilSeen":false,"toolbarStyle":"buttons","toolDrawerEnabled":true,"screenshotEnabled":true,"aiCustomizationEnabled":true,"autoSaveAiEnabled":false}';

it.each([
  ['a release tag', { describe: 'v1.6.0-45-gabc1234', sha: 'abc1234' }],
  ['no tags, the SHA fallback', { describe: undefined, sha: 'abc1234' }],
  ['no git at all', { describe: undefined, sha: undefined }],
])("saves and reloads What's New as seen for a web build with %s", (_, git) => {
  const version = deriveWebVersion({
    packageVersion: FEEDBACK_APP_VERSION,
    runGit: (args) => (args.startsWith('describe') ? git.describe : git.sha),
  });
  expect(isWhatsNewSeen(version)).toBe(true);
  const saved = JSON.stringify({ ...JSON.parse(SAVED_SETTINGS), whatsNewSeen: version });
  expect(parseSoundSettings(saved)).toMatchObject({ whatsNewSeen: version });
});
