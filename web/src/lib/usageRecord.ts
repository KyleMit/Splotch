import type { StyleName } from './ai/styles';

export const USAGE_RECORD_RETENTION_DAYS = 30;

export const USAGE_OUTCOMES = ['accepted', 'succeeded', 'refused', 'failed'] as const;

export type UsageOutcome = (typeof USAGE_OUTCOMES)[number];

// One managed access code's generation tally: the record the server stores and
// the /admin console renders.
export interface TokenUsage {
  count: number;
  firstUsed: string;
  lastUsed: string;
  deleteAfter: string;
  lastStyle: StyleName | null;
  lastOutcome: UsageOutcome;
}
