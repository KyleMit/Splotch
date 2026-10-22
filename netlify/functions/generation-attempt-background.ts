import { config as serverConfig } from '../server/config';
import { aiProvider } from '../server/ai/provider';
import { openGenerationAttempts } from '../server/generationAttempts';
import { createRecoveryWorker } from '../server/generationAttemptWorker';
import { recoveryServiceEnabled } from '../server/generationAttemptPolicy';
export default createRecoveryWorker({
  enabled: () => recoveryServiceEnabled(process.env.AI_RECOVERY_V1_ENABLED),
  secret: () => process.env.REPORT_TOKEN_SECRET,
  projectKey: serverConfig.openAiApiKey,
  usageSecret: () => process.env.USAGE_GRANT_ID_SECRET,
  attempts: openGenerationAttempts,
  provider: aiProvider,
  now: Date.now,
});

export const config = { background: true };
