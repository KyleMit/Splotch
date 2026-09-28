// The feedback report's shared vocabulary — the two kinds, the message cap, and
// the JSON body the in-app forms send. Kept free of browser- and server-only
// imports so the form fields (components/report/ReportFields.svelte), the
// client that posts them (lib/reportClient.ts), the JSON endpoint, and the
// /feedback form action all read one declaration instead of agreeing by hand:
// the textarea's `maxlength` and the server's truncation are the same number,
// the picker can't offer a kind the server rejects, and every door reads a
// submitted kind through `parseReportKind`.
//
// tools/api-smoke/run-local-contract.mjs loads this file in plain Node, where
// `$lib` does not resolve, so its imports stay type-only.

import type { DeviceInfo } from '$lib/platform/deviceReport';

export type ReportKind = 'bug' | 'feature';

export const MAX_REPORT_MESSAGE_LENGTH = 4000;

export const REPORT_HONEYPOT_FIELD = 'hp';

export const REPORT_KINDS: { value: ReportKind; label: string }[] = [
  { value: 'bug', label: "Something's broken" },
  { value: 'feature', label: 'I have an idea' },
];

export function parseReportKind(raw: unknown): ReportKind | null {
  return REPORT_KINDS.find((option) => option.value === raw)?.value ?? null;
}

/**
 * The `/api/report` JSON body. The server core's input (`ReportInput` in
 * $lib/server/report) is keyed by this type, so renaming a key here fails to
 * compile at both ends of the wire.
 */
export interface ReportRequestBody {
  kind: ReportKind;
  message: string;
  /** Present only when the parent opts in, and only for a bug. */
  device?: DeviceInfo;
  /** The honeypot a human never fills; see the quiet-accept branch in submitReport. */
  [REPORT_HONEYPOT_FIELD]?: string;
}
