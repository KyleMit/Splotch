// The pre-package corpus under perf-profiles/evidence is in the legacy shape. The package refuses
// unknown schemas; Splotch owns the one-time upgrade and drift-tests it against the corpus.
import type { CaptureArtifact } from 'perf-rig';

const LEGACY_TRANSPORTS = [
  'browser',
  'native-capacitor-webview',
  'split-input-measurement',
  'cdp-bundled',
  'android-chrome-cdp',
  'human-finger',
] as const;

export function upgradeLegacyArtifact(json: unknown, path: string): CaptureArtifact {
  const legacy = json as {
    transport?: string;
    samples?: unknown[];
    fidelity?: unknown;
    gesturePlan?: string;
    frameStampEpoch?: number;
  };
  if (
    legacy.transport !== undefined &&
    !(LEGACY_TRANSPORTS as readonly string[]).includes(legacy.transport)
  ) {
    throw new Error(`${path}: unknown legacy transport ${legacy.transport}`);
  }
  // Maps transport/nativeApp/appUrl/nativePackage onto shell + transport + channel, samples onto an
  // actions report, summaries.phases[].input onto the InputSummary the scorers already read, and
  // gesturePlan/gestureRepeats/eraserRefills/undoVisual onto FramesEvidence. Field names on the
  // summaries are unchanged by design.
  throw new Error(`${path}: legacy upgrade is implemented in phase 3 of migration.md`);
}
