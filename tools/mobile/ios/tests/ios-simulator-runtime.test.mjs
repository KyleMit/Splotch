import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  availableIphonesByNewestRuntime,
  iosRuntimeIdentifier,
  selectIphoneSimulator,
} from '../lib/ios-simulator-runtime.mjs';
import { iosDeploymentTarget } from '../print-simulator-floor.mjs';

const read = (path) => readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');
const IOS_16_4 = iosRuntimeIdentifier('16.4');
const IOS_18_5 = iosRuntimeIdentifier('18.5');
const devices = {
  [IOS_16_4]: [
    { name: 'iPhone SE (3rd generation)', udid: 'floor-shutdown', state: 'Shutdown' },
    { name: 'iPad (10th generation)', udid: 'floor-ipad', state: 'Booted' },
  ],
  [IOS_18_5]: [
    { name: 'iPhone 16', udid: 'current-shutdown', state: 'Shutdown' },
    { name: 'iPhone 16 Pro', udid: 'current-booted', state: 'Booted' },
  ],
};

describe('iOS simulator runtime selection', () => {
  it('keeps the default newest-runtime ordering and reuses a booted iPhone', () => {
    expect(availableIphonesByNewestRuntime(devices).map((device) => device.udid)).toEqual([
      'current-shutdown',
      'current-booted',
      'floor-shutdown',
    ]);
    expect(selectIphoneSimulator(devices).udid).toBe('current-booted');
  });

  it('restricts both booted reuse and fallback selection to an explicit runtime', () => {
    expect(selectIphoneSimulator(devices, '16.4')).toMatchObject({
      runtime: IOS_16_4,
      udid: 'floor-shutdown',
    });
    expect(selectIphoneSimulator(devices, '17.0')).toBeUndefined();
  });
});

describe('iOS simulator floor source', () => {
  it('reads one uniform deployment target from the Xcode project', () => {
    const project = read('ios/App/App.xcodeproj/project.pbxproj');
    expect(iosDeploymentTarget(project)).toBe('16.4');
  });

  it('rejects missing and divergent deployment targets', () => {
    expect(() => iosDeploymentTarget('')).toThrow('No IPHONEOS_DEPLOYMENT_TARGET');
    expect(() =>
      iosDeploymentTarget(
        'IPHONEOS_DEPLOYMENT_TARGET = 16.4;\nIPHONEOS_DEPLOYMENT_TARGET = 17.0;'
      )
    ).toThrow('multiple iOS deployment targets: 16.4, 17.0');
  });
});

describe('iOS floor workflow', () => {
  const workflow = read('.github/workflows/ios-deploy.yml');

  it('keeps the newest runtime leg and adds a floor leg on macOS 15 with Xcode 16.4', () => {
    expect(workflow).toContain('runner: macos-latest');
    expect(workflow).toContain('runner: macos-15');
    expect(workflow).toContain(
      'developer_dir: /Applications/Xcode_16.4.app/Contents/Developer'
    );
  });

  it('derives and downloads the declared floor only for the floor leg', () => {
    expect(workflow).toContain('node tools/mobile/ios/print-simulator-floor.mjs');
    expect(workflow).toContain('xcodebuild -downloadPlatform iOS -buildVersion "$runtime"');
    expect(workflow.match(/if: \$\{\{ matrix\.floor \}\}/g)).toHaveLength(2);
  });

  it('passes the explicit runtime only to the floor leg', () => {
    expect(workflow).toContain('if [[ "${{ matrix.floor }}" == "true" ]]');
    expect(workflow).toContain('args+=(--runtime "${{ steps.runtime.outputs.version }}")');
    expect(workflow).toContain('npm run test:ios -- "${args[@]}"');
  });
});
