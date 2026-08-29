export const PROBE_HOST_PROTOCOL = 'splotch-perf-probe-v2';
export const PROBE_REPORT_PATH = '/__probe/report';

export async function fetchAcceptedProbeReport(host, fetchImpl = fetch) {
  const response = await fetchImpl(`${host}${PROBE_REPORT_PATH}`);
  if (!response.ok) {
    throw new Error(`probe host has no accepted report (${response.status})`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `${host}${PROBE_REPORT_PATH} did not answer with probe-host JSON (${contentType || 'no content type'}) — ` +
        'restart the probe host so its protocol matches the runner'
    );
  }
  return response.json();
}
