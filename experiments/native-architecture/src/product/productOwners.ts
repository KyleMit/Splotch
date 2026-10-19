import { Platform } from 'react-native';
import { createNativeFeedback } from '../feedback/feedback';
import { createNativeAi } from '../ai/generation';
import { feedbackDevice, feedbackPolicyStorage, feedbackTransport } from '../platform/feedback';
import { aiDismissal, aiStorage, aiTransport, aiVault, admitAiImage } from '../platform/ai';
import { aiOriginalId, prepareAiPng } from '../ai/prepare';
import { serializeDrawing } from '../drawing/drawingFormat';
import type { ParentOperationPort } from '../parentCenter/parentPolicy';
import type { useDrawingScreen } from '../useDrawingScreen';

// The owners the drawing product reaches only on a parent's request: feedback, and AI generation
// with its recovery, storage and vault. productOwnersLoader.ts decides when this module loads.
export function createProductOwners(
  screenRef: { current: ReturnType<typeof useDrawingScreen> },
  parent: ParentOperationPort,
  online: () => boolean
) {
  const device = () => feedbackDevice(online());
  const feedback = createNativeFeedback({
    transport: feedbackTransport,
    device,
    policyStorage: feedbackPolicyStorage,
    parent,
  });
  const ai = createNativeAi({
    vault: aiVault,
    storage: aiStorage,
    dismissal: aiDismissal,
    transport: aiTransport,
    admit: admitAiImage,
    parent,
    problems: {
      platform: Platform.OS,
      transport: feedbackTransport,
      device,
    },
    async prepare() {
      const current = screenRef.current;
      const surface = current.surface.current;
      if (!surface || current.disabled || current.dialogOpen || current.drawing)
        throw new Error('Lift your finger before preparing an AI picture.');
      const release = surface.lockInput();
      try {
        const drawing = current.currentDrawing();
        const captured = await surface.captureAiPng(drawing);
        if (current.currentDrawing() !== drawing || !captured.isCurrent())
          throw new Error('The drawing changed during capture.');
        const bytes = prepareAiPng(captured.base64, captured.size);
        return {
          bytes,
          originalId: aiOriginalId(),
          originalModel: serializeDrawing(drawing),
        };
      } finally {
        release();
      }
    },
  });
  return { feedback, ai };
}

export type ProductOwners = ReturnType<typeof createProductOwners>;
