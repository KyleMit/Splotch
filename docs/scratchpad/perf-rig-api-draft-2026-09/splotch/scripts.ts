// Every `perf:*` npm script expressed against the package. Type-checking this file is the proof
// that the surface covers the catalogue; `use-case-matrix.md` is the human-readable version.
// Script names survive verbatim (ADR-0019); only the implementation behind each changes.
import {
  capture,
  serve,
  serveProbeHost,
  doctor,
  planCapture,
  renderProbe,
  configureProbe,
  type CaptureRequest,
  type CaptureOptions,
  type Scenario,
  type TargetDefinition,
} from 'perf-rig';
import {
  planCampaign,
  runCampaign,
  campaignStatus,
  rescore,
  keepEvidence,
} from 'perf-rig/campaign';
import {
  preflight,
  planRelease,
  release,
  operatorSession,
  calibrate,
  serveFloorControl,
  scanForDeviceIdentifiers,
} from 'perf-rig/rig';
import { splotch, type Brush, type Splotch } from './app.js';
import { targets } from './targets.js';
import { gates } from './gates.js';
import { rig } from './rig.js';
import { deploymentCampaign } from './campaign.js';
import { operatorSteps } from './operator.js';
import { upgradeLegacyArtifact } from './legacy-artifacts.js';
import { drawingCell, localFrames, realScreenSweep, paperControls } from './scenarios/drawing.js';
import { actionSweep, focusedActions } from './scenarios/actions.js';
import { toddlerSession, mount } from './scenarios/session.js';
import { settingsFirstShow } from './scenarios/pageload.js';
import {
  runUndoScenarios,
  replayRecording,
  ipadEngineGates,
  UNDO_CASES,
  FAST_UNDO_SCENARIO_KEYS,
} from './engine-scripts.js';

type Flags = Record<string, string | boolean | undefined>;
const str = (flags: Flags, key: string) =>
  typeof flags[key] === 'string' ? (flags[key] as string) : undefined;
const num = (flags: Flags, key: string) =>
  typeof flags[key] === 'string' ? Number(flags[key]) : undefined;
const list = (flags: Flags, key: string) => str(flags, key)?.split(',');
const brushOf = (flags: Flags): Brush => (str(flags, 'brush') as Brush | undefined) ?? 'pen';
const engineOf = (flags: Flags, fallback: 'chromium' | 'webkit' | 'firefox') =>
  (str(flags, 'engine') as 'chromium' | 'webkit' | 'firefox' | undefined) ?? fallback;
const viewportOf = (
  flags: Flags,
  fallback: { width: number; height: number; deviceScaleFactor: number }
) => {
  const [w, h] = (str(flags, 'viewport') ?? '').split('x').map(Number);
  return w && h
    ? {
        width: w,
        height: h,
        deviceScaleFactor: num(flags, 'device-scale-factor') ?? fallback.deviceScaleFactor,
      }
    : fallback;
};
const throttle = (flags: Flags, fallback: number) =>
  flags['no-throttle']
    ? []
    : [{ id: 'cdp-cpu-throttle' as const, rate: num(flags, 'throttle') ?? fallback }];

const PHONE = { width: 412, height: 915, deviceScaleFactor: 2.6 };
const IPAD_PRO = { width: 1366, height: 915, deviceScaleFactor: 2 };
const DESKTOP_ACTIONS = { width: 1512, height: 982, deviceScaleFactor: 2 };
const DEVICES = {
  phone: PHONE,
  tablet: { width: 1024, height: 1366, deviceScaleFactor: 2 },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
} as const;

