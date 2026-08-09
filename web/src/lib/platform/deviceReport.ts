// Shared, dependency-free shaping of the optional device info a parent may
// attach to a feedback report. Kept free of browser- and server-only imports so
// both the client collector (`deviceInfo.ts`) and the `/api/report` endpoint can
// use it — the field order and labels live here once so the parent-facing
// preview and the Markdown written into the GitHub issue can never drift.

export interface DeviceInfo {
  app?: string;
  platform?: string;
  os?: string;
  device?: string;
  browser?: string;
  screen?: string;
  viewport?: string;
  pixelRatio?: string;
  language?: string;
  display?: string;
  online?: string;
}

// Ordered [key, human label] pairs. Every value is a plain string so the
// preview, the wire payload, and the issue Markdown all share one shape.
const FIELD_LABELS: [keyof DeviceInfo, string][] = [
  ['app', 'App version'],
  ['platform', 'Platform'],
  ['os', 'Operating system'],
  ['device', 'Device'],
  ['browser', 'Browser'],
  ['screen', 'Screen'],
  ['viewport', 'Window'],
  ['pixelRatio', 'Pixel ratio'],
  ['language', 'Language'],
  ['display', 'Display mode'],
  ['online', 'Online'],
];

/** Present fields as ordered { label, value } rows, dropping any that are blank. */
export function describeDeviceInfo(info: DeviceInfo): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const [key, label] of FIELD_LABELS) {
    const value = info[key];
    if (typeof value === 'string' && value.trim()) rows.push({ label, value: value.trim() });
  }
  return rows;
}

const MAX_FIELD_LENGTH = 200;

/**
 * Server-side hardening for a device payload arriving from an untrusted client:
 * keep only known keys, coerce to trimmed single-line strings, and cap length so
 * a hostile caller can't inject huge or Markdown-breaking content into the issue
 * body. Backticks and newlines are stripped for the same reason.
 */
export function sanitizeDeviceInfo(raw: unknown): DeviceInfo {
  const info: DeviceInfo = {};
  if (!raw || typeof raw !== 'object') return info;
  const source = raw as Record<string, unknown>;
  for (const [key] of FIELD_LABELS) {
    const value = source[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const cleaned = String(value)
        .replace(/[\r\n`]+/g, ' ')
        .trim()
        .slice(0, MAX_FIELD_LENGTH);
      if (cleaned) info[key] = cleaned;
    }
  }
  return info;
}
