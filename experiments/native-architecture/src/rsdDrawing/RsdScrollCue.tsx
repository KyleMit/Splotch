import { useState, type ReactNode } from 'react';
import { ScrollView, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { css, html } from 'react-strict-dom';
import { motion } from './tokens.css';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { rgba } from './colorMix';

// ScrollCue.svelte's defaults, exported for native-design-primitives-drift.test.mjs, which reads
// each from shipping. The fade is deep enough to thin the cut-off line under it rather than hide
// it, and turns opaque only in its bottom fifth so a line under it stays readable.
export const SCROLL_CUE_HEIGHT_PX = 72;
export const SCROLL_CUE_OPAQUE_FROM_PERCENT = 80;
// Fractional layout can leave the true end a sub-pixel past the viewport, which would keep the
// cue from ever retiring; this much of the end counts as reached.
export const SCROLL_CUE_END_SLACK_PX = 2;
// One report a frame keeps the cue in step with the finger without flooding the bridge.
const SCROLL_REPORT_INTERVAL_MS = 16;

const styles = css.create({
  frame: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 0,
  },
  cue: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCROLL_CUE_HEIGHT_PX,
    pointerEvents: 'none',
    transitionProperty: 'opacity',
    transitionDuration: motion.durationBase,
    transitionTimingFunction: motion.easeGlide,
  },
  fade: (backgroundImage: string) => ({ backgroundImage }),
  retired: { opacity: 0 },
});

// Painted from the surface's own channels so a dark sheet gets a dark fade; the clear end is a
// zero-alpha surface rather than `transparent`, which some engines interpolate through gray.
function fadeOver(surface: string) {
  return `linear-gradient(to bottom, ${rgba(surface, 0)}, ${rgba(surface, 1)} ${SCROLL_CUE_OPAQUE_FROM_PERCENT}%)`;
}

type Extent = { viewport: number; content: number; offset: number };

function reachedEnd({ viewport, content, offset }: Extent) {
  return offset + viewport >= content - SCROLL_CUE_END_SLACK_PX;
}

// A bounded scroller whose bottom edge fades while more content lies below, and clears once the
// end is reached. The fade is decoration only: hidden from assistive technology and from touches.
export function RsdScrollCue({ children }: { children: ReactNode }) {
  const surface = useDrawingTheme().surface;
  const [extent, setExtent] = useState<Extent>({ viewport: 0, content: 0, offset: 0 });
  const update = (next: Partial<Extent>) => setExtent((current) => ({ ...current, ...next }));
  const onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) =>
    update({ offset: nativeEvent.contentOffset.y });
  return (
    <html.div style={styles.frame}>
      <ScrollView
        scrollEventThrottle={SCROLL_REPORT_INTERVAL_MS}
        onScroll={onScroll}
        onLayout={({ nativeEvent }) => update({ viewport: nativeEvent.layout.height })}
        onContentSizeChange={(_, height) => update({ content: height })}
      >
        {children}
      </ScrollView>
      <html.div
        aria-hidden
        data-testid="scroll-cue"
        style={[styles.cue, styles.fade(fadeOver(surface)), reachedEnd(extent) && styles.retired]}
      />
    </html.div>
  );
}
