import { attachesDevice, type ReportRequestBody } from './report';
import { sanitizeDeviceInfo, type DeviceInfo } from './deviceReport';
import type { FeedbackDraft, FeedbackSnapshot } from './feedback';

export function buildFeedbackPreview(
  draft: FeedbackDraft,
  revision: number,
  device: () => DeviceInfo
): { ok: true; snapshot: FeedbackSnapshot } | { ok: false; message: string } {
  const message = draft.message.trim();
  if (!message) return { ok: false, message: 'Please type a short description.' };
  let details: DeviceInfo | undefined;
  try {
    if (attachesDevice(draft.kind, draft.includeDevice))
      details = Object.freeze(sanitizeDeviceInfo(device()));
  } catch {
    return { ok: false, message: 'Device details are unavailable. Turn them off to continue.' };
  }
  const body: ReportRequestBody = {
    kind: draft.kind,
    message,
    hp: '',
    ...(details ? { device: details } : {}),
  };
  return { ok: true, snapshot: Object.freeze({ revision, body: Object.freeze(body) }) };
}
