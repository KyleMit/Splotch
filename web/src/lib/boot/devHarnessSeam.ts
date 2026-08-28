import { dev } from '$app/environment';
import {
  committedBrushMode,
  getDrawingWorkDebug,
  getLiveSurfaceTopology,
  getUndoDebug,
  replayHarnessStroke,
} from '$lib/drawing/engine';
import { generateAiImage } from '$lib/drawing/aiImage';
import { PALETTE_COLORS, type PaletteLabel } from '$lib/palette';
import { PERF_MARKS } from '$lib/drawing/perf';
import { removeDurableCaptureReport, writeDurableCaptureReport } from '$lib/storage';

type StoreDrawingColor = { kind: 'palette'; label: PaletteLabel } | { kind: 'picker'; hex: string };

type StoreDrawingStrokeReplay = Omit<Parameters<typeof replayHarnessStroke>[0], 'color'> & {
  color: StoreDrawingColor;
};

const CAPTURE_NONCE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPTURE_REPORT_SCHEMA = 1;

function validateCaptureNonce(nonce: string): void {
  if (!CAPTURE_NONCE_PATTERN.test(nonce)) throw new Error('Invalid bundled-capture nonce');
}

function readCompleteProbeReport(): BundledCaptureProbeReport {
  const probe = window.__probe;
  if (!probe) throw new Error('The real-screen probe is not installed');
  const report = probe.finish();
  const counts = report.meta.counts;
  report.frames = probe.frames(0, counts.frames);
  report.events = probe.events(0, counts.events);
  report.measures = probe.measures(0, counts.measures);
  return report;
}

function createBundledCaptureReportSeam(): BundledCaptureReportSeam {
  let armedNonce: string | null = null;
  return {
    async arm(nonce) {
      validateCaptureNonce(nonce);
      if (!(await removeDurableCaptureReport(nonce))) {
        throw new Error('The bundled-capture Preferences channel is unavailable');
      }
      armedNonce = nonce;
      return { nonce };
    },
    async collect(nonce) {
      validateCaptureNonce(nonce);
      if (armedNonce !== nonce) throw new Error('The bundled-capture session is not armed');
      const report = readCompleteProbeReport();
      const payload = {
        schema: CAPTURE_REPORT_SCHEMA,
        nonce,
        pageUrl: location.href,
        userAgent: navigator.userAgent,
        report,
      };
      const serialized = JSON.stringify(payload);
      const bytes = new TextEncoder().encode(serialized).byteLength;
      if (!(await writeDurableCaptureReport(nonce, serialized))) {
        throw new Error('The bundled-capture report did not reach Preferences');
      }
      return { nonce, bytes, counts: report.meta.counts };
    },
    async clear(nonce) {
      validateCaptureNonce(nonce);
      if (!(await removeDurableCaptureReport(nonce))) {
        throw new Error('The bundled-capture Preferences channel is unavailable');
      }
      if (armedNonce === nonce) armedNonce = null;
    },
  };
}

/** @public */
export function replayStoreDrawingStroke({ color, ...stroke }: StoreDrawingStrokeReplay): void {
  const hex =
    color.kind === 'picker'
      ? color.hex
      : PALETTE_COLORS.find(({ label }) => label === color.label)?.hex;
  if (!hex) throw new Error(`Unknown store drawing color ${JSON.stringify(color)}`);
  replayHarnessStroke({ ...stroke, color: hex });
}

// The drawing route's gated `window` seams — what the E2E harness and the
// on-device profiler need to see and no DOM state exposes. One module rather than
// one per consumer, so there is a single place to read what this route publishes
// and a single teardown.
//
// PUBLIC_ENABLE_DEV_HARNESS is compiled into a literal for this client-only
// surface; PERF_MARKS builds retain it independently. Normal web and native
// builds therefore drop the assignments and property names, while /dev/*
// server routes keep their separate runtime gate. Installed from the drawing
// route's onMount, whose teardown removes them — the engine itself boots
// earlier (ADR-0072), but no spec can reach a brush button before hydration.
//
// State-inspection seams are READ-ONLY on purpose. A seam that sets internal
// state invites specs that pass against a configuration no child ever reaches,
// and a profiling seam that mutates can invalidate its own measurement.
// __aiGenerate is the distinct allowed shape: an invoke handle for a production
// function with its production arguments, not a setter for otherwise-unreachable
// state (ADR-0109).
//
//   __committedBrushMode (ADR-0080) — the engine's committed brush mode. The
//     toolState→engine bridge runs in a $effect, so a spec that clicks a brush
//     and draws immediately can commit the stroke under the previous brush, and
//     no DOM state distinguishes the two. tests/flows-harness.ts's pickBrush()
//     polls this, so the wait is on the engine rather than the button.
//   __drawingDebug (ADR-0083/0085) — how the undo history is stored and the
//     configured live-surface dimensions, for on-device profiling. Idle hidden
//     canvases can release their backing stores to the browser's 300×150
//     default, so DOM inspection cannot establish the surface-flush budget.
//     `/dev/engine` already exposed `getUndoDebug()`; this reaches the same
//     engine state on the route users actually draw on.
//   __aiGenerate (ADR-0109) — invokes the production AI-generation flow so
//     Playwright can mock its existing HTTP boundary while covering canvas
//     export, upload encoding, response parsing, and state application.
//   __replayStroke (ADR-0122) — commits one compiled store-art stroke through
//     the engine's renderer and history while the store capture harness is open.
export function installDevHarnessSeam(): () => void {
  if (!dev && !__DEV_HARNESS__ && !PERF_MARKS) return () => {};
  window.__committedBrushMode = committedBrushMode;
  window.__drawingDebug = { getDrawingWorkDebug, getLiveSurfaceTopology, getUndoDebug };
  window.__aiGenerate = generateAiImage;
  if (dev || __DEV_HARNESS__) window.__replayStroke = replayStoreDrawingStroke;
  if (dev || __DEV_HARNESS__) window.__bundledCaptureReport = createBundledCaptureReportSeam();
  return () => {
    delete window.__committedBrushMode;
    delete window.__drawingDebug;
    delete window.__aiGenerate;
    delete window.__replayStroke;
    delete window.__bundledCaptureReport;
  };
}
