// v3 adds the runner-required undo plan and its timing/history/pixel proof to the report.
// Bump when a runner-required route appears or changes shape.
export const PROBE_HOST_PROTOCOL = 'splotch-perf-probe-v3';
export const PROBE_REPORT_PATH = '/__probe/report';

export function probeHostProtocolProblem(protocol) {
  return protocol === PROBE_HOST_PROTOCOL
    ? null
    : `it speaks ${protocol ?? 'no declared protocol'}, not ${PROBE_HOST_PROTOCOL} — restart the probe host`;
}

export async function probeHostJson(host, path, fetchImpl = fetch) {
  const url = new URL(path, host).toString();
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`${url} did not answer successfully (${response.status})`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `${url} did not answer with probe-host JSON (${contentType || 'no content type'}) — ` +
        'restart the probe host so its protocol matches the runner'
    );
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${url} returned invalid probe-host JSON — restart the probe host`, {
      cause: error,
    });
  }
}

export function fetchAcceptedProbeReport(host, fetchImpl = fetch) {
  return probeHostJson(host, PROBE_REPORT_PATH, fetchImpl);
}
