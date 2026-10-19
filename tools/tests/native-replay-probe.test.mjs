import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PERF_LINE_VERSION,
  PERF_LOG_MODULE,
  PERF_LOG_TAG,
} from '../../experiments/native-architecture/src/drawing/perfCohort.ts';
import {
  REPLAY_LAUNCH_KEY,
  REPLAY_MODULE,
  REPLAY_SETTLE_MS,
  REPLAY_TRACE_NAMES,
} from '../../experiments/native-architecture/src/drawing/replayTrace.ts';
import { traceFile } from '../migration/gen-replay-traces.mjs';

const ROOT = join(import.meta.dirname, '../..');
const APP = 'experiments/native-architecture/';
const ANDROID = `${APP}android/app/src/main/java/art/splotch/migration/probe/`;
const IOS = `${APP}ios/HelloWorld/`;
const CONTEXT = {
  platform: 'ios',
  build: 'abc1234',
  clockJoin: { clock: 'mach_absolute_time', errorMs: 0 },
};
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const host = vi.hoisted(() => ({ modules: {}, touched: [] }));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove() {} }) },
  NativeModules: new Proxy(
    {},
    {
      get: (_target, name) => {
        host.touched.push(name);
        return host.modules[name];
      },
    }
  ),
}));

// A native driver that emits every packet exactly on time.
function nativeReplay(requested, report = null) {
  return {
    requestedTrace: vi.fn(async () => requested),
    start: vi.fn(async (_name, packets) => {
      const sent = JSON.parse(packets);
      return (
        report ?? {
          packets: sent.length,
          delivered: sent.length,
          traceMs: sent.at(-1).t,
          durationMs: sent.at(-1).t,
          latenessMs: sent.map((_, index) => index % 10),
        }
      );
    }),
  };
}

async function replay(module) {
  host.modules = { [REPLAY_MODULE]: module };
  const { replayRequestedTrace } =
    await import('../../experiments/native-architecture/src/drawing/perfReplay.ts');
  const lines = [];
  await replayRequestedTrace((line) => lines.push(JSON.parse(line)), CONTEXT);
  return lines;
}

