import { relative } from 'node:path';
import { REPO_ROOT } from './asset-paths.mjs';

export function formatCandidateLine({ stats, warnings, attempt, shift, outPath }) {
  const tries = attempt > 0 ? `  (${attempt + 1} tries)` : '';
  const nudge = shift.dx || shift.dy ? `  shift ${shift.dx},${shift.dy}` : '';
  const warning = warnings.length ? `  ⚠ ${warnings.join(' + ')}` : '';
  return `${stats}${nudge}${tries}${warning}  -> ${relative(REPO_ROOT, outPath)}`;
}
