export const PROBE_HOST_PROTOCOL = 'splotch-perf-probe-v1';
export const PROBE_REPORT_PATH = '/__probe/report';

export async function fetchAcceptedProbeReport(host, fetchImpl = fetch) {
  const response = await fetchImpl(`${host}${PROBE_REPORT_PATH}`);
  if (!response.ok) {
    throw new Error(`probe host has no accepted report (${response.status})`);
  }
  return response.json();
}
