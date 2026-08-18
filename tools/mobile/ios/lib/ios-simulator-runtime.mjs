const IOS_RUNTIME_PREFIX = 'com.apple.CoreSimulator.SimRuntime.iOS-';

export const IOS_RUNTIME_VERSION_PATTERN = /^\d+\.\d+$/;

export function iosRuntimeIdentifier(version) {
  return `${IOS_RUNTIME_PREFIX}${version.replaceAll('.', '-')}`;
}

export function availableIphonesByNewestRuntime(devices, requestedRuntime) {
  const requestedIdentifier = requestedRuntime ? iosRuntimeIdentifier(requestedRuntime) : undefined;

  return Object.entries(devices)
    .filter(
      ([runtime]) =>
        runtime.includes('iOS') && (!requestedIdentifier || runtime === requestedIdentifier)
    )
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .flatMap(([runtime, list]) =>
      list.filter((device) => device.name.includes('iPhone')).map((device) => ({ runtime, ...device }))
    );
}

export function selectIphoneSimulator(devices, requestedRuntime) {
  const iphones = availableIphonesByNewestRuntime(devices, requestedRuntime);
  return iphones.find((device) => device.state === 'Booted') ?? iphones[0];
}
