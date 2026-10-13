import { View } from 'react-native';
import type { ComponentProps } from 'react';
import { NativePaper } from './NativePaper';
import { AiWaitingPolaroid } from '../ai/AiWaitingPolaroid';
import { aiRun } from '../ai/uiState';
import type { useDrawingProduct } from '../product/useDrawingProduct';

const paperSlot = { flex: 1, minWidth: 0, minHeight: 0 } as const;

// The paper, with the waiting print pinned over its corner while an AI picture
// is minimized.
export function RsdPaperSlot({
  ai,
  ...paper
}: ComponentProps<typeof NativePaper> & { ai: ReturnType<typeof useDrawingProduct>['ai'] }) {
  const run = ai.state?.open && ai.state.minimized ? aiRun(ai.state) : null;
  return (
    <View style={paperSlot}>
      <NativePaper {...paper} />
      {run && ai.owner ? (
        <AiWaitingPolaroid run={run} progress={ai.progress} onRestore={ai.owner.restore} />
      ) : null}
    </View>
  );
}
