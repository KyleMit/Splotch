import { closeSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  normalizeReleaseRigReport,
  renderReleaseRigReport,
  validateReleaseRigInputs,
  writeReleaseRigReport,
} from '../perf/ipad-release-report.mjs';
import { releaseRigPlan, validatePhysicalDeviceModel } from '../perf/ipad-release-rig.mjs';
import { renderReleaseRigIndex, writeReleaseRigIndex } from '../perf/ipad-release-index.mjs';
import {
  acquireJobLock,
  firstUnmeasuredReleaseTag,
  redactCommandArgs,
  scheduledRigPlan,
} from '../perf/ipad-release-rig-job.mjs';
import { releaseRigPlist } from '../install-ipad-release-rig.mjs';

const build = { appVersion: '1.4.500', buildTime: '2026-08-01 12:34' };
const device = { name: 'Kyle’s private iPad', os: '26.5', id: 'physical-private-udid' };

function row(key) {
  return {
    key,
    commits: 22,
    'commit max ms': 3,
    'undo p95 ms': 2,
    'history MiB': 59,
  };
}

function engineRun(keys) {
  return { build, device, rows: keys.map(row), console: [] };
}

function frameRun(mode = 'synthetic:mixed') {
  return {
    build,
    device,
    mode,
    summaries: {
      intervalMs: 16.67,
      phases: [
        {
          key: 'blank',
          contactSeconds: 25,
          pacing: { lostMs: 0 },
          paintLatencyMs: { p95: 16, p99: 24, max: 32 },
        },
      ],
    },
    console: [],
  };
}

function input(suite = 'fast') {
  const scenarios =
    suite === 'fast'
      ? ['multi-finger', 'crayon-scribbles']
      : ['long-squiggles', 'multi-finger', 'crayon-squiggles', 'crayon-scribbles'];
  return {
    metadata: {
      capturedAt: '2026-08-01T12:45:00.000Z',
      suite,
      repeats: 3,
      ...build,
      commit: 'a'.repeat(40),
      releaseTag: suite === 'full' ? 'v1.4.0' : undefined,
      device: { ...device, model: 'iPad13,8' },
    },
    engineRuns: Array.from({ length: 3 }, () => engineRun(scenarios)),
    frameRuns: suite === 'full' ? Array.from({ length: 3 }, () => frameRun()) : [],
  };
}

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('release-rig contract', () => {
  it('rejects a single-repeat run', () => {
    expect(() => validateReleaseRigInputs({ suite: 'fast', repeats: 1 })).toThrow(
      'single-repeat output is invalid'
    );
  });

  it('pins the fast and full scenario sets', () => {
    expect(validateReleaseRigInputs({ suite: 'fast', repeats: 3 }).scenarios).toEqual([
      'multi-finger',
      'crayon-scribbles',
    ]);
    expect(validateReleaseRigInputs({ suite: 'full', repeats: 3 }).scenarios).toHaveLength(4);
  });

  it('requires explicit physical-device provenance', () => {
    expect(() =>
      releaseRigPlan({ suite: 'fast', repeats: 3, deviceId: '', deviceModel: 'iPad13,8' })
    ).toThrow('simulator substitution is forbidden');
  });

  it('rejects configured model provenance that differs from the attached device', () => {
    expect(validatePhysicalDeviceModel('iPad13,8', 'iPad13,8')).toBe('iPad13,8');
    expect(() => validatePhysicalDeviceModel('iPad13,8', 'not-the-attached-model')).toThrow(
      'does not match configured model'
    );
    expect(() => validatePhysicalDeviceModel('', 'iPad13,8')).toThrow('did not report ProductType');
  });

  it('rejects partial, stale, uninstrumented, and hand-driven evidence', () => {
    const partial = input();
    partial.engineRuns[0].rows.pop();
    expect(() => normalizeReleaseRigReport(partial)).toThrow('covered');

    const stale = input();
    stale.engineRuns[1].build = { ...build, buildTime: '2026-08-01 12:33' };
    expect(() => normalizeReleaseRigReport(stale)).toThrow('stale build');

    const empty = input();
    empty.engineRuns[2].rows[0].commits = 0;
    expect(() => normalizeReleaseRigReport(empty)).toThrow('no commit samples');

    const hand = input('full');
    hand.frameRuns[0].mode = 'hand';
    expect(() => normalizeReleaseRigReport(hand)).toThrow('not unattended');
  });

  it('requires three full real-screen repeats', () => {
    const full = input('full');
    full.frameRuns.pop();
    expect(() => normalizeReleaseRigReport(full)).toThrow('Expected 3 real-screen repeats');
  });

  it('writes a Pages-ready report and normalized artifacts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'splotch-ipad-report-'));
    dirs.push(dir);
    const report = writeReleaseRigReport(input('full'), dir);
    expect(report.realScreen).toHaveLength(3);
    expect(renderReleaseRigReport(report)).toContain('Physical iPad release rig');
    expect(() => JSON.parse(readFileSync(join(dir, 'ipad-gates.json'), 'utf8'))).not.toThrow();
    expect(() => JSON.parse(readFileSync(join(dir, 'real-screen.json'), 'utf8'))).not.toThrow();
  });

  it('removes private hardware identity from every public artifact', () => {
    const dir = mkdtempSync(join(tmpdir(), 'splotch-ipad-private-report-'));
    dirs.push(dir);
    const report = writeReleaseRigReport(input('full'), dir);
    const publicOutput = [
      JSON.stringify(report),
      readFileSync(join(dir, 'ipad-gates.json'), 'utf8'),
      readFileSync(join(dir, 'real-screen.json'), 'utf8'),
      readFileSync(join(dir, 'index.html'), 'utf8'),
    ].join('\n');
    expect(publicOutput).not.toContain(device.name);
    expect(publicOutput).not.toContain(device.id);
    expect(report.metadata.device).toEqual({
      label: 'Splotch release iPad',
      model: 'iPad13,8',
      os: device.os,
    });
  });

  it('links the collection index back to the scrapbook root', () => {
    expect(renderReleaseRigIndex([])).toContain('href="../../index.html"');
  });

  it('writes the collection index without trailing whitespace', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'splotch-ipad-index-'));
    dirs.push(dir);
    await writeReleaseRigIndex(dir);
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).not.toMatch(/[ \t]+$/m);
  });
});

