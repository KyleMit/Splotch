// One line per item, `<outcome>  <subject>  <reason>`, so a run that takes a
// minute shows progress and a cancelled run still says what it did.

export function formatOutcomeLine({ outcome, subject, reason }, outcomeWidth) {
  return `${outcome.padEnd(outcomeWidth)}  ${subject}${reason ? `  ${reason}` : ''}`;
}

function countOutcomes(rows) {
  const counts = {};
  for (const { outcome } of rows) {
    const key = outcome.replace(/ \(.*$/, '');
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function formatSummary(rows) {
  return Object.entries(countOutcomes(rows))
    .map(([outcome, count]) => `${count} ${outcome}`)
    .join(', ');
}

export function outcomeWidth(rows) {
  return Math.max(4, ...rows.map((row) => row.outcome.length));
}
