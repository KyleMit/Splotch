import { apiHandler } from '../http';
import { recoveryAttemptHandlers } from '../generationAttemptProduction';
import type { ApiHandler } from './apiEvent';
export const GET: ApiHandler = apiHandler(recoveryAttemptHandlers.GET);
export const POST: ApiHandler = apiHandler(recoveryAttemptHandlers.POST);
