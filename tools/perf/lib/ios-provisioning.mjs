import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';

export const WDA_BUNDLE_ID = 'art.splotch.WebDriverAgentRunner';
const PROFILE_BUFFER_BYTES = 4 * 1024 * 1024;
const PROFILE_DIR = join(homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles');
const SIGNING_CONFIG = join(ROOT, 'ios/local.xcconfig');

function plistField(plist, key, format = 'json') {
  const result = spawnSync('plutil', ['-extract', key, format, '-o', '-', '-'], {
    input: plist,
    encoding: 'utf8',
    maxBuffer: PROFILE_BUFFER_BYTES,
  });
  if (result.status !== 0) return null;
  if (format === 'raw') return result.stdout.trim();
  return JSON.parse(result.stdout);
}

function readProfile(path) {
  const decoded = spawnSync('security', ['cms', '-D', '-i', path], {
    encoding: 'utf8',
    maxBuffer: PROFILE_BUFFER_BYTES,
  });
  if (decoded.status !== 0) return null;
  const plist = decoded.stdout;
  return {
    teams: plistField(plist, 'TeamIdentifier'),
    appId: plistField(plist, 'Entitlements.application-identifier', 'raw'),
    devices: plistField(plist, 'ProvisionedDevices'),
    expires: plistField(plist, 'ExpirationDate', 'raw'),
  };
}

function profileMatches(profile, team, bundleId, now) {
  if (!Array.isArray(profile.teams) || !profile.teams.includes(team)) return false;
  if (typeof profile.appId !== 'string') return false;
  if (profile.expires && Date.parse(profile.expires) <= now) return false;
  const appId = `${team}.${bundleId}`;
  return profile.appId === appId || profile.appId === `${team}.*`;
}

export function iosProvisioningCheck({ udid, team, profiles, now = Date.now() }) {
  const matching = profiles.filter((profile) => profileMatches(profile, team, WDA_BUNDLE_ID, now));
  const remedy =
    'In Xcode → Settings → Apple Accounts, select the signing team, register this iPhone ' +
    'if needed, and refresh its development profile. The Apple account on the phone is unrelated.';
  if (matching.length === 0) {
    return {
      name: 'ios provisioning',
      status: 'blocked',
      detail: `no cached development profile for WebDriverAgent on team ${team}. ${remedy}`,
    };
  }
  if (
    !matching.some((profile) => Array.isArray(profile.devices) && profile.devices.includes(udid))
  ) {
    return {
      name: 'ios provisioning',
      status: 'blocked',
      detail: `this iPhone is absent from the cached WebDriverAgent development profile for team ${team}. ${remedy}`,
    };
  }
  return {
    name: 'ios provisioning',
    status: 'ok',
    detail: `this iPhone is included in a WebDriverAgent development profile for team ${team}`,
  };
}

export function checkIosProvisioning(udid) {
  if (!existsSync(SIGNING_CONFIG)) return null;
  const team = /^DEVELOPMENT_TEAM\s*=\s*([^\s#]+)/m.exec(readFileSync(SIGNING_CONFIG, 'utf8'))?.[1];
  if (!team) {
    return {
      name: 'ios provisioning',
      status: 'blocked',
      detail: 'ios/local.xcconfig has no DEVELOPMENT_TEAM',
    };
  }
  const paths = existsSync(PROFILE_DIR)
    ? readdirSync(PROFILE_DIR)
        .filter((name) => name.endsWith('.mobileprovision'))
        .map((name) => join(PROFILE_DIR, name))
    : [];
  return iosProvisioningCheck({ udid, team, profiles: paths.map(readProfile).filter(Boolean) });
}
