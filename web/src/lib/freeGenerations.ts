export const FREE_GENERATION_LIMIT = 10;

export interface FreeGenerationGrantStatus {
  ok: true;
  remaining: number;
  limit: number;
}

export const FREE_GRANT_EXHAUSTED_CODE = 'FREE_GRANT_EXHAUSTED';

export interface FreeGenerationGrantExhausted {
  ok: false;
  code: typeof FREE_GRANT_EXHAUSTED_CODE;
  error: string;
  remaining: 0;
}

export type FreeGenerationFailureKind =
  | 'abandoned'
  | 'exhausted'
  | 'invalid-request'
  | 'safety'
  | 'upstream';

export interface FreeGenerationGrantAdminStats {
  persistent: boolean;
  dailyProviderStarts: number;
  dailyProviderStartLimit: number;
  sampledGrantCount: number;
  grantSampleLimit: number;
  grantSamplePartial: boolean;
  sampledSuccessful: number;
  sampledAttempts: number;
  sampledFailures: number;
  sampledActiveGrants: number;
  sampledExhaustedGrants: number;
  sampledActiveReservations: number;
  recent: Array<{
    installation: string;
    successful: number;
    attempts: number;
    failures: number;
    remaining: number;
    lastActivityAt: string;
    lastFailureKind: FreeGenerationFailureKind | null;
  }>;
}
