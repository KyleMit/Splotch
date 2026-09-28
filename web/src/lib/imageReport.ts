export const IMAGE_REPORT_RETENTION_DAYS = 30;

export const AI_REPORT_KINDS = ['picture', 'false-positive-refusal'] as const;
export type AiReportKind = (typeof AI_REPORT_KINDS)[number];

/** The `/api/report-image` multipart field names, set by lib/reportClient.ts and read by the route. */
export const IMAGE_REPORT_FORM_FIELDS = {
  kind: 'kind',
  drawing: 'drawing',
  output: 'output',
  style: 'style',
} as const;
