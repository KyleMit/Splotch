import { NativeModules } from 'react-native';
import {
  intervalSummary,
  PERF_LINE_VERSION,
  PERF_LOG_TAG,
  type PerfLineContext,
} from './perfCohort';
import {
  isReplayTraceName,
  readReplayTrace,
  REPLAY_LAUNCH_KEY,
  REPLAY_MODULE,
  REPLAY_SETTLE_MS,
  type ReplayTiming,
  type ReplayTraceName,
} from './replayTrace';

// The probe build's open-loop replay (DEVELOPMENT.md, "Replay"): when the app was launched with a
// trace name, SplotchPaperReplay emits that trace's packets through the paper input view on the
// main thread at their recorded times, and this module writes one line saying how faithfully it
// kept to them. perfProbe.native.ts imports it only when the probe is on.

// A trace's module is evaluated only when its replay is requested.
const TRACES = {
  'finger-session-1': () => import('../../perf/replay/finger-session-1.json'),
  'finger-session-2': () => import('../../perf/replay/finger-session-2.json'),
  'long-no-lift': () => import('../../perf/replay/long-no-lift.json'),
  'bursty-120-240': () => import('../../perf/replay/bursty-120-240.json'),
  'two-contact': () => import('../../perf/replay/two-contact.json'),
} satisfies Record<ReplayTraceName, () => Promise<{ default: unknown }>>;

type PaperReplay = {
  requestedTrace: (launchKey: string) => Promise<unknown>;
  start: (name: string, packets: string, settleMs: number) => Promise<unknown>;
};

// What the native driver reports when the last packet has been emitted: lateness is each
// packet's emission time minus its scheduled time, and duration runs from the first packet's
// scheduled time to the last one's emission.
export type ReplayResult = Readonly<{
  packets: number;
  delivered: number;
  traceMs: number;
  durationMs: number;
  latenessMs: readonly number[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPaperReplay(value: unknown): value is PaperReplay {
  return (
    isRecord(value) &&
    typeof value.requestedTrace === 'function' &&
    typeof value.start === 'function'
  );
}

const count = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const milliseconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function readReplayResult(value: unknown): ReplayResult {
  if (!isRecord(value)) throw new Error('The replay reported nothing');
  const { packets, delivered, traceMs, durationMs, latenessMs } = value;
  if (
    !count(packets) ||
    !count(delivered) ||
    delivered > packets ||
    !milliseconds(traceMs) ||
    !milliseconds(durationMs) ||
    !Array.isArray(latenessMs) ||
    latenessMs.length !== packets ||
    !latenessMs.every(milliseconds)
  )
    throw new Error('The replay report is malformed');
  return { packets, delivered, traceMs, durationMs, latenessMs };
}

const hundredths = (ms: number) => Math.round(ms * 100) / 100;

const lineHead = (context: PerfLineContext, name: string) => ({
  probe: PERF_LOG_TAG,
  v: PERF_LINE_VERSION,
  build: context.build || undefined,
  platform: context.platform,
  replay: name,
});

export function formatReplayLine(
  name: ReplayTraceName,
  timing: ReplayTiming,
  result: ReplayResult,
  context: PerfLineContext
) {
  return JSON.stringify({
    ...lineHead(context, name),
    timing,
    packets: result.packets,
    delivered: result.delivered,
    traceMs: hundredths(result.traceMs),
    durationMs: hundredths(result.durationMs),
    emissionLateness: intervalSummary(result.latenessMs),
  });
}

async function replay(module: PaperReplay, name: string, context: PerfLineContext) {
  if (!isReplayTraceName(name)) throw new Error(`No replay trace is named ${name}`);
  const trace = readReplayTrace((await TRACES[name]()).default);
  const report = await module.start(name, JSON.stringify(trace.packets), REPLAY_SETTLE_MS);
  return formatReplayLine(name, trace.timing, readReplayResult(report), context);
}

// Writes nothing unless the launch named a trace; a failed replay writes its error instead.
export async function replayRequestedTrace(
  write: (line: string) => void,
  context: PerfLineContext
) {
  const module: unknown = Reflect.get(NativeModules, REPLAY_MODULE);
  if (!isPaperReplay(module)) return;
  let name = '';
  try {
    const requested = await module.requestedTrace(REPLAY_LAUNCH_KEY);
    if (requested === null || requested === undefined) return;
    name = String(requested);
    write(await replay(module, name, context));
  } catch (error) {
    write(JSON.stringify({ ...lineHead(context, name), error: String(error) }));
  }
}
