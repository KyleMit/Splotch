export const USAGE_RECORD_RETENTION_DAYS = 30;

export const USAGE_OUTCOMES = ['accepted', 'succeeded', 'refused', 'failed'] as const;

export type UsageOutcome = (typeof USAGE_OUTCOMES)[number];
