const seconds = (value) => `${Math.round(value)}s`;
const tokens = (value) => `${(value / 1_000_000).toFixed(2)}M`;
const cell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

function summaryTable(summary) {
  const header =
    '| Rival | Seeds detected | Severity met | Seeded false positives | Control false positives | Unverified | Handler turns (declined) | Local commands (failed) | Wall | Input (cached) | Output | Failed cells |';
  const rule = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
  const rows = summary.map(
    (row) =>
      `| ${row.rival} | ${row.detected}/${row.seededCells} | ${row.severityMet}/${row.seededCells} | ${row.seededFalsePositives} | ${row.controlFalsePositives} over ${row.controlCells} | ${row.unverified} | ${row.meanTurns.toFixed(1)} (${row.meanDeclined.toFixed(1)}) | ${row.meanLocalCommands.toFixed(1)} (${row.meanLocalFailed.toFixed(1)}) | ${seconds(row.meanWallSeconds)} | ${tokens(row.meanInput)} (${tokens(row.meanCached)}) | ${(row.meanOutput / 1000).toFixed(1)}k | ${row.failedCells} |`
  );
  return [header, rule, ...rows].join('\n');
}

function describeDetection(row) {
  if (row.failed) return `failed: ${cell(row.failed)}`;
  if (row.control)
    return row.score.falsePositives === 0 ? 'clean' : `${row.score.falsePositives} false`;
  if (!row.score.detected) return 'missed';
  return row.score.severityMet ? 'found' : 'found, severity under floor';
}

function cellsTable(cells) {
  const header =
    '| Seed | Rep | Result | Findings | Unverified | Turns (approved/declined) | Local (failed) | Wall | Input (cached) | Output |';
  const rule = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
  const rows = cells.map((row) =>
    row.failed
      ? `| ${row.seed} | ${row.rep} | ${describeDetection(row)} | — | — | — | — | ${seconds(row.wallSeconds ?? 0)} | — | — |`
      : `| ${row.seed} | ${row.rep} | ${describeDetection(row)} | ${row.findingsCount} | ${row.unverified} | ${row.turns.approved}/${row.turns.declined} | ${row.localCommands.started} (${row.localCommands.failed}) | ${seconds(row.wallSeconds)} | ${tokens(row.usage.input)} (${tokens(row.usage.cached)}) | ${(row.usage.output / 1000).toFixed(1)}k |`
  );
  return [header, rule, ...rows].join('\n');
}

function decisionsList(cells) {
  const lines = [];
  for (const row of cells) {
    for (const decision of row.decisions ?? []) {
      const verdict = decision.approved
        ? `approved, exit ${decision.exit}`
        : `declined: ${decision.reason}`;
      lines.push(`* \`${row.seed}\` r${row.rep} — ${verdict} — \`${cell(decision.command)}\``);
    }
  }
  return lines.length > 0 ? lines.join('\n') : '_The rival made no broker request in any cell._';
}

// Counted from the recorded cells, not the run's seed list: a resumed run that names one seed
// still reports the whole directory of results it renders.
export function renderReport({
  runId,
  startedAt,
  base,
  rival,
  model,
  effort,
  reps,
  cells,
  summary,
}) {
  const seedNames = new Set(cells.filter((cell) => !cell.control).map((cell) => cell.seed));
  const controlNames = new Set(cells.filter((cell) => cell.control).map((cell) => cell.seed));
  const seededCount = seedNames.size;
  const controlCount = controlNames.size;
  return `# Rival-agent bench — ${startedAt.slice(0, 10)}

Run \`${runId}\`, rival **${rival}** (\`${model}\`, effort \`${effort}\`), base ${base}, ${seededCount} seeds and ${controlCount} controls, ${reps} repetition${reps === 1 ? '' : 's'} per cell. Each cell launches the rival on the seeded working tree with \`--fresh\` and the bench serving the broker: requests that stay inside the worktree are approved and run, everything else is declined.

## Summary

${summaryTable(summary)}

"Seeds detected" counts a finding anchored to the seeded file at the seeded lines (within three lines) or naming the defect; "severity met" additionally requires the finding's severity at or above the key's floor.

## Cells

${cellsTable(cells)}

## Broker requests

${decisionsList(cells)}
`;
}
