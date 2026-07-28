// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BETA_OPT_IN_URL,
  MIN_ANDROID_API_LEVEL,
  PLAY_STORE_APP_ID,
  PLAY_STORE_LISTING_URL,
  TESTERS_GROUP_URL,
} from './androidBeta';

describe('/android-beta facts', () => {
  it('states the Android floor Google Play actually enforces', () => {
    const gradle = readFileSync(
      new URL('../../../android/variables.gradle', import.meta.url),
      'utf8'
    );
    const minSdkVersion = Number(gradle.match(/minSdkVersion\s*=\s*(\d+)/)?.[1]);

    expect(
      minSdkVersion,
      'MIN_ANDROID_API_LEVEL must track android/variables.gradle — and when it moves, ' +
        'MIN_ANDROID_RELEASE (the platform release name shown to testers) moves with it'
    ).toBe(MIN_ANDROID_API_LEVEL);
  });

  it('points the group link at the testers group', () => {
    expect(TESTERS_GROUP_URL).toBe('https://groups.google.com/g/splotch-testers');
  });

  it('points both Play links at the same app', () => {
    expect(BETA_OPT_IN_URL).toContain(PLAY_STORE_APP_ID);
    expect(PLAY_STORE_LISTING_URL).toContain(PLAY_STORE_APP_ID);
  });
});
