// Activation requires qualification of every reachable historical ledger writer, native durability,
// retained-output privacy, real Blobs CAS behavior and the scheduled sweep's workload capacity.
export const RECOVERY_SERVICE_QUALIFIED = false;
export const RECOVERY_PROMPT_POLICY_REVISION = 'splotch-ai-recovery-prompt-v1';
export const RECOVERY_WORKER_PATH = '/.netlify/functions/generation-attempt-background';
export const RECOVERY_WORK_TICKET_HEADER = 'X-AI-Recovery-Work-Ticket';
export const RECOVERY_WORK_DOMAIN = 'splotch-ai-recovery-worker-v1';
export const RECOVERY_WORK_CREDENTIAL_DOMAIN = 'splotch-ai-recovery-worker-credential-v1';
export const RECOVERY_WORK_CREDENTIAL_VERSION = 'aes256gcm-v1';
export const RECOVERY_WORK_MAX_BYTES = 8_192;
export const RECOVERY_MAX_CREDENTIAL_BYTES = 4_096;
export const RECOVERY_WORK_TICKET_AGE_MS = 60_000;
export const RECOVERY_WORK_TICKET_SKEW_MS = 5_000;
export const RECOVERY_WORK_DEADLINE_MS = 5 * 60 * 1_000;
export const RECOVERY_HANDOFF_TIMEOUT_MS = 5_000;
export const RECOVERY_COMPLETION_ATTEMPTS = 2;
export const RECOVERY_MAX_INPUT_PIXELS = 16 * 1024 * 1024;
export function recoveryServiceEnabled(requested: string | undefined): boolean {
  return RECOVERY_SERVICE_QUALIFIED && requested === 'true';
}
