import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze, writeAnalysisArtifacts } from '../analyze-chrome-trace.mjs';

export function buildMetrics({ settings, obs, heapBefore, heapAfter }) {
  return {
    settings,
    longTasks: obs.longTasks,
    frames: obs.frames,
    heap: { beforeBytes: heapBefore ?? null, afterBytes: heapAfter ?? obs.heapBytes ?? null },
  };
}

export function writeProfileArtifacts({ outDir, traceEvents, metrics }) {
  writeFileSync(join(outDir, 'trace.json'), JSON.stringify({ traceEvents }));
  writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  const summary = analyze(traceEvents, metrics);
  const report = writeAnalysisArtifacts({ outDir, summary });
  return { summary, report };
}
