import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NATIVE_WEB_EXPORT_ENV } from '../migration/build-native-web.mjs';
import { ROOT } from '../lib/proc.mjs';

const APP_DIR = join(ROOT, 'experiments/native-architecture');
const SERIALIZERS = join(
  ROOT,
  'node_modules/@expo/metro-config/build/serializer/withExpoSerializers.js'
);
const METRO_OPTIONS = join(
  ROOT,
  'node_modules/@expo/cli/build/src/start/server/middleware/metroOptions.js'
);
// The files Gradle and Xcode read when they bundle the app's JavaScript through expo export:embed.
const NATIVE_BUNDLE_INPUTS = [
  'android/gradle.properties',
  'android/app/build.gradle',
  'ios/.xcode.env',
  'ios/HelloWorld.xcodeproj/project.pbxproj',
];

function granularEligibility(serializerSource) {
  return /const isGranularEligible = ([^;]+);/.exec(serializerSource)?.[1] ?? '';
}

function readsFromProcessEnv(metroOptionsSource, name) {
  return metroOptionsSource.includes(`_env.env.${name}`);
}

describe('the web export’s bundler levers stay off the native bundles', () => {
  it('turns on Expo’s tree shaking in the web export’s own process, where Expo reads it', () => {
    expect(NATIVE_WEB_EXPORT_ENV).toEqual({
      EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH: '1',
      EXPO_UNSTABLE_TREE_SHAKING: '1',
    });
    const options = readFileSync(METRO_OPTIONS, 'utf8');
    for (const name of Object.keys(NATIVE_WEB_EXPORT_ENV))
      expect(readsFromProcessEnv(options, name)).toBe(true);
    expect(
      readsFromProcessEnv('const optimize = props.optimize;', 'EXPO_UNSTABLE_TREE_SHAKING')
    ).toBe(false);
    for (const input of NATIVE_BUNDLE_INPUTS)
      expect(readFileSync(join(APP_DIR, input), 'utf8')).not.toContain('EXPO_UNSTABLE_');
  });

  it('asks for granular chunking, which Expo applies to a web client export only', () => {
    const config = JSON.parse(readFileSync(join(APP_DIR, 'app.json'), 'utf8'));
    expect(config.expo.experiments.chunking).toEqual({ mode: 'granular' });
    const eligibility = granularEligibility(readFileSync(SERIALIZERS, 'utf8'));
    expect(eligibility).toContain("context.platform === 'web'");
    expect(eligibility).toContain('customSerializerOptions.exporting');
    expect(
      granularEligibility(
        "const isGranularEligible = customSerializerOptions?.chunkingStrategy === 'granular';"
      )
    ).not.toContain("context.platform === 'web'");
  });
});
