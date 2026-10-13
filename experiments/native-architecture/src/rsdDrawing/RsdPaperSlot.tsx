import { View } from 'react-native';
import { useState, type ComponentProps } from 'react';
import { NativePaper } from './NativePaper';
import { AiWaitingPolaroid } from '../ai/AiWaitingPolaroid';
import { aiRun } from '../ai/uiState';
import { fittedPaper } from '../drawing/paperGeometry';
import type { useDrawingProduct } from '../product/useDrawingProduct';

const paperSlot = { flex: 1, minWidth: 0, minHeight: 0 } as const;
const paperCorner = { position: 'absolute', pointerEvents: 'box-none' } as const;

// The paper, with the waiting print pinned over its corner while an AI picture
// is minimized. The slot fills the screen around the fitted paper, so the print
// is framed by the same fit NativePaper draws at rather than by the slot.
export function RsdPaperSlot({
  ai,
  ...paper
}: ComponentProps<typeof NativePaper> & { ai: ReturnType<typeof useDrawingProduct>['ai'] }) {
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const run = ai.state?.open && ai.state.minimized ? aiRun(ai.state) : null;
  return (
    <View
      style={paperSlot}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setSpace((previous) =>
          previous.width === width && previous.height === height ? previous : { width, height }
        );
      }}
    >
      <NativePaper {...paper} />
      {run && ai.owner ? (
        <View testID="rsd-paper-corner" style={[paperCorner, fittedPaper(space)]}>
          <AiWaitingPolaroid run={run} progress={ai.progress} onRestore={ai.owner.restore} />
        </View>
      ) : null}
    </View>
  );
}
