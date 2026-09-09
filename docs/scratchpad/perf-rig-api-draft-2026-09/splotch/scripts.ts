// Every `perf:*` npm script expressed as a call against the package. Type-checking this file is
// the proof that the surface covers the catalogue; `use-case-matrix.md` is the human-readable
// version. Script names survive verbatim (ADR-0019); only the implementation path changes.
import {
  capture,
  serve,
  serveProbeHost,
  preflight,
  planRelease,
  release,
  operatorSession,
  runCampaign,
  campaignStatus,
  rescore,
  keepEvidence,
  renderProbe,
  planCapture,
  type CaptureRequest,
  type Scenario,
  type TargetDefinition,
} from 'perf-rig';
import { splotch } from './app.js';
import { targets } from './targets.js';
import { gates } from './gates.js';
import { rig } from './rig.js';
import { deploymentCampaign } from './campaign.js';
import { drawingCell, realScreenSweep } from './scenarios/drawing.js';
import { actionSweep, focusedActions } from './scenarios/actions.js';
import { toddlerSession } from './scenarios/session.js';
import { undoScenarios, replayRecording, FAST_UNDO_SCENARIO_KEYS } from './scenarios/engine.js';
import { mount, settingsFirstShow } from './scenarios/pageload.js';

type Flags = Record<string, string | boolean | undefined>;
const str = (flags: Flags, key: string) =>
  typeof flags[key] === 'string' ? (flags[key] as string) : undefined;
const num = (flags: Flags, key: string) =>
  typeof flags[key] === 'string' ? Number(flags[key]) : undefined;

// Local desktop stand-ins keep their own target ids; a desktop capture folded into a device target
// must collide on captureRuntime, which the acceptance rule enforces.
const headless = (
  engine: 'chromium' | 'webkit' | 'firefox',
  viewport = { width: 412, height: 915, deviceScaleFactor: 2.6 }
): TargetDefinition => ({
  id: `local-${engine}`,
  label: `Local ${engine}`,
  platform: 'macos',
  host: 'desktop',
  runtime: 'web',
  deviceClass: 'desktop',
  engine,
  captureRuntime: 'desktop-playwright',
  refreshRegime: null,
  transports: {
    drawing: 'desktop-playwright',
    actions: 'desktop-playwright',
    measurement: 'same-process',
  },
  evidenceRole: 'advisory',
  physicalDevice: false,
  viewport,
});

const request = (
  target: TargetDefinition,
  scenario: Scenario,
  flags: Flags,
  extra?: Partial<CaptureRequest['options']>
): CaptureRequest => ({
  app: splotch,
  target,
  scenario,
  gates,
  rig,
  options: {
    label: str(flags, 'label'),
    output: str(flags, 'output'),
    build: flags['url']
      ? {
          mode: 'url',
          url: str(flags, 'url'),
          allowForeignBuild: flags['allow-foreign-build'] === true,
        }
      : { mode: flags['no-build'] ? 'reuse' : 'build' },
    dimensions: flags['theme'] ? { theme: str(flags, 'theme')! } : undefined,
    orientation: str(flags, 'orientation') as 'PORTRAIT' | 'LANDSCAPE' | undefined,
    reportOnly: flags['report-only'] === true,
    device: {
      id: str(flags, 'device-id') ?? str(flags, 'device-serial'),
      appiumUrl: str(flags, 'appium-url'),
      capabilitiesFile: str(flags, 'capabilities-file'),
      sessionId: str(flags, 'session-id'),
      cdpPort: num(flags, 'cdp-port'),
      wdaUrl: str(flags, 'wda-url'),
      probeHost: str(flags, 'probe-host') ?? str(flags, 'host'),
    },
    ...extra,
  },
});

