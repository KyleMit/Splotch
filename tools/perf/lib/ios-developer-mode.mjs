export function iosDeveloperModeCheck(result) {
  let details;
  try {
    details = JSON.parse(result.out);
  } catch {
    return {
      name: 'ios developer mode',
      status: 'warn',
      detail: `could not read CoreDevice status${result.err ? `: ${result.err}` : ''}`,
      enabled: null,
    };
  }

  const mode = details.result?.properties?.state?.developerModeStatus?.enabled?.mode;
  const legacy = details.result?.deviceProperties?.developerModeStatus;
  let enabled = null;
  if (mode === 0 || mode === 1) enabled = mode === 1;
  else if (legacy === 'enabled' || legacy === 'disabled') enabled = legacy === 'enabled';
  if (enabled === false) {
    return {
      name: 'ios developer mode',
      status: 'blocked',
      detail:
        'off. On the device: Settings → Privacy & Security → Developer Mode → On; ' +
        'restart, unlock, and confirm Turn On. Then re-run preflight.',
      enabled,
    };
  }
  return {
    name: 'ios developer mode',
    status: enabled ? 'ok' : 'warn',
    detail: enabled ? 'enabled' : 'CoreDevice did not report a known Developer Mode state',
    enabled,
  };
}
