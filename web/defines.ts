export function buildDefines({
  appVersion,
  buildTime,
  nativeApiBase,
  isCapacitor,
  perfMarks,
}: {
  appVersion: string;
  buildTime: string;
  nativeApiBase: string;
  isCapacitor: boolean;
  perfMarks: boolean;
}): Record<string, string> {
  return {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_TIME__: JSON.stringify(buildTime),
    __NATIVE_API_BASE__: JSON.stringify(nativeApiBase),
    __IS_CAPACITOR__: JSON.stringify(isCapacitor),
    __PERF_MARKS__: JSON.stringify(perfMarks),
  };
}
