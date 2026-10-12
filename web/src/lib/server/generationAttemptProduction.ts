import { config } from './config';
import { openGenerationAttempts } from './generationAttempts';
import { openRecoveryAccounting } from './generationAttemptAccounting';
import { createRecoveryAttemptHandlers, type RecoveryEvent } from './generationAttemptService';
import { authorizeGenerationRequest } from './generationAuthorization';
import { prepareDeliveredImage } from './generationDelivery';
import { issueReportToken } from './reportToken';
import { dispatchRecoveryWork } from './generationAttemptDispatch';
import { validateRecoveryInput } from './generationAttemptRequest';
import { rateLimit } from './rateLimit';
import { generationAttemptBucket } from './rateLimitKeys';
import { rateLimitPolicy } from './rateLimitPolicy';
import { throttled } from './http';
function limitRecoveryRequest(event: RecoveryEvent): Response | null {
  const result = rateLimit(
    generationAttemptBucket(event.getClientAddress()),
    rateLimitPolicy.generationAttempt
  );
  return result.limited ? throttled(result.retryAfter) : null;
}
export const recoveryAttemptHandlers = createRecoveryAttemptHandlers({
  enabled: config.recoveryV1Enabled,
  secret: config.reportTokenSecret,
  attempts: openGenerationAttempts,
  accounting: openRecoveryAccounting,
  authorize: authorizeGenerationRequest,
  validateInput: validateRecoveryInput,
  dispatch: dispatchRecoveryWork,
  prepare: prepareDeliveredImage,
  reportToken: issueReportToken,
  limit: limitRecoveryRequest,
});
