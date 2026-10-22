import { purgeTestData } from '../server/testDataRetention';

export default purgeTestData;

export const config = { schedule: '@hourly' };
