import apiOrigin from '../api-origin.cjs';

const HOSTED_TEST_ORIGINS = new Set(apiOrigin.TEST_API_ORIGINS);

export function readHostedTestApiOrigin(env) {
  const origin = apiOrigin.readApiOrigin({
    EXPO_PUBLIC_SPLOTCH_API_ORIGIN:
      env.EXPO_PUBLIC_SPLOTCH_API_ORIGIN ?? apiOrigin.TEST_API_ORIGINS[0],
  });
  if (!HOSTED_TEST_ORIGINS.has(origin))
    throw new Error('Hosted UI journeys require a known test API origin');
  return origin;
}

export function requireVirtualTarget(platform, device, simulators = {}) {
  if (platform === 'android' && /^emulator-\d+$/.test(device)) return;
  if (
    platform === 'ios' &&
    Object.values(simulators)
      .flat()
      .some(
        (candidate) =>
          candidate.udid === device && candidate.state === 'Booted' && candidate.isAvailable
      )
  )
    return;
  throw new Error(
    'Hosted API journeys require an explicit Android emulator or booted iOS simulator'
  );
}
