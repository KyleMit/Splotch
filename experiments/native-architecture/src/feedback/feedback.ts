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
import type { ParentOperationPort } from '../parentCenter/parentPolicy';
export type { FeedbackPolicyStorage } from './feedbackPolicy';

export type FeedbackDraft = Readonly<{ kind: ReportKind; message: string; includeDevice: boolean }>;
export type FeedbackSnapshot = Readonly<{ revision: number; body: Readonly<ReportRequestBody> }>;
export type NativeFeedbackState = Readonly<{
  sharedParent?: boolean;
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

function initialFeedbackState(sharedParent: boolean, gate: FeedbackGateState): NativeFeedbackState {
  return {
    sharedParent,
    open: false,
    draft: { kind: 'bug', message: '', includeDevice: false },
    preview: null,
    gate,
    ...DEFAULT_FEEDBACK_POLICY,
    delivery: { status: 'idle' },
    validation: '',
  };
}

type NativeFeedbackOptions = {
  transport: FeedbackTransport;
  device: () => DeviceInfo;
  offline: () => boolean | null;
  policyStorage: FeedbackPolicyStorage;
  // Test seams let lockout checks advance the actual controller's clock without waiting minutes.
  now?: () => number;
  random?: () => number;
  parent?: ParentOperationPort;
};

export function createNativeFeedback({
  transport,
  device,
  offline,
  policyStorage,
  now,
  random,
  parent,
}: NativeFeedbackOptions) {
  const listeners = new Set<() => void>();
  let disposed = false;
  let revision = 0;
  const gate = createFeedbackGate((gateState) => update({ gate: gateState }), now, random);
  const policy = createFeedbackPolicy(policyStorage, gate, update);
  let state = initialFeedbackState(!!parent, gate.getState());
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
    parent?.cancel('feedback');
    revision += 1;
    const draft = { ...state.draft, ...next };
    if (draft.kind === 'feature') draft.includeDevice = false;
    update({
      draft,
      preview: null,
      validation: '',
      ...(state.delivery.status !== 'sending' && state.delivery.status !== 'throttled'
        ? { delivery: { status: 'idle' } as const }
        : {}),
    });
  }
  const owner = {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    loadPolicy: parent ? async () => update({ policyReady: true }) : policy.load,
    open() {
      update({ open: true });
    },
    close() {
      parent?.cancel('feedback');
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
      parent?.cancel('feedback');
      gate.dismiss();
      update({ preview: null });
    },
    send() {
      if (!state.policyReady || !state.preview || !delivery.available() || disposed) return;
      const snapshot = state.preview;
      if (parent) {
        parent.request('feedback', (proof) => {
          if (
            proof.valid() &&
            !disposed &&
            state.open &&
            state.preview === snapshot &&
            snapshot.revision === revision
          )
            void delivery.submit(snapshot);
        });
        return;
      }
      gate.request(() => {
        void delivery.submit(snapshot);
      });
    },
    cancelSending: delivery.cancel,
    deliveryTick: delivery.tick,
    changePolicy: parent ? () => {} : policy.change,
    gateInput: gate.input,
    gateAnswer: gate.answer,
    gateTick: gate.tick,
    dismissGate: gate.dismiss,
    dispose() {
      parent?.cancel('feedback');
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
