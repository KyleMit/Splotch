// Build-flag-gated user-timing marks on the drawing hot paths, read by the
// profiling harness (tools/perf/). __PERF_MARKS__ is a compile-time literal
// (false unless built with PERF_MARKS=true), so every `if (PERF_MARKS)` block —
// including its mark/measure name strings — dead-code-eliminates in production.
export const PERF_MARKS = typeof __PERF_MARKS__ !== 'undefined' && __PERF_MARKS__;

// SPIKE (issue 1774): a planted synchronous wait on the commit path, so a run can
// show whether the gate separates a regression of this size from its baseline.
export const PERF_PLANT_COMMIT_MS =
  typeof __PERF_PLANT_COMMIT_MS__ !== 'undefined' ? __PERF_PLANT_COMMIT_MS__ : 0;
