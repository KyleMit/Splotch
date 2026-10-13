import { View } from 'react-native';
import { useState, type ComponentProps } from 'react';
import { NativePaper } from './NativePaper';
import { AiWaitingPolaroid } from '../ai/AiWaitingPolaroid';
import { aiRun } from '../ai/uiState';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { PaperTexture } from '../drawing/PaperTexture';
import { fittedPaper, paperLifted } from '../drawing/paperGeometry';
import { drawingPaper } from '../drawing/paperSpace';
import type { useDrawingProduct } from '../product/useDrawingProduct';

const paperSlot = { flex: 1, minWidth: 0, minHeight: 0 } as const;
const paperCorner = { position: 'absolute', pointerEvents: 'box-none' } as const;

// The paper, with the waiting print pinned over its corner while an AI picture
// is minimized. The slot fills the screen around the fitted paper, so the print
// is framed by the same fit NativePaper draws at rather than by the slot. Like
// shipping's canvas container, the slot wears the paper's own grain wherever the
// sheet fills it, and a flat margin tone around a sheet lifted by rotation.
export function RsdPaperSlot({
  ai,
  ...paper
}: ComponentProps<typeof NativePaper> & { ai: ReturnType<typeof useDrawingProduct>['ai'] }) {
  const { paperMargin } = useDrawingTheme();
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const run = ai.state?.open && ai.state.minimized ? aiRun(ai.state) : null;
  const frame = fittedPaper(space, drawingPaper(paper.screen.history.drawing));
  const lifted = paperLifted(space, frame);
  return (
    <View
      testID="rsd-paper-slot"
      style={[paperSlot, lifted && { backgroundColor: paperMargin }]}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setSpace((previous) =>
          previous.width === width && previous.height === height ? previous : { width, height }
        );
      }}
    >
      {lifted ? null : <PaperTexture />}
      <NativePaper {...paper} />
      {run && ai.owner ? (
        <View testID="rsd-paper-corner" style={[paperCorner, frame]}>
          <AiWaitingPolaroid run={run} progress={ai.progress} onRestore={ai.owner.restore} />
        </View>
      ) : null}
    </View>
  );
}
