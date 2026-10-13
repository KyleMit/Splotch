import { apiHandler } from '$lib/server/http';
import { recoveryAttemptHandlers } from '$lib/server/generationAttemptProduction';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = apiHandler(recoveryAttemptHandlers.GET);
export const POST: RequestHandler = apiHandler(recoveryAttemptHandlers.POST);
