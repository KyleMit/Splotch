import { purgeExpiredGenerationJobs } from '../../web/src/lib/server/generationJobs';

export default async () => {
  const result = await purgeExpiredGenerationJobs();
  console.log('[purge-generation-jobs]', result);
};

// Hourly rather than daily: these blobs are a child's drawing and the picture
// made from it, and the job they belong to is dead within GENERATION_JOB_TTL_MS.
// A daily sweep would leave an uncollected one at rest for most of a day.
export const config = { schedule: '@hourly' };