describe('scheduled push model', () => {
  it('states the weekly fast and release-tag full cadence', () => {
    expect(
      scheduledRigPlan({ cadence: 'fast', deviceId: device.id, deviceModel: 'iPad13,8' })
    ).toMatchObject({ suite: 'fast', trigger: 'weekly Sunday 03:00' });
    expect(
      scheduledRigPlan({ cadence: 'release', deviceId: device.id, deviceModel: 'iPad13,8' })
    ).toMatchObject({ suite: 'full', trigger: 'daily 04:00, unseen v* tag only' });
  });

  it('queues every unseen release tag oldest first', () => {
    const tags = [
      { name: 'v1.4.0', ref: 'refs/splotch-rig/tags/v1.4.0' },
      { name: 'v1.5.0', ref: 'refs/splotch-rig/tags/v1.5.0' },
      { name: 'v1.6.0', ref: 'refs/splotch-rig/tags/v1.6.0' },
    ];
    expect(firstUnmeasuredReleaseTag(tags, ['v1.4.0'])).toEqual(tags[1]);
    expect(firstUnmeasuredReleaseTag(tags, ['v1.4.0', 'v1.5.0'])).toEqual(tags[2]);
    expect(
      firstUnmeasuredReleaseTag(
        tags,
        tags.map(({ name }) => name)
      )
    ).toBeUndefined();
  });

  it('skips a live job lock and recovers a stale one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'splotch-ipad-lock-'));
    dirs.push(dir);
    const lockPath = join(dir, 'job.lock');
    writeFileSync(lockPath, `${process.pid}\n`);
    expect(acquireJobLock(lockPath)).toBeUndefined();

    unlinkSync(lockPath);
    writeFileSync(lockPath, '2147483647\n');
    const lock = acquireJobLock(lockPath);
    expect(Number(readFileSync(lockPath, 'utf8'))).toBe(process.pid);
    closeSync(lock);
  });

  it('generates outbound-only launchd jobs without secret material', () => {
    const plist = releaseRigPlist({
      cadence: 'fast',
      repo: '/Users/rig/Splotch',
      deviceId: device.id,
      deviceModel: 'iPad13,8',
      nodePath: '/opt/homebrew/bin/node',
      logDir: '/Users/rig/Library/Logs/Splotch',
    });
    expect(plist).toContain('<key>Weekday</key><integer>1</integer>');
    expect(plist).toContain('--cadence=fast');
    expect(plist).toContain('<key>Umask</key><integer>63</integer>');
    expect(plist).not.toMatch(/token|secret|password/i);
    expect(plist).not.toContain('NetworkState');
  });

  it('redacts the private device ID from persistent command logs', () => {
    const args = [
      'scripts/perf/ipad-release-rig.mjs',
      `--device-id=${device.id}`,
      '--device-model=iPad13,8',
    ];
    const logged = redactCommandArgs(args).join(' ');
    expect(logged).toContain('--device-id=<private-device>');
    expect(logged).not.toContain(device.id);
  });

  it('pins release polling to daily 04:00', () => {
    const plist = releaseRigPlist({
      cadence: 'release',
      repo: '/Users/rig/Splotch',
      deviceId: device.id,
      deviceModel: 'iPad13,8',
      nodePath: '/opt/homebrew/bin/node',
      logDir: '/Users/rig/Library/Logs/Splotch',
    });
    expect(plist).toContain(
      '<key>Hour</key><integer>4</integer><key>Minute</key><integer>0</integer>'
    );
    expect(plist).not.toContain('<key>Weekday</key>');
  });
});
