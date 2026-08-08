import { purgeExpiredImageReports } from '../../web/src/lib/server/imageReportStore';

export default async () => {
  const result = await purgeExpiredImageReports();
  console.log('[purge-image-reports]', result);
};

export const config = { schedule: '@daily' };
