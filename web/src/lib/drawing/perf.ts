// Build-flag-gated user-timing marks on the drawing hot paths, read by the
// profiling harness (scripts/perf/). __PERF_MARKS__ is a compile-time literal
// (false unless built with PERF_MARKS=true), so every `if (PERF_MARKS)` block —
// including its mark/measure name strings — dead-code-eliminates in production.
export const PERF_MARKS = typeof __PERF_MARKS__ !== 'undefined' && __PERF_MARKS__;
