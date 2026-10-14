import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { rgba } from './colorMix';
import { useDialogBody } from './dialogScope';
import { motion } from './tokens.css';

// ScrollCue's fade over the Coloring Book Picker's grid. Deliberately a copy of RsdScrollCue's, not
// an import of it: Settings' lazy chunk already carries RsdScrollCue, and Expo moves every module two
// lazy chunks share into the common chunk index.html loads before first paint
// (tools/migration/check-native-web-startup.mjs). rsd-native-coloring-picker.test.mjs renders both
// and fails when this fade drifts from RsdScrollCue's.
export const COLORING_CUE_HEIGHT_PX = 72;
export const COLORING_CUE_OPAQUE_FROM_PERCENT = 80;
export const COLORING_CUE_END_SLACK_PX = 2;
const SCROLL_REPORT_INTERVAL_MS = 16;

type Extent = { viewport: number; content: number; offset: number };

const styles = css.create({
  frame: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    minHeight: 0,
  },
  cue: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    transitionProperty: 'opacity',
    transitionDuration: motion.durationBase,
    transitionTimingFunction: motion.easeGlide,
  },
  fade: (backgroundImage: string, height: number) => ({ backgroundImage, height }),
  retired: { opacity: 0 },
});

// The grid scrolls inside the card's body inset, its bottom edge fading while more lies below.
export function RsdColoringScroll({ children }: { children: ReactNode }) {
  const body = useDialogBody();
  const surface = useDrawingTheme().surface;
  const extent = useRef<Extent>({ viewport: 0, content: 0, offset: 0 });
  const [atEnd, setAtEnd] = useState(true);
  const update = (next: Partial<Extent>) => {
    extent.current = { ...extent.current, ...next };
    const { viewport, content, offset } = extent.current;
    setAtEnd(offset + viewport >= content - COLORING_CUE_END_SLACK_PX);
  };
  const fade = `linear-gradient(to bottom, ${rgba(surface, 0)}, ${rgba(surface, 1)} ${COLORING_CUE_OPAQUE_FROM_PERCENT}%)`;
  return (
    <html.div style={styles.frame}>
      <ScrollView
        scrollEventThrottle={SCROLL_REPORT_INTERVAL_MS}
        contentContainerStyle={
          body && {
            paddingTop: body.top,
            paddingRight: body.inline,
            paddingBottom: body.bottom,
            paddingLeft: body.inline,
          }
        }
        onScroll={({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) =>
          update({ offset: nativeEvent.contentOffset.y })
        }
        onLayout={({ nativeEvent }) => update({ viewport: nativeEvent.layout.height })}
        onContentSizeChange={(_, height) => update({ content: height })}
      >
        {children}
      </ScrollView>
      <html.div
        aria-hidden
        inert
        data-testid="scroll-cue"
        style={[styles.cue, styles.fade(fade, COLORING_CUE_HEIGHT_PX), atEnd && styles.retired]}
      />
    </html.div>
  );
}
