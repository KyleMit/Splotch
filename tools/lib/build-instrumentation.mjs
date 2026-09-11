export function isInstrumentedBuild(env) {
  return env.PERF_MARKS === 'true' || env.PUBLIC_ENABLE_DEV_HARNESS === 'true';
}
