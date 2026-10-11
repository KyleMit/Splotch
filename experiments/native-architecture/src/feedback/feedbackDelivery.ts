import type { FeedbackSnapshot } from './feedback';
import { sendFeedback, type FeedbackOutcome, type FeedbackTransport } from './feedbackTransport';

export type FeedbackDeliveryState =
  | { status: 'idle' }
  | { status: 'sending'; id: number; snapshot: FeedbackSnapshot }
  | FeedbackOutcome;
const SECONDS_TO_MS = 1000;

export function createFeedbackDelivery(
  transport: FeedbackTransport,
  offline: () => boolean,
  publish: (state: FeedbackDeliveryState) => void,
  succeeded: (snapshot: FeedbackSnapshot) => void,
  now: () => number = Date.now
) {
  let disposed = false;
  let nextId = 0;
  let active: { id: number; controller: AbortController } | null = null;
  let retryAt: number | null = null;
  function available() {
    return !disposed && active === null && (retryAt === null || now() >= retryAt);
  }
  return {
    available,
    async submit(snapshot: FeedbackSnapshot) {
      if (!available()) return;
      const id = ++nextId;
      const controller = new AbortController();
      active = { id, controller };
      publish({ status: 'sending', id, snapshot });
      const result = await sendFeedback(transport, snapshot.body, controller, offline);
      if (disposed || active?.id !== id) return;
      active = null;
      if (result.status === 'throttled') retryAt = now() + result.retryAfterSeconds * SECONDS_TO_MS;
      if (result.status === 'success') succeeded(snapshot);
      publish(result);
    },
    cancel(requestId: number) {
      const old = active;
      if (!old || old.id !== requestId) return;
      active = null;
      old.controller.abort();
      publish({
        status: 'cancelled',
        message: 'Sending stopped. Your report may have arrived. Check before sending again.',
      });
    },
    tick() {
      if (disposed || retryAt === null) return;
      const remaining = Math.max(0, Math.ceil((retryAt - now()) / SECONDS_TO_MS));
      if (remaining === 0) {
        retryAt = null;
        publish({ status: 'error', message: 'You can try sending your feedback again.' });
      } else
        publish({
          status: 'throttled',
          retryAfterSeconds: remaining,
          message: `Too many reports. Wait ${remaining} seconds before trying again.`,
        });
    },
    dispose() {
      disposed = true;
      active?.controller.abort();
      active = null;
    },
  };
}
