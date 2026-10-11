import {
  MAX_REPORT_MESSAGE_LENGTH,
  parseReportKind,
  type ReportKind,
  type ReportRequestBody,
} from './report';
import type { DeviceInfo } from './deviceReport';
import { truncateCodeUnits } from './truncate';
import { createFeedbackGate, type FeedbackGateMode, type FeedbackGateState } from './feedbackGate';
import type { FeedbackTransport } from './feedbackTransport';
import { createFeedbackDelivery, type FeedbackDeliveryState } from './feedbackDelivery';
import {
  createFeedbackPolicy,
  DEFAULT_FEEDBACK_POLICY,
  type FeedbackPolicyStorage,
} from './feedbackPolicy';
import { buildFeedbackPreview } from './feedbackPreview';
export type { FeedbackPolicyStorage } from './feedbackPolicy';

export type FeedbackDraft = Readonly<{ kind: ReportKind; message: string; includeDevice: boolean }>;
export type FeedbackSnapshot = Readonly<{ revision: number; body: Readonly<ReportRequestBody> }>;
export type NativeFeedbackState = Readonly<{
  open: boolean;
  draft: FeedbackDraft;
  preview: FeedbackSnapshot | null;
  gate: FeedbackGateState;
  policy: FeedbackGateMode;
  policyReady: boolean;
  policyMessage: string;
  delivery: FeedbackDeliveryState;
  validation: string;
}>;

export function createNativeFeedback({
  transport,
  device,
  offline,
  policyStorage,
  now,
  random,
}: {
  transport: FeedbackTransport;
  device: () => DeviceInfo;
  offline: () => boolean;
  policyStorage: FeedbackPolicyStorage;
  // Test seams let lockout checks advance the actual controller's clock without waiting minutes.
  now?: () => number;
  random?: () => number;
}) {
  const listeners = new Set<() => void>();
  let disposed = false;
  let revision = 0;
  const gate = createFeedbackGate((gateState) => update({ gate: gateState }), now, random);
  const policy = createFeedbackPolicy(policyStorage, gate, update);
  let state: NativeFeedbackState = {
    open: false,
    draft: { kind: 'bug', message: '', includeDevice: false },
    preview: null,
    gate: gate.getState(),
    ...DEFAULT_FEEDBACK_POLICY,
    delivery: { status: 'idle' },
    validation: '',
  };
  function update(next: Partial<NativeFeedbackState>) {
    if (disposed) return;
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }
  const delivery = createFeedbackDelivery(
    transport,
    offline,
    (delivery) => update({ delivery }),
    (snapshot) => {
      if (snapshot.revision !== revision) return;
      revision += 1;
      update({ draft: { kind: 'bug', message: '', includeDevice: false }, preview: null });
    },
    now
  );
  function edit(next: Partial<FeedbackDraft>) {
    revision += 1;
    const draft = { ...state.draft, ...next };
    if (draft.kind === 'feature') draft.includeDevice = false;
    update({ draft, preview: null, validation: '' });
  }
  const owner = {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    loadPolicy: policy.load,
    open() {
      update({ open: true });
    },
    close() {
      gate.dismiss();
      update({ open: false });
    },
    setKind(value: unknown) {
      const kind = parseReportKind(value);
      if (kind) edit({ kind });
    },
    setMessage(message: string) {
      edit({ message: truncateCodeUnits(message, MAX_REPORT_MESSAGE_LENGTH) });
    },
    setIncludeDevice(includeDevice: boolean) {
      edit({ includeDevice });
    },
    preview() {
      const result = buildFeedbackPreview(state.draft, revision, device);
      update(
        result.ok ? { preview: result.snapshot, validation: '' } : { validation: result.message }
      );
    },
    editPreview() {
      gate.dismiss();
      update({ preview: null });
    },
    send() {
      if (!state.policyReady || !state.preview || !delivery.available() || disposed) return;
      const snapshot = state.preview;
      gate.request(() => {
        void delivery.submit(snapshot);
      });
    },
    cancelSending: delivery.cancel,
    deliveryTick: delivery.tick,
    changePolicy: policy.change,
    gateInput: gate.input,
    gateAnswer: gate.answer,
    gateTick: gate.tick,
    dismissGate: gate.dismiss,
    dispose() {
      disposed = true;
      policy.dispose();
      gate.dismiss();
      delivery.dispose();
      listeners.clear();
    },
  };
  return owner;
}
export type NativeFeedbackOwner = ReturnType<typeof createNativeFeedback>;
