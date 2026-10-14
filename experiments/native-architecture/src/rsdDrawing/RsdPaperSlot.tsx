import { View, useWindowDimensions } from 'react-native';
import { css, html } from 'react-strict-dom';
import { useState, type ComponentProps } from 'react';
import { NativePaper } from './NativePaper';
import { AiWaitingPolaroid } from './drawingSheets';
import { RsdSurfaceBoundary } from './RsdSurfaceBoundary';
import { aiCornerFace, aiRun } from '../ai/uiState';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { PaperTexture } from '../drawing/PaperTexture';
import { fittedPaper, paperLifted } from '../drawing/paperGeometry';
import { drawingPaper } from '../drawing/paperSpace';
import type { useDrawingProduct } from '../product/useDrawingProduct';
import { colors } from './tokens.css';

const paperSlot = { flex: 1, minWidth: 0, minHeight: 0 } as const;
const paperCorner = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'box-none',
} as const;

// The themed float shadow, whose dark value carries the hairline that edges a lifted sheet
// against the night margin, as shipping's .paper-lifted does. It sits under the opaque sheet.
const styles = css.create({
  lift: (left: number, top: number, width: number, height: number) => ({
    position: 'absolute',
    left,
    top,
    width,
    height,
    boxShadow: colors.floatShadow,
    pointerEvents: 'none',
  }),
});

// The paper, with the waiting print pinned over the slot's top-left corner while an AI picture
// is minimized, where shipping pins it beside the Color Palette. Like
// shipping's canvas container, the slot wears the paper's own grain wherever the
// sheet fills it, and a flat margin tone around a sheet lifted by rotation.
export function RsdPaperSlot({
  ai,
  ...paper
}: ComponentProps<typeof NativePaper> & { ai: ReturnType<typeof useDrawingProduct>['ai'] }) {
  const { paperMargin } = useDrawingTheme();
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const run = ai.state?.open && ai.state.minimized ? aiRun(ai.state) : null;
  const window = useWindowDimensions();
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
      {lifted ? (
        <html.div
          data-testid="rsd-paper-lift"
          style={styles.lift(frame.left, frame.top, frame.width, frame.height)}
        />
      ) : (
        <PaperTexture />
      )}
      <NativePaper {...paper} />
      {run && ai.owner && ai.state ? (
        <View testID="rsd-paper-corner" style={paperCorner}>
          <RsdSurfaceBoundary>
            <AiWaitingPolaroid
              run={run}
              face={aiCornerFace(ai.state)}
              portrait={window.height >= window.width}
              progress={ai.progress}
              onRestore={ai.owner.restore}
            />
          </RsdSurfaceBoundary>
        </View>
      ) : null}
    </View>
  );
}