export const scripts = {
  // ---- local web, session shape
  'perf:web': (f: Flags) =>
    capture(
      request(headless('chromium'), toddlerSession, f, {
        instruments: { cpuThrottle: num(f, 'throttle') ?? 4, trace: true },
      })
    ),
  'perf:web:raw': (f: Flags) =>
    capture(
      request(headless('chromium'), toddlerSession, f, {
        instruments: { cpuThrottle: 1, trace: true },
      })
    ),
  'perf:web:webkit': (f: Flags) => capture(request(headless('webkit'), toddlerSession, f)),
  'perf:android': (f: Flags) =>
    capture(
      request(targets['android-emulator-native'], toddlerSession, f, {
        transport: { input: 'desktop-playwright', channel: 'cdp-evaluate' },
      })
    ),
  // ---- page load and first show
  'perf:web:mount': (f: Flags) =>
    capture(
      request(headless('chromium'), mount, f, {
        instruments: { cpuThrottle: num(f, 'throttle') ?? 4, trace: true },
      })
    ),
  'perf:web:settings': (f: Flags) =>
    capture(
      request(headless('chromium'), settingsFirstShow, f, { repeats: num(f, 'repeats') ?? 3 })
    ),
  // ---- frames shape
  'perf:web:frames': (f: Flags) =>
    capture(
      request(
        headless((str(f, 'engine') as 'webkit' | 'chromium' | 'firefox') ?? 'webkit', {
          width: 1366,
          height: 915,
          deviceScaleFactor: 2,
        }),
        drawingCell((str(f, 'brush') as 'pen') ?? 'pen'),
        f
      )
    ),
  'perf:ios:webkit:frames': (f: Flags) =>
    capture(
      request(targets['ipad-device-web'], realScreenSweep, f, {
        transport: { input: 'human', channel: 'webkit-inspector' },
      })
    ),
  'perf:ios:xcuitest:screen': (f: Flags) =>
    capture(
      request(
        targets[f['native-app'] ? 'ipad-device-native' : 'ipad-device-web'],
        drawingCell((str(f, 'brush') as 'pen') ?? 'pen'),
        f
      )
    ),
  'perf:ios:bundled:frames': (f: Flags) =>
    capture(
      request(targets['ipad-device-native'], drawingCell((str(f, 'brush') as 'pen') ?? 'pen'), f, {
        transport: { input: 'appium-xcuitest', channel: 'preferences-mailbox' },
      })
    ),
  'perf:device:frames': (f: Flags) =>
    capture(
      request(
        targets[
          str(f, 'platform') === 'ios'
            ? 'ipad-device-web'
            : f['native-app']
              ? 'android-device-native'
              : 'android-device-web'
        ],
        drawingCell((str(f, 'brush') as 'pen') ?? 'pen'),
        f,
        {
          transport: {
            input: str(f, 'platform') === 'ios' ? 'wda-http' : 'adb-input',
            channel: 'http-upload',
          },
        }
      )
    ),
  'perf:device:hand': (f: Flags) =>
    capture(
      request(
        targets[f['native-app'] ? 'android-device-native' : 'android-device-web'],
        drawingCell((str(f, 'brush') as 'pen') ?? 'pen'),
        f,
        { transport: { input: 'human', channel: 'http-upload' } }
      )
    ),
  'perf:android:bundled:frames': (f: Flags) =>
    capture(
      request(
        targets['android-device-native'],
        drawingCell((str(f, 'brush') as 'pen') ?? 'pen'),
        f,
        {
          transport: {
            input: f['input'] === 'hand' ? 'human' : 'adb-input',
            channel: 'cdp-evaluate',
          },
        }
      )
    ),
  // ---- actions shape
  'perf:web:actions': (f: Flags) =>
    capture(
      request(
        headless((str(f, 'engine') as 'webkit') ?? 'webkit', {
          width: 1512,
          height: 982,
          deviceScaleFactor: 2,
        }),
        f['actions'] ? focusedActions(String(f['actions']).split(',')) : actionSweep,
        f,
        { repeats: num(f, 'repeats') ?? 4 }
      )
    ),
  'perf:ios:xcuitest:actions': (f: Flags) =>
    capture(
      request(
        targets[f['native-app'] ? 'ipad-device-native' : 'ipad-device-web'],
        f['actions'] ? focusedActions(String(f['actions']).split(',')) : actionSweep,
        f,
        { repeats: num(f, 'repeats') ?? 4 }
      )
    ),
  'perf:android:browser:actions': (f: Flags) =>
    capture(
      request(
        targets['android-device-web'],
        f['actions'] ? focusedActions(String(f['actions']).split(',')) : actionSweep,
        f,
        { repeats: num(f, 'repeats') ?? 4, instruments: { trace: f['trace'] === true } }
      )
    ),
  // ---- engine shape
  'perf:web:undo': (f: Flags) =>
    capture(
      request(
        headless('chromium', { width: 1366, height: 915, deviceScaleFactor: 2 }),
        undoScenarios,
        f,
        { instruments: { cpuThrottle: 4, trace: true } }
      )
    ),
  'perf:web:undo:webkit': (f: Flags) =>
    capture(
      request(
        headless('webkit', { width: 1366, height: 915, deviceScaleFactor: 2 }),
        undoScenarios,
        f
      )
    ),
  'perf:web:undo:webkit:fast': (f: Flags) =>
    capture(
      request(
        headless('webkit', { width: 1366, height: 915, deviceScaleFactor: 2 }),
        {
          ...undoScenarios,
          id: 'undo-scenarios-fast',
          cases: undoScenarios.cases.filter((c) =>
            (FAST_UNDO_SCENARIO_KEYS as readonly string[]).includes(c.key)
          ),
        },
        f
      )
    ),
  'perf:web:replay': (f: Flags) =>
    capture(
      request(headless('chromium'), replayRecording(str(f, 'recording')!), f, {
        instruments: { cpuThrottle: num(f, 'throttle') ?? 0, trace: true },
      })
    ),
  'perf:ios:webkit:gates': (_f: Flags) =>
    Promise.reject(
      new Error(
        'stays a Splotch script: drives /dev/engine with engine-gates.js over the package WebKit Inspector session'
      )
    ),
  // ---- serving
  'perf:serve': (f: Flags) =>
    serve(splotch, {
      port: num(f, 'port') ?? rig.ports.preview.port,
      strictPort: f['strict-port'] === true,
    }),
  'perf:device:serve': (f: Flags) =>
    serveProbeHost(splotch, {
      port: num(f, 'port') ?? rig.ports.probe.port,
      upstream: str(f, 'upstream') ?? `http://127.0.0.1:${rig.ports.preview.port}`,
      reportDir: str(f, 'report-dir') ?? 'perf-profiles/split-capture/reports',
    }),
  // ---- rig lifecycle
  'perf:preflight': (f: Flags) =>
    preflight(rig, {
      wakeAndroid: f['wake-android'] === true,
      holdAndroidAwake: f['hold-android-awake'] === true,
      verifyAndroidInput: f['verify-android-input'] === true,
      verifyIosLaunch: f['verify-ios-launch'] === true,
      json: f['json'] === true,
    }),
  'perf:release': async (f: Flags) => {
    const plan = await planRelease(rig, {
      stopCampaigns: f['stop-campaigns'] === true,
      hostOnly: f['host-only'] === true,
    });
    return f['dry-run'] ? plan : release(rig, plan);
  },
  'perf:operator': (_f: Flags) => operatorSession(rig, []),
  // ---- campaign
  'perf:campaign': (f: Flags) =>
    runCampaign(deploymentCampaign(targets[str(f, 'target') as keyof typeof targets]), {
      modes: str(f, 'modes')?.split(','),
      items: str(f, 'items')?.split(','),
      dryRun: f['dry-run'] === true,
      acceptInstrumentChange: f['accept-instrument-change'] === true,
    }),
  'perf:campaign:status': (f: Flags) =>
    campaignStatus(deploymentCampaign(targets[str(f, 'target') as keyof typeof targets])),
  'perf:rescore': (f: Flags) =>
    rescore({
      corpus: str(f, 'corpus')!,
      includeUnattributable: f['include-unattributable'] === true,
      cellOf: (artifact) => ({
        target: artifact.target,
        mode: artifact.dimensions['theme'] ?? 'unknown',
        item: artifact.scenario.id,
      }),
      score: (artifact) => ({ label: artifact.label }),
    }),
  'perf:evidence:keep': (f: Flags) =>
    keepEvidence(
      {
        corpus: str(f, 'corpus')!,
        campaign: str(f, 'campaign')!,
        productCommit: str(f, 'product-commit')!,
        keyOf: (artifact) => `${artifact.target}:${artifact.scenario.id}`,
      },
      rig.evidenceRoot!
    ),
  // ---- diagnostics
  'perf:device:verify-android': (_f: Flags) =>
    Promise.resolve('perf-rig verify input --platform android'),
  'perf:device:verify-android-rotation': (_f: Flags) =>
    Promise.resolve('perf-rig verify rotation --platform android'),
  'perf:device:floor': (_f: Flags) => Promise.resolve('perf-rig floor-control'),
  'perf:device:probe-overhead': (_f: Flags) => Promise.resolve('perf-rig probe-overhead'),
  'perf:analyze:frames': (_f: Flags) =>
    Promise.resolve('perf-rig analyze frames <real-screen.json>'),
  'perf:analyze:chrome': (_f: Flags) => Promise.resolve('perf-rig analyze chrome <dir|trace.json>'),
  'perf:analyze:web-inspector': (_f: Flags) =>
    Promise.resolve('perf-rig analyze web-inspector <export.json>'),
  'perf:build': (_f: Flags) =>
    Promise.resolve(
      'unchanged: PERF_MARKS=true PUBLIC_ENABLE_DEV_HARNESS=true npm run build; postperf:build → perf-rig provenance stamp'
    ),
  'perf:build:cap': (_f: Flags) => Promise.resolve('unchanged'),
  'perf:campaign:sources': (_f: Flags) =>
    Promise.resolve('stays a Splotch script: folds a campaign into the matrix manifest'),
  'gen:performance-matrix': (_f: Flags) =>
    Promise.resolve(
      'stays a Splotch script: builds the model, calls renderMatrix and stalenessOutcome'
    ),
  'check:matrix-staleness': (_f: Flags) =>
    Promise.resolve('stays a Splotch script over stalenessOutcome'),
  'probe render': () => renderProbe('frames', splotch, { phases: ['blank'], hud: true }),
  'capture --dry-run': (f: Flags) =>
    planCapture(request(targets['ipad-device-web'], drawingCell('pen'), f)),
} satisfies Record<string, (flags: Flags) => unknown>;
