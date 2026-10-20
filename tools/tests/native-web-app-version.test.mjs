import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { buildMetadataOncePerProcess } from '../../web/buildVersion.ts';
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
