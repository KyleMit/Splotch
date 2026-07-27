import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze, renderReport } from './analyze.mjs';

export function writeProfileArtifacts({ outDir, traceEvents, metrics }) {
  writeFileSync(join(outDir, 'trace.json'), JSON.stringify({ traceEvents }));
  writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  const summary = analyze(traceEvents, metrics);
  const report = renderReport(summary);
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(outDir, 'report.md'), report);
  return { summary, report };
}
