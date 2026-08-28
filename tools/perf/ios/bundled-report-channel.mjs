import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, sleep, tryCapture } from '../../lib/proc.mjs';

const PREFERENCES_FILE_TIMEOUT_MS = 20_000;
const PREFERENCES_FILE_POLL_MS = 500;
const CAPTURE_REPORT_SCHEMA = 1;

const CAPACITOR_CONFIG = JSON.parse(
  readFileSync(join(ROOT, 'capacitor.config.json'), 'utf8')
);
const BUNDLED_IOS_ORIGIN = `${CAPACITOR_CONFIG.server?.iosScheme ?? 'capacitor'}://localhost`;

export function iosBundledPageProblem(url, origin = BUNDLED_IOS_ORIGIN) {
  if (url === origin || url.startsWith(`${origin}/`) || url.startsWith(`${origin}?`)) return null;
  return `page is ${url}, not the bundled Capacitor origin (${origin})`;
}

export function reportStringFromPreferences(preferences, nonce) {
  const matches = Object.entries(preferences).filter(
    ([key, value]) =>
      typeof value === 'string' && (key === nonce || key.endsWith(`.${nonce}`))
  );
  if (matches.length !== 1) {
    throw new Error(
      `Preferences contained ${matches.length} values for bundled-capture nonce ${nonce}`
    );
  }
  return matches[0][1];
}

export function bundledReportPayloadProblem(payload, { nonce, bytes, pageUrl }) {
  if (!payload || typeof payload !== 'object') return 'the Preferences value is not an object';
  if (payload.schema !== CAPTURE_REPORT_SCHEMA) {
    return `report schema is ${payload.schema ?? 'absent'}, not ${CAPTURE_REPORT_SCHEMA}`;
  }
  if (payload.nonce !== nonce) return `report nonce is ${payload.nonce ?? 'absent'}, not ${nonce}`;
  if (payload.pageUrl !== pageUrl) {
    return `report page is ${payload.pageUrl ?? 'absent'}, not the armed page ${pageUrl}`;
  }
  const originProblem = iosBundledPageProblem(payload.pageUrl);
  if (originProblem) return originProblem;
  if (!payload.userAgent) return 'the report carries no user agent';
  const counts = payload.report?.meta?.counts;
  if (!counts) return 'the report carries no probe counts';
  if (payload.report.meta.ua !== payload.userAgent) {
    return 'the report wrapper and probe disagree about the page user agent';
  }
  for (const name of ['frames', 'events', 'measures']) {
    if (!Array.isArray(payload.report[name])) return `the report has no ${name} table`;
    if (payload.report[name].length !== counts[name]) {
      return `${name} has ${payload.report[name].length} rows, not the recorded ${counts[name]}`;
    }
  }
  const actualBytes = Buffer.byteLength(JSON.stringify(payload));
  if (actualBytes !== bytes) return `pulled ${actualBytes} bytes, not the page's ${bytes}`;
  return null;
}

function readPreferencesFile(path) {
  const converted = tryCapture('plutil', ['-convert', 'json', '-o', '-', path]);
  if (!converted.ok) throw new Error(`plutil could not read Preferences: ${converted.stderr}`);
  return JSON.parse(converted.stdout);
}

export async function pullBundledReportFromDevice({
  deviceId,
  bundleId,
  nonce,
  timeoutMs = PREFERENCES_FILE_TIMEOUT_MS,
}) {
  const scratch = mkdtempSync(join(tmpdir(), 'splotch-bundled-report-'));
  const destination = join(scratch, 'preferences.plist');
  const source = `Library/Preferences/${bundleId}.plist`;
  const deadline = Date.now() + timeoutMs;
  let lastProblem = 'Preferences plist was not available';
  try {
    while (Date.now() < deadline) {
      rmSync(destination, { force: true });
      const copied = tryCapture('xcrun', [
        'devicectl',
        'device',
        'copy',
        'from',
        '--device',
        deviceId,
        '--domain-type',
        'appDataContainer',
        '--domain-identifier',
        bundleId,
        '--source',
        source,
        '--destination',
        destination,
        '--quiet',
      ]);
      if (!copied.ok) {
        lastProblem = copied.stderr.trim() || 'devicectl copy failed';
      } else {
        try {
          const preferences = readPreferencesFile(destination);
          const serialized = reportStringFromPreferences(preferences, nonce);
          return { payload: JSON.parse(serialized), bytes: Buffer.byteLength(serialized), source };
        } catch (error) {
          lastProblem = error.message;
        }
      }
      await sleep(PREFERENCES_FILE_POLL_MS);
    }
    throw new Error(`Could not pull bundled report from ${source}: ${lastProblem}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