// Local desktop stand-ins keep their own target ids; a desktop capture folded into a device target
// collides on captureRuntime, which the runtime-mismatch acceptance rule enforces.
const local = (engine: 'chromium' | 'webkit' | 'firefox', viewport = PHONE): TargetDefinition => ({
  id: `local-${engine}`,
  label: `Local ${engine}`,
  platform: 'macos',
  host: 'desktop',
  shell: 'browser',
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

const common = (flags: Flags): CaptureOptions<Splotch> => ({
  label: str(flags, 'label'),
  output: str(flags, 'output'),
  build: flags['url']
    ? {
        mode: 'url',
        url: str(flags, 'url'),
        allowForeignBuild: flags['allow-foreign-build'] === true,
      }
    : { mode: flags['no-build'] ? 'reuse' : 'build' },
  server: {
    port: num(flags, 'port'),
    probeHostPort: num(flags, 'probe-port'),
    attachOnly: flags['no-serve'] === true,
    noRebind: flags['no-rebind'] === true,
  },
  dimensions: {
    theme: str(flags, 'theme') as 'light' | 'dark' | undefined,
    orientation: str(flags, 'orientation') as 'PORTRAIT' | 'LANDSCAPE' | undefined,
  },
  headed: flags['headed'] === true,
  reportOnly: flags['report-only'] === true,
  forensics: flags['no-forensics'] !== true,
  refreshRegime: str(flags, 'refresh-regime'),
  device: {
    id: str(flags, 'device-id') ?? str(flags, 'device-serial') ?? str(flags, 'device-udid'),
    name: str(flags, 'name'),
    appiumUrl: str(flags, 'appium-url'),
    capabilitiesFile: str(flags, 'capabilities-file'),
    sessionId: str(flags, 'session-id'),
    cdpPort: num(flags, 'cdp-port') ?? num(flags, 'cdp-forward-port'),
    wdaUrl: str(flags, 'wda-url'),
    probeHost: str(flags, 'probe-host') ?? str(flags, 'host'),
    webviewClass: str(flags, 'native-webview-class'),
    deviceClass: str(flags, 'device-class') as 'tablet' | undefined,
  },
  scenarioOverrides: {
    gestureRepeats: num(flags, 'gesture-repeats'),
    gesturePauseMs: num(flags, 'repeat-pause-ms'),
    contactCapMs: num(flags, 'contact-seconds') ? num(flags, 'contact-seconds')! * 1000 : undefined,
    phases: list(flags, 'phases'),
    tool: str(flags, 'brush'),
    hud: flags['no-hud'] ? false : flags['hud'] ? true : undefined,
    input: flags['drive']
      ? {
          kind: 'probe-synthetic',
          shape: str(flags, 'drive') as 'mixed' | undefined,
          hz: num(flags, 'drive-hz'),
          pointerType: str(flags, 'pointer-type') as 'touch' | undefined,
        }
      : undefined,
    repeatedAction: {
      count: num(flags, 'undo-count'),
      pauseMs: num(flags, 'undo-pause-ms'),
      rotateBefore: flags['rotate-before-undo'] === true,
      settleMs: num(flags, 'history-settle-ms'),
    },
    actionRepeats: num(flags, 'repeats')
      ? { warmup: 1, scored: num(flags, 'repeats')! - 1 }
      : undefined,
    groups: list(flags, 'actions'),
    freeDrawSeconds: num(flags, 'free-draw'),
  },
  human: {
    seconds: num(flags, 'seconds'),
    open: str(flags, 'open') as 'adb' | undefined,
    terminateExisting: flags['terminate-existing'] === true,
  },
  instruments: [
    ...(flags['trace'] === true ? [{ id: 'cdp-tracing' as const }] : []),
    ...(flags['timeline'] === true ? [{ id: 'webkit-timeline-count' as const }] : []),
  ],
});

const request = <S extends Scenario<Splotch>>(
  target: TargetDefinition,
  scenario: S,
  flags: Flags,
  extra?: Partial<CaptureOptions<Splotch>>
): CaptureRequest<Splotch, S> => ({
  app: splotch,
  target,
  scenario,
  gates,
  host: rig,
  options: { ...common(flags), ...extra },
});

const deviceOf = (flags: Flags, fallback: keyof typeof DEVICES = 'phone') =>
  DEVICES[(str(flags, 'device') as keyof typeof DEVICES | undefined) ?? fallback];
const iosSplitTarget = (flags: Flags) =>
  targets[flags['native-app'] ? 'ipad-device-native' : 'ipad-device-web'];
const androidSplitTarget = (flags: Flags) =>
  targets[flags['native-app'] ? 'android-device-native' : 'android-device-web'];

export const scripts = {
  // ---- local web, session shape
  'perf:web': (f: Flags) =>
    capture(
      request(local('chromium', deviceOf(f)), toddlerSession, f, {
        instruments: [...throttle(f, 4), { id: 'cdp-tracing' }],
      })
    ),
  'perf:web:raw': (f: Flags) =>
    capture(
      request(local('chromium', deviceOf(f)), toddlerSession, f, {
        instruments: [{ id: 'cdp-tracing' }],
      })
    ),
  'perf:web:webkit': (f: Flags) =>
    capture(request(local('webkit', deviceOf(f)), toddlerSession, f)),
  'perf:android': (f: Flags) =>
    capture(
      request(targets['android-emulator-native'], toddlerSession, f, {
        transport: { input: 'desktop-playwright', channel: 'cdp-evaluate' },
        instruments: [{ id: 'cdp-tracing' }],
      })
    ),
  // ---- page load and first show
  'perf:web:mount': (f: Flags) =>
    capture(
      request(local('chromium', deviceOf(f)), mount, f, {
        instruments: [
          ...throttle(f, 4),
          { id: 'cdp-tracing' },
          { id: 'cdp-network-emulation', profile: 'slow-4g' },
        ],
      })
    ),
  'perf:web:settings': (f: Flags) =>
    capture(
      request(local('chromium'), settingsFirstShow, f, {
        scenarioOverrides: { cycles: num(f, 'repeats') ?? 3 },
      })
    ),
  // ---- frames shape
  'perf:web:frames': (f: Flags) =>
    capture(
      request(local(engineOf(f, 'webkit'), viewportOf(f, IPAD_PRO)), localFrames(brushOf(f)), f, {
        instruments: throttle(f, 1),
      })
    ),
  'perf:ios:webkit:frames': (f: Flags) =>
    capture(
      request(targets['ipad-device-web'], realScreenSweep, f, {
        transport: {
          input: f['drive'] ? 'desktop-playwright' : 'human',
          channel: 'webkit-inspector',
        },
      })
    ),
  'perf:ios:xcuitest:screen': (f: Flags) =>
    capture(
      request(
        iosSplitTarget(f),
        drawingCell(brushOf(f)),
        f,
        f['bundled-report']
          ? {
              transport: {
                input: f['hand-input'] ? 'human' : 'appium',
                channel: 'preferences-mailbox',
              },
            }
          : undefined
      )
    ),
  'perf:ios:bundled:frames': (f: Flags) =>
    capture(
      request(targets['ipad-device-native'], drawingCell(brushOf(f)), f, {
        transport: { input: f['hand-input'] ? 'human' : 'appium', channel: 'preferences-mailbox' },
      })
    ),
  'perf:device:frames': (f: Flags) =>
    capture(
      request(
        str(f, 'platform') === 'ios' ? iosSplitTarget(f) : androidSplitTarget(f),
        drawingCell(brushOf(f)),
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
        str(f, 'platform') === 'ios' ? iosSplitTarget(f) : androidSplitTarget(f),
        drawingCell(brushOf(f)),
        f,
        { transport: { input: 'human', channel: 'http-upload' } }
      )
    ),
  'perf:android:bundled:frames': (f: Flags) =>
    capture(
      request(targets['android-device-native'], drawingCell(brushOf(f)), f, {
        transport: {
          input: f['input'] === 'hand' ? 'human' : 'adb-input',
          channel: 'cdp-evaluate',
        },
      })
    ),
  // ---- actions shape
  'perf:web:actions': (f: Flags) =>
    capture(
      request(
        local(engineOf(f, 'webkit'), viewportOf(f, DESKTOP_ACTIONS)),
        f['actions'] ? focusedActions(list(f, 'actions')!) : actionSweep,
        f
      )
    ),
  'perf:ios:xcuitest:actions': (f: Flags) =>
    capture(
      request(
        iosSplitTarget(f),
        f['actions'] ? focusedActions(list(f, 'actions')!) : actionSweep,
        f,
        { transport: { activation: f['webdriver-clicks'] ? 'webdriver-element-click' : 'trusted' } }
      )
    ),
  'perf:android:browser:actions': (f: Flags) =>
    capture(
      request(
        targets['android-device-web'],
        f['actions'] ? focusedActions(list(f, 'actions')!) : actionSweep,
        f,
        {
          instruments: [
            { id: 'android-refresh-pin', hz: 60 },
            ...(f['trace'] === true ? [{ id: 'cdp-tracing' as const }] : []),
          ],
        }
      )
    ),
  // ---- engine shape: Splotch scripts over package primitives
  'perf:web:undo': (f: Flags) =>
    runUndoScenarios(local('chromium', IPAD_PRO), {
      keys: list(f, 'scenarios') ?? UNDO_CASES.map((c) => c.key),
      throttle: f['no-throttle'] ? undefined : (num(f, 'throttle') ?? 4),
      reuseBuild: f['no-build'] === true,
    }),
  'perf:web:undo:webkit': (f: Flags) =>
    runUndoScenarios(local('webkit', IPAD_PRO), {
      keys: list(f, 'scenarios') ?? UNDO_CASES.map((c) => c.key),
      historyPath: str(f, 'fast-set-history'),
      reuseBuild: f['no-build'] === true,
    }),
  'perf:web:undo:webkit:fast': (f: Flags) =>
    runUndoScenarios(local('webkit', IPAD_PRO), {
      keys: FAST_UNDO_SCENARIO_KEYS,
      reuseBuild: f['no-build'] === true,
    }),
  'perf:web:replay': (f: Flags) =>
    replayRecording(local('chromium', IPAD_PRO), str(f, 'recording')!, {
      throttle: f['no-throttle'] ? undefined : num(f, 'throttle'),
      reuseBuild: f['no-build'] === true,
    }),
  'perf:ios:webkit:gates': (f: Flags) =>
    ipadEngineGates(targets['ipad-device-web'], str(f, 'device-id')!),
  // ---- serving and hosts
  'perf:serve': (f: Flags) =>
    serve(splotch, {
      port: num(f, 'port') ?? rig.ports!.preview!.port,
      strictPort: f['strict-port'] === true,
    }),
  'perf:device:serve': (f: Flags) =>
    serveProbeHost(splotch, {
      port: num(f, 'port') ?? rig.ports!.probe!.port,
      upstream: str(f, 'upstream') ?? `http://127.0.0.1:${rig.ports!.preview!.port}`,
      reportDir: str(f, 'report-dir') ?? 'perf-profiles/split-capture/reports',
    }),
  'perf:device:floor': (f: Flags) =>
    serveFloorControl({
      port: num(f, 'port') ?? rig.ports!.floorControl!.port,
      reportDir: 'perf-profiles/split-capture/reports',
    }),
  // ---- rig lifecycle
  'perf:doctor': (f: Flags) => doctor(splotch, { url: str(f, 'url'), serve: !f['url'], host: rig }),
  'perf:preflight': (f: Flags) =>
    preflight(rig, {
      androidSerial: str(f, 'android-serial'),
      iosUdid: str(f, 'ios-udid'),
      appiumUrl: str(f, 'appium-url'),
      previewPort: num(f, 'port'),
      wakeAndroid: f['wake-android'] === true,
      holdAndroidAwake: f['hold-android-awake'] === true,
      verifyAndroidInput: f['verify-android-input'] === true,
      verifyIosLaunch: f['verify-ios-launch'] === true,
      json: f['json'] === true,
      logTimestamp: f['log-timestamp'] === true,
    }),
  'perf:release': async (f: Flags) => {
    const plan = await planRelease(rig, {
      stopCampaigns: f['stop-campaigns'] === true,
      hostOnly: f['host-only'] === true,
      androidSerial: str(f, 'android-serial'),
    });
    return f['dry-run'] ? plan : release(rig, plan, { json: f['json'] === true });
  },
  'perf:operator': (f: Flags) =>
    operatorSession(rig, operatorSteps(list(f, 'brushes') as Brush[] | undefined), {
      plan: f['plan'] === true,
      only: list(f, 'steps'),
      capture: { ...common(f), label: str(f, 'label') },
      promote: f['campaign']
        ? {
            campaign: str(f, 'campaign')!,
            corpus: str(f, 'corpus')!,
            productCommit: str(f, 'product-commit')!,
          }
        : undefined,
    }),
  'perf:calibrate': (f: Flags) =>
    calibrate({
      runtime: str(f, 'runtime')!,
      handArtifact: str(f, 'hand')!,
      badControlArtifact: str(f, 'bad-control')!,
    }),
  // ---- campaign
  'perf:campaign': (f: Flags) =>
    (f['dry-run'] ? planCampaign : runCampaign)(
      deploymentCampaign(targets[str(f, 'target') as keyof typeof targets], str(f, 'output-root')),
      {
        variants: list(f, 'modes'),
        items: list(f, 'items'),
        label: str(f, 'label'),
        ledgerPath: str(f, 'ledger'),
        maxAttempts: num(f, 'max-attempts'),
        acceptInstrumentChange: f['accept-instrument-change'] === true,
        url: str(f, 'url'),
        rebootSimulator: str(f, 'reboot-simulator'),
        isolation: 'child-process',
        device: common(f).device,
      }
    ),
  'perf:campaign:status': (f: Flags) =>
    campaignStatus(
      deploymentCampaign(targets[str(f, 'target') as keyof typeof targets], str(f, 'output-root')),
      { ledgerPath: str(f, 'ledger') }
    ),
  'perf:rescore': (f: Flags) =>
    rescore({
      corpus: str(f, 'corpus')!,
      filter: str(f, 'filter'),
      target: str(f, 'target'),
      json: str(f, 'json'),
      includeUnattributable: f['include-unattributable'] === true,
      legacy: { upgrade: upgradeLegacyArtifact },
      score: (artifact) => ({
        label: artifact.label,
        target: artifact.target,
        tool: artifact.kind === 'frames' ? (artifact.report.meta.brush ?? 'unknown') : 'n/a',
      }),
    }),
  'perf:evidence:keep': (f: Flags) =>
    keepEvidence(
      {
        corpus: str(f, 'corpus')!,
        campaign: str(f, 'campaign')!,
        productCommit: str(f, 'product-commit')!,
        target: str(f, 'target'),
        filter: str(f, 'filter'),
        force: f['force'] === true,
        allowFailed: f['allow-failed'] === true,
        keepAll: f['keep-all'] ? { study: str(f, 'study')! } : undefined,
        keyOf: (artifact) => `${artifact.target}:${artifact.scenario.id}`,
      },
      rig.evidenceRoot!
    ),
  'check:device-identifiers': (_f: Flags) => scanForDeviceIdentifiers('<tracked tree text>', rig),
  // ---- diagnostics and analysis (CLI at the published rung; library calls at the nested one)
  'perf:device:verify-android': (_f: Flags) =>
    Promise.resolve('perf-rig verify input --platform android'),
  'perf:device:verify-android-rotation': (_f: Flags) =>
    Promise.resolve('perf-rig verify rotation --platform android'),
  'perf:device:probe-overhead': (_f: Flags) => Promise.resolve('perf-rig probe-overhead'),
  'perf:analyze:frames': (_f: Flags) =>
    Promise.resolve(
      'perf-rig analyze frames <capture.json> [--no-forensics] [--include-unattributable]'
    ),
  'perf:analyze:chrome': (_f: Flags) => Promise.resolve('perf-rig analyze chrome <dir|trace.json>'),
  'perf:analyze:web-inspector': (_f: Flags) =>
    Promise.resolve('perf-rig analyze web-inspector <export.json>'),
  'perf:build': (_f: Flags) =>
    Promise.resolve('unchanged npm script; postperf:build stamps provenance through the package'),
  'perf:build:cap': (_f: Flags) => Promise.resolve('unchanged npm script'),
  'perf:campaign:sources': (_f: Flags) =>
    Promise.resolve(
      'stays a Splotch script: runtime and undo-evidence checks, build binding across a variant, four brushes plus the sweep, into the matrix manifest'
    ),
  'gen:performance-matrix': (_f: Flags) =>
    Promise.resolve('stays a Splotch script over the campaign inspector and Splotch renderer'),
  'check:matrix-staleness': (_f: Flags) => Promise.resolve('stays a Splotch script'),
  'probe render': () =>
    configureProbe(renderProbe('frames', splotch, paperControls), {
      phases: [{ key: 'blank', paper: 'blank' }],
      contactCapMs: 60_000,
      hud: true,
    }),
  'capture --dry-run': (f: Flags) =>
    planCapture(request(targets['ipad-device-web'], drawingCell('pen'), f)),
} satisfies Record<string, (flags: Flags) => unknown>;
