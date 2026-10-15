import { Platform } from 'react-native';
import { createNativeFeedback } from '../feedback/feedback';
import { createNativeAi } from '../ai/generation';
import { feedbackDevice, feedbackPolicyStorage, feedbackTransport } from '../platform/feedback';
import { aiDismissal, aiStorage, aiTransport, aiVault, admitAiImage } from '../platform/ai';
import { savePicture } from '../platform/drawingFiles';
import { prepareAiPng } from '../ai/prepare';
import { parseDrawing } from '../drawing/model';
import { drawingPaperSize } from '../drawing/paperSpace';
import type { ParentOperationPort } from '../parentCenter/parentPolicy';
import type { useDrawingScreen } from '../useDrawingScreen';

// The owners the drawing product reaches only on a parent's request: feedback, and AI generation
// with its recovery, storage and vault. productOwnersLoader.ts decides when this module loads.
export function createProductOwners(
  screenRef: { current: ReturnType<typeof useDrawingScreen> },
  parent: ParentOperationPort
) {
  const feedback = createNativeFeedback({
    transport: feedbackTransport,
    device: feedbackDevice,
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
      device: feedbackDevice,
    },
    async prepare() {
      const current = screenRef.current;
      const surface = current.surface.current;
      if (!surface || current.disabled || current.dialogOpen || current.drawing)
        throw new Error('Lift your finger before preparing an AI picture.');
      const release = surface.lockInput();
      try {
        const drawing = current.currentDrawing();
        const base64 = await surface.capturePng(drawing);
        if (current.currentDrawing() !== drawing)
          throw new Error('The drawing changed during capture.');
        const bytes = prepareAiPng(base64, drawingPaperSize(drawing));
        const original = await savePicture(drawing);
        return {
          bytes,
          originalId: original.id,
          originalModel: JSON.stringify(parseDrawing(drawing)),
        };
      } finally {
        release();
      }
    },
  });
  return { feedback, ai };
}

export type ProductOwners = ReturnType<typeof createProductOwners>;
