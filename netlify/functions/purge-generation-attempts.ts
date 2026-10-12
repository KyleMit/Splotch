import { purgeExpiredGenerationAttempts } from '../../web/src/lib/server/generationAttemptSweep';
export default async () => {
  try {
    console.log('[purge-generation-attempts]', await purgeExpiredGenerationAttempts());
  } catch {
    console.warn('[purge-generation-attempts] sweep did not complete');
  }
};
export const config = { schedule: '@hourly' };
