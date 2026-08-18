// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MIN_IOS_RELEASE,
  TESTFLIGHT_APP_URL,
  TESTFLIGHT_INVITE_CODE,
  TESTFLIGHT_INVITE_URL,
} from './iosBeta';

describe('/beta iOS facts', () => {
  it('states the iOS floor the Xcode project actually enforces', () => {
    const project = readFileSync(
      new URL('../../../../../ios/App/App.xcodeproj/project.pbxproj', import.meta.url),
      'utf8'
    );
    const deploymentTargets = [...project.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map(
      (match) => match[1]
    );

    expect(deploymentTargets.length).toBeGreaterThan(0);
    expect(new Set(deploymentTargets)).toEqual(new Set([MIN_IOS_RELEASE]));
  });

  it('keeps the shared native support matrix on the deployment floor', () => {
    const guide = readFileSync(
      new URL('../../../../../docs/MOBILE/native.md', import.meta.url),
      'utf8'
    );
    const documentedFloor = guide.match(/\| iOS floor\s+\| iOS ([\d.]+) on/)?.[1];

    expect(documentedFloor).toBe(MIN_IOS_RELEASE);
  });

  it('keeps the published Splotch invitation code', () => {
    expect(TESTFLIGHT_INVITE_CODE).toBe('9GRH3JNQ');
  });

  it('builds the public invitation from its one invite code', () => {
    expect(TESTFLIGHT_INVITE_URL).toBe(
      `https://testflight.apple.com/join/${TESTFLIGHT_INVITE_CODE}`
    );
  });

  it('links to Apple for both TestFlight enrollment steps', () => {
    expect(new URL(TESTFLIGHT_INVITE_URL).host).toBe('testflight.apple.com');
    expect(new URL(TESTFLIGHT_APP_URL).host).toBe('apps.apple.com');
  });
});
