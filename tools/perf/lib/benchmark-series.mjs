// Turns one capture's summary.json into the `customSmallerIsBetter` entries
// github-action-benchmark appends to a committed trend history (issue 688).
//
// Every entry name is prefixed with the series, and the series is derived
// from what the capture ran — target plus suite — so a fast and a full run, or
// an emulator and a WebKit run, can never share a chart. A summary without a
// suite label is refused rather than guessed.

const FRAME_METRICS = [{ key: 'longFrames', unit: 'frames', label: 'long frames (>32 ms)' }];

export function seriesName(settings) {
  const { target, suite } = settings ?? {};
  if (!target) throw new Error('summary.settings.target is missing');
  if (!suite) {
    throw new Error(
      `summary.settings.suite is missing for target ${target}; a series is keyed on the suite so fast and full runs never share a chart`
    );
  }
  return `${target}/${suite}`;
}

function entry(series, name, unit, value, extra) {
  return {
    name: `${series} · ${name}`,
    unit,
    value: Number(value.toFixed(2)),
    ...(extra ? { extra } : {}),
  };
}

export function benchmarkEntries(summary) {
  const series = seriesName(summary.settings);
  const entries = [];
  const hotPaths = summary.engineHotPaths ?? [];
  for (const measure of hotPaths) {
    entries.push(
      entry(series, `${measure.name} max`, 'ms', measure.maxMs, `${measure.count} samples`)
    );
    entries.push(entry(series, `${measure.name} avg`, 'ms', measure.avgMs));
  }
  if (summary.longTasks && typeof summary.longTasks.totalMs === 'number') {
    entries.push(
      entry(
        series,
        'long tasks total',
        'ms',
        summary.longTasks.totalMs,
        `${summary.longTasks.count} tasks`
      )
    );
  }
  if (summary.frames) {
    for (const metric of FRAME_METRICS) {
      const value = summary.frames[metric.key];
      if (typeof value === 'number') entries.push(entry(series, metric.label, metric.unit, value));
    }
  }
  if (!entries.length) {
    throw new Error(
      `summary for ${series} carries no engine.* measures, long tasks, or frames — an uninstrumented build?`
    );
  }
  return entries;
}
