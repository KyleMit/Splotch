import { purgeExpiredUsageRecords } from '../server/usageRecordStorage';

export default async () => {
  const result = await purgeExpiredUsageRecords();
  console.log('[purge-usage-records]', result);
};

export const config = { schedule: '@daily' };