beforeEach(() => {
  host.modules = {};
  host.touched.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('replayRequestedTrace', () => {
  it('does nothing when the launch named no trace', async () => {
    const module = nativeReplay(null);
    expect(await replay(module)).toEqual([]);
    expect(module.requestedTrace).toHaveBeenCalledWith(REPLAY_LAUNCH_KEY);
    expect(module.start).not.toHaveBeenCalled();
  });

  // Negative control: sending the trace object instead of its packets fails the payload check.
  it('hands the named trace to the driver and writes one line of how faithfully it ran', async () => {
    const module = nativeReplay('two-contact');
    const lines = await replay(module);
    const trace = JSON.parse(readFileSync(traceFile('two-contact'), 'utf8'));
    expect(module.start).toHaveBeenCalledWith(
      'two-contact',
      JSON.stringify(trace.packets),
      REPLAY_SETTLE_MS
    );
    expect(lines).toEqual([
      {
        probe: PERF_LOG_TAG,
        v: PERF_LINE_VERSION,
        build: 'abc1234',
        platform: 'ios',
        replay: 'two-contact',
        timing: 'generated',
        packets: trace.packets.length,
        delivered: trace.packets.length,
        traceMs: Math.round(trace.packets.at(-1).t * 100) / 100,
        durationMs: Math.round(trace.packets.at(-1).t * 100) / 100,
        emissionLateness: {
          n: trace.packets.length,
          p50Ms: 4,
          p95Ms: 9,
          maxMs: 9,
          minMs: 0,
          maxAtMs: Math.round(trace.packets[9].t * 100) / 100,
        },
      },
    ]);
  });

  it.each([
    ['an unknown trace', nativeReplay('scribble'), /No replay trace is named scribble/],
    [
      'a report of another trace',
      nativeReplay('long-no-lift', {
        packets: 3,
        delivered: 3,
        traceMs: 1,
        durationMs: 1,
        latenessMs: [0, 0, 0],
      }),
      /reported 3 of 2401 packets/,
    ],
    [
      'a malformed report',
      nativeReplay('long-no-lift', {
        packets: 3,
        delivered: 4,
        traceMs: 1,
        durationMs: 1,
        latenessMs: [],
      }),
      /malformed/,
    ],
    [
      'a driver that cannot find the paper',
      {
        requestedTrace: async () => 'long-no-lift',
        start: async () => {
          throw new Error('No laid-out paper input view appeared');
        },
      },
      /No laid-out paper/,
    ],
  ])('writes the error line for %s', async (_case, module, error) => {
    const [line, ...rest] = await replay(module);
    expect(rest).toEqual([]);
    expect(line).toMatchObject({ probe: PERF_LOG_TAG, platform: 'ios' });
    expect(line.error).toMatch(error);
  });
});

describe('the probe gate on the replay', () => {
  async function loadProbe(flag) {
    vi.stubEnv('EXPO_PUBLIC_SPLOTCH_PERF_PROBE', flag);
    host.modules = { [REPLAY_MODULE]: nativeReplay(null), [PERF_LOG_MODULE]: { write: vi.fn() } };
    await import('../../experiments/native-architecture/src/drawing/perfProbe.native.ts');
    await vi.dynamicImportSettled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return host.modules[REPLAY_MODULE];
  }

  // Negative control: importing perfReplay outside the PERF_PROBE branch asks with the flag off.
  it.each([undefined, '0', 'true'])(
    'never asks the driver for a trace with the flag %s',
    async (flag) => {
      const module = await loadProbe(flag);
      expect(module.requestedTrace).not.toHaveBeenCalled();
      expect(host.touched).not.toContain(REPLAY_MODULE);
    }
  );

  it('asks the driver for the launch-named trace with the flag on', async () => {
    const module = await loadProbe('1');
    expect(module.requestedTrace).toHaveBeenCalledWith(REPLAY_LAUNCH_KEY);
  });

  // Metro folds a false PERF_PROBE branch away before it collects dependencies, which keeps the
  // replay and its traces out of a production bundle only while nothing else imports them.
  it('reaches the replay and its traces only through the PERF_PROBE branch', () => {
    const src = join(ROOT, APP, 'src');
    const importers = (pattern) =>
      readdirSync(src, { recursive: true })
        .filter(
          (file) => /\.tsx?$/.test(file) && pattern.test(readFileSync(join(src, file), 'utf8'))
        )
        .sort();
    expect(importers(/from '\.\/perfReplay'|import\('\.\/perfReplay'\)/)).toEqual([
      'drawing/perfProbe.native.ts',
    ]);
    expect(importers(/import\('[./]*perf\/replay\//)).toEqual(['drawing/perfReplay.ts']);
    expect(read(`${APP}src/drawing/perfProbe.native.ts`)).toMatch(
      /^if \(PERF_PROBE\)\n {2}void import\('\.\/perfReplay'\)/m
    );
    // Each committed trace has its own lazy import, matched by pattern so the specifier guard in
    // tool-specifier-resolution.test.mjs does not read it as an import of this test's own.
    const traces = read(`${APP}src/drawing/perfReplay.ts`);
    for (const name of REPLAY_TRACE_NAMES)
      expect(traces).toMatch(
        new RegExp(`'${name}': \\(\\) => import\\('[./]+perf/replay/${name}\\.json'\\)`)
      );
  });
});

describe('the native replay drivers', () => {
  const swift = read(`${IOS}SplotchPaperReplay.swift`);
  const kotlin = read(`${ANDROID}SplotchPaperReplay.kt`);
  const swiftView = read(`${IOS}SplotchPaperInput.swift`);
  const kotlinView = read(`${ANDROID}SplotchPaperInput.kt`);

  it('register the module JavaScript calls on both platforms', () => {
    const bridge = read(`${IOS}SplotchPaperReplay.m`);
    const project = read(`${APP}ios/HelloWorld.xcodeproj/project.pbxproj`);
    expect(swift).toContain(`@objc(${REPLAY_MODULE})`);
    expect(bridge).toContain(`RCT_EXTERN_MODULE(${REPLAY_MODULE}, NSObject)`);
    expect(bridge).toContain('RCT_EXTERN_METHOD(requestedTrace:(NSString *)launchKey');
    expect(bridge).toContain(
      'RCT_EXTERN_METHOD(start:(NSString *)name packets:(NSString *)packets settleMs:(double)settleMs'
    );
    for (const file of [`${REPLAY_MODULE}.swift`, `${REPLAY_MODULE}.m`])
      expect(project.match(new RegExp(`${file} in Sources \\*/,`, 'g'))).toHaveLength(1);
    expect(kotlin).toContain(`override fun getName() = "${REPLAY_MODULE}"`);
    expect(read(`${ANDROID}MainApplication.kt`)).toContain('add(SplotchPaperReplayPackage())');
  });

  // Negative control: a driver that builds its own dictionary or event bypasses these counts.
  it('send real touches and replayed packets through the same payload builder', () => {
    expect(swiftView.match(/onPaperInput\?\(/g)).toHaveLength(1);
    expect(swiftView).toContain('dispatch(phase, changed: identifiers, contacts: payload)');
    expect(swift).toContain('paper.dispatch(packet.phase,');
    expect(swift).toContain('paper.contactPayload(');
    expect(swift).toContain('paper.samplePayload(');
    expect(kotlinView.match(/PaperInputEvent\(UIManagerHelper/g)).toHaveLength(1);
    expect(kotlinView).toContain('dispatchInput(phase, changed, contacts)');
    expect(kotlin).toContain('view.dispatchInput(packet.phase, changed, contacts)');
    expect(kotlin).toContain('view.contactPayload(');
    expect(kotlin).toContain('view.samplePayload(');
  });

  it('round sample times to the microsecond as sampleTimeMs does', () => {
    expect(swift).toContain(
      '((t + dt) * microsecondsPerMillisecond).rounded() / microsecondsPerMillisecond'
    );
    expect(swift).toContain('private let microsecondsPerMillisecond = 1000.0');
    expect(kotlin).toContain('Math.round((t + dt) * MICROS_PER_MILLI) / MICROS_PER_MILLI');
    expect(kotlin).toContain('private const val MICROS_PER_MILLI = 1000.0');
  });

  it('read the launch key JavaScript passes and document it for both platforms', () => {
    expect(swift).toContain(
      'UserDefaults.standard.string(forKey: launchKey) ?? ProcessInfo.processInfo.environment[launchKey]'
    );
    expect(kotlin).toContain('intent?.getStringExtra(launchKey)');
    const docs = read(`${APP}DEVELOPMENT.md`);
    expect(docs).toContain(`-${REPLAY_LAUNCH_KEY} long-no-lift`);
    expect(docs).toContain(`-e ${REPLAY_LAUNCH_KEY} long-no-lift`);
    expect(docs).toContain(`DEVICECTL_CHILD_${REPLAY_LAUNCH_KEY}=long-no-lift`);
    for (const name of REPLAY_TRACE_NAMES) expect(docs).toContain(`\`${name}\``);
  });
});
