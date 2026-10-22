import { isFeedbackGateMode, type FeedbackGateMode } from './feedbackGate';

export const MAX_FEEDBACK_POLICY_BYTES = 128;
export const FEEDBACK_POLICY_KEY = 'splotch-candidate:feedback-policy-v1';
export const FEEDBACK_POLICY_FILE = 'splotch-feedback-policy-v1.json';

export function parseFeedbackPolicy(snapshot: string | null): FeedbackGateMode | null {
  if (snapshot === null) return null;
  if (snapshot.length > MAX_FEEDBACK_POLICY_BYTES) throw new Error('Invalid feedback policy');
  const raw: unknown = JSON.parse(snapshot);
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    !('version' in raw) ||
    raw.version !== 1 ||
    !('mode' in raw) ||
    !isFeedbackGateMode(raw.mode) ||
    Object.keys(raw).sort().join(',') !== 'mode,version'
  )
    throw new Error('Invalid feedback policy');
  return raw.mode;
}

export function feedbackPolicySnapshot(mode: FeedbackGateMode): string {
  if (!isFeedbackGateMode(mode)) throw new Error('Invalid feedback policy');
  return JSON.stringify({ version: 1, mode });
}

export type FeedbackPolicyStorage = {
  read: () => Promise<unknown>;
  write: (mode: FeedbackGateMode) => Promise<void>;
};
export type FeedbackPolicyState = Readonly<{
  policy: FeedbackGateMode;
  policyReady: boolean;
  policyMessage: string;
}>;
export const DEFAULT_FEEDBACK_POLICY: FeedbackPolicyState = {
  policy: 'always',
  policyReady: false,
  policyMessage: '',
};

export function createFeedbackPolicy(
  storage: FeedbackPolicyStorage,
  gate: ReturnType<typeof import('./feedbackGate').createFeedbackGate>,
  publish: (state: FeedbackPolicyState) => void
) {
  let disposed = false;
  let ready = false;
  let loading = false;
  let loaded = false;
  let writing = false;
  return {
    async load() {
      if (loaded || loading || disposed) return;
      loading = true;
      try {
        const stored = await storage.read();
        if (disposed) return;
        if (stored !== null && !isFeedbackGateMode(stored))
          throw new Error('Invalid feedback policy');
        const policy = stored ?? 'always';
        gate.loadMode(policy);
        ready = true;
        publish({ policy, policyReady: true, policyMessage: '' });
      } catch {
        if (disposed) return;
        gate.loadMode('always');
        ready = true;
        publish({
          policy: 'always',
          policyReady: true,
          policyMessage: 'Feedback protection could not be read. Every time is active.',
        });
      } finally {
        loading = false;
        loaded = true;
      }
    },
    change(policy: FeedbackGateMode) {
      if (!isFeedbackGateMode(policy) || !ready || writing || disposed) return;
      gate.request(() => {
        if (disposed) return;
        writing = true;
        ready = false;
        publish({
          policy: 'always',
          policyReady: false,
          policyMessage: 'Saving feedback protection…',
        });
        void (async () => {
          try {
            await storage.write(policy);
            if (disposed) return;
            gate.loadMode(policy);
            publish({ policy, policyReady: true, policyMessage: 'Feedback protection saved.' });
          } catch {
            if (disposed) return;
            gate.loadMode('always');
            publish({
              policy: 'always',
              policyReady: true,
              policyMessage: 'Feedback protection could not be saved. Every time is active.',
            });
          } finally {
            writing = false;
            ready = true;
          }
        })();
      }, true);
    },
    dispose() {
      disposed = true;
    },
  };
}
