export const IMAGE_REPORT_RETENTION_DAYS = 30;

export const AI_REPORT_KINDS = ['picture', 'false-positive-refusal'] as const;
export type AiReportKind = (typeof AI_REPORT_KINDS)[number];
