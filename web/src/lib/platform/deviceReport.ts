// Shared, dependency-free shaping of the optional device info a parent may
// attach to a feedback report. Kept free of browser- and server-only imports so
// both the client collector (`deviceInfo.ts`) and the `/api/report` endpoint can
// use it — the field order and labels live here once so the parent-facing
// preview and the Markdown written into the GitHub issue can never drift.

import { truncateCodeUnits } from '$lib/truncate';

// Every field a report can carry, with its human label, in row order. The table
// is the DeviceInfo type, so a collector can't fill a field that has no label.
const DEVICE_INFO_LABELS = {
  app: 'App version',
  platform: 'Platform',
  os: 'Operating system',
  device: 'Device',
  browser: 'Browser',
  screen: 'Screen',
  viewport: 'Window',
  pixelRatio: 'Pixel ratio',
  language: 'Language',
  display: 'Display mode',
  online: 'Online',
};

type DeviceInfoField = keyof typeof DEVICE_INFO_LABELS;

// Every value is a plain string so the preview, the wire payload, and the issue
// Markdown all share one shape.
export type DeviceInfo = Partial<Record<DeviceInfoField, string>>;

// Object.keys widens to string[]; the keys of a closed literal are its fields.
// Exported for the tests that must cover every field.
export const DEVICE_INFO_FIELDS = Object.keys(DEVICE_INFO_LABELS) as DeviceInfoField[];

/** Present fields as ordered { label, value } rows, dropping any that are blank. */
export function describeDeviceInfo(info: DeviceInfo): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const key of DEVICE_INFO_FIELDS) {
    const value = info[key];
    if (typeof value === 'string' && value.trim()) {
      rows.push({ label: DEVICE_INFO_LABELS[key], value: value.trim() });
    }
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
  for (const key of DEVICE_INFO_FIELDS) {
    const value = source[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const cleaned = truncateCodeUnits(
        String(value)
          .replace(/[\r\n`]+/g, ' ')
          .trim(),
        MAX_FIELD_LENGTH
      );
      if (cleaned) info[key] = cleaned;
    }
  }
  return info;
}
