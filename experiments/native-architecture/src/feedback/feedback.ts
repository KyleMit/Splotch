import {
  MAX_REPORT_MESSAGE_LENGTH,
  parseReportKind,
  type ReportKind,
  type ReportRequestBody,
} from './report';
import { describeDeviceInfo, sanitizeDeviceInfo, type DeviceInfo } from './deviceReport';
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

const EMPTY_DRAFT: FeedbackDraft = { kind: 'bug', message: '', includeDevice: false };

function initialFeedbackState(sharedParent: boolean, gate: FeedbackGateState): NativeFeedbackState {
  return {
    sharedParent,
    open: false,
    draft: EMPTY_DRAFT,
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

// A report the owner cannot reach mid-send keeps its delivery state; any other edit clears the
// last outcome.
function settledDelivery(delivery: FeedbackDeliveryState) {
  return delivery.status === 'sending' || delivery.status === 'throttled'
    ? {}
    : { delivery: { status: 'idle' } as const };
}

// The snapshot goes out once the grown-up check passes: Parent Center's when the product shares
// one, else this owner's own, and only while `current` still holds.
function routeDelivery(
  snapshot: FeedbackSnapshot,
  route: {
    parent: ParentOperationPort | undefined;
    gate: ReturnType<typeof createFeedbackGate>;
    delivery: ReturnType<typeof createFeedbackDelivery>;
  },
  current: () => boolean
) {
  const submit = () => void route.delivery.submit(snapshot);
  if (!route.parent) {
    route.gate.request(submit);
    return;
  }
  route.parent.request('feedback', (proof) => {
    if (proof.valid() && current()) submit();
  });
}

// What the device-details disclosure lists: the rows a bug report would attach, or none when the
// device cannot describe itself.
function describeFeedbackDevice(device: () => DeviceInfo) {
  try {
    return describeDeviceInfo(sanitizeDeviceInfo(device()));
  } catch {
    return [];
  }
}

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
      update({ draft: EMPTY_DRAFT, preview: null });
    },
    now
  );
  function replaceDraft(draft: FeedbackDraft) {
    parent?.cancel('feedback');
    revision += 1;
    update({ draft, preview: null, validation: '', ...settledDelivery(state.delivery) });
  }
  function edit(next: Partial<FeedbackDraft>) {
    const draft = { ...state.draft, ...next };
    if (draft.kind === 'feature') draft.includeDevice = false;
    replaceDraft(draft);
  }
  // A snapshot is withdrawn when its draft changes, the owner goes, or `shown` says its form closed.
  function deliver(snapshot: FeedbackSnapshot, shown: () => boolean) {
    if (!state.policyReady || !delivery.available() || disposed) return;
    routeDelivery(
      snapshot,
      { parent, gate, delivery },
      () => !disposed && shown() && state.preview === snapshot && snapshot.revision === revision
    );
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
      if (state.preview) deliver(state.preview, () => state.open);
    },
    // The Settings form's Send report: the shipping form checks the draft and sends it behind the
    // grown-up check in one step, with no review page. A check raised from Settings may close
    // Settings while it is answered, so only a changed draft withdraws the report.
    submit() {
      const result = buildFeedbackPreview(state.draft, revision, device);
      if (!result.ok) {
        update({ validation: result.message });
        return;
      }
      update({ preview: result.snapshot, validation: '' });
      deliver(result.snapshot, () => true);
    },
    // Each visit to the Settings form starts from an empty draft, as the shipping form does; a
    // report already on its way keeps going.
    reset() {
      replaceDraft(EMPTY_DRAFT);
    },
    deviceRows: () => describeFeedbackDevice(device),
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
