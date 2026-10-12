import { aiProvider } from '../../web/src/lib/server/ai/provider';
import { openGenerationAttempts } from '../../web/src/lib/server/generationAttempts';
import { createRecoveryWorker } from '../../web/src/lib/server/generationAttemptWorker';
import { recoveryServiceEnabled } from '../../web/src/lib/server/generationAttemptPolicy';
export default createRecoveryWorker({
  enabled: () => recoveryServiceEnabled(process.env.AI_RECOVERY_V1_ENABLED),
  secret: () => process.env.REPORT_TOKEN_SECRET,
  projectKey: () => process.env.OPENAI_API_KEY,
  usageSecret: () => process.env.USAGE_GRANT_ID_SECRET,
  attempts: openGenerationAttempts,
  provider: aiProvider,
  now: Date.now,
});

export const config = { background: true };
