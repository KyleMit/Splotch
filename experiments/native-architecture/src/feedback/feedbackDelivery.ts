import type { FeedbackSnapshot } from './feedback';
import {
  sendFeedback,
  FEEDBACK_UNKNOWN_DELIVERY_NOTICE,
  type FeedbackOutcome,
  type FeedbackTransport,
} from './feedbackTransport';

export type FeedbackDeliveryState =
  | { status: 'idle' }
  | { status: 'sending'; id: number; snapshot: FeedbackSnapshot }
  | FeedbackOutcome;

export function createFeedbackDelivery(
  transport: FeedbackTransport,
  publish: (state: FeedbackDeliveryState) => void,
  succeeded: (snapshot: FeedbackSnapshot) => void
) {
  let disposed = false;
  let nextId = 0;
  let active: { id: number; controller: AbortController } | null = null;
  function available() {
    return !disposed && active === null;
  }
  return {
    available,
    async submit(snapshot: FeedbackSnapshot) {
      if (!available()) return;
      const id = ++nextId;
      const controller = new AbortController();
      active = { id, controller };
      publish({ status: 'sending', id, snapshot });
      const result = await sendFeedback(transport, snapshot.body, controller);
      if (disposed || active?.id !== id) return;
      active = null;
      if (result.status === 'success') succeeded(snapshot);
      publish(result);
    },
    // Lets a request finish on its own without reporting back: the network call is not aborted,
    // since the report may already have arrived, but its outcome never reaches the state, and a new
    // request may start at once. Shipping's ReportForm detaches the same way on each visit.
    detach() {
      active = null;
    },
    cancel(requestId: number) {
      const old = active;
      if (!old || old.id !== requestId) return;
      active = null;
      old.controller.abort();
      publish({
        status: 'cancelled',
        message: `Sending stopped. ${FEEDBACK_UNKNOWN_DELIVERY_NOTICE}`,
      });
    },
    dispose() {
      disposed = true;
      active = null;
    },
  };
}
