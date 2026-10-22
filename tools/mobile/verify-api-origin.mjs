import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IOS_PROJECT_NAME } from '../release/lib/native-app.mjs';

// Bounds extraction while allowing headroom above the complete app bytecode bundles.
const MAX_NATIVE_BUNDLE_BYTES = 64 * 1024 * 1024;

export function assertNativeApiOrigin(bundle, expectedOrigin, storeBuild) {
  const text = `${bundle.toString('utf8')}\n${bundle.toString('utf16le')}`;
  assert.ok(
    text.includes(expectedOrigin),
    'The native bundle does not contain its configured API origin'
  );
  if (storeBuild) {
    assert.ok(!text.includes('test.splotch.art'), 'A store native bundle contains the test host');
    const origins = [...new Set(text.match(/https:\/\/(?:[a-z0-9-]+\.)*splotch\.art/g))];
    assert.deepEqual(
      origins,
      ['https://splotch.art'],
      'A store native bundle contains a non-production first-party origin'
    );
  }
}

export function verifyNativeApiOrigin(artifact, expectedOrigin, storeBuild) {
  let bundle;
  if (/\.(?:aab|apk|ipa)$/.test(artifact)) {
    const entry = artifact.endsWith('.aab')
      ? 'base/assets/index.android.bundle'
      : artifact.endsWith('.apk')
        ? 'assets/index.android.bundle'
        : `Payload/${IOS_PROJECT_NAME}.app/main.jsbundle`;
    bundle = execFileSync('unzip', ['-p', artifact, entry], { maxBuffer: MAX_NATIVE_BUNDLE_BYTES });
  } else {
    const app = artifact.endsWith('.xcarchive')
      ? join(artifact, 'Products/Applications', `${IOS_PROJECT_NAME}.app`)
      : artifact;
    bundle = readFileSync(join(app, 'main.jsbundle'));
  }
  assertNativeApiOrigin(bundle, expectedOrigin, storeBuild);
}
