import { useRef, useState, type ReactNode, type Ref } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { ScrollView } from '../platform/ScrollView';
import { css, html } from 'react-strict-dom';
import { motion } from './tokens.css';
import { useDrawingTheme, useScrollIndicatorStyle } from '../drawing/DrawingAppearance';
import { rgba } from './colorMix';
import { useDialogSeeThrough } from './dialogScope';

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

// Painted from the surface's own channels so a dark sheet gets a dark fade; the clear end is a
// zero-alpha surface rather than `transparent`, which some engines interpolate through gray.
function fadeOver(surface: string) {
  return `linear-gradient(to bottom, ${rgba(surface, 0)}, ${rgba(surface, 1)} ${SCROLL_CUE_OPAQUE_FROM_PERCENT}%)`;
}

export type ScrollExtent = { viewport: number; content: number; offset: number };
type Inset = { top: number; right: number; bottom: number; left: number };
const AT_REST: ScrollExtent = { viewport: 0, content: 0, offset: 0 };

function reachedEnd({ viewport, content, offset }: ScrollExtent) {
  return offset + viewport >= content - SCROLL_CUE_END_SLACK_PX;
}

// A bounded scroller whose bottom edge fades while more content lies below, and clears once the
// end is reached. The fade is decoration only: hidden from assistive technology and from touches.
// The inset pads the scrolled content, so the fade covers it as shipping's covers the scrollport
// padding; a shallower `cueHeight` suits a pane only a couple of rows tall. `onUserScroll` reports
// a hand on the scroller — a drag natively, a pointer, wheel or key on the web — as distinct from
// a scroll the caller started itself.
export function RsdScrollCue({
  children,
  inset,
  cueHeight = SCROLL_CUE_HEIGHT_PX,
  scrollRef,
  onExtent,
  onUserScroll,
}: {
  children: ReactNode;
  inset?: Inset;
  cueHeight?: number;
  scrollRef?: Ref<ScrollViewInstance>;
  onExtent?: (extent: ScrollExtent) => void;
  onUserScroll?: () => void;
}) {
  const surface = useDrawingTheme().surface;
  const indicatorStyle = useScrollIndicatorStyle();
  const seeThrough = useDialogSeeThrough();
  const extent = useRef(AT_REST);
  const [atEnd, setAtEnd] = useState(true);
  const update = (next: Partial<ScrollExtent>) => {
    extent.current = { ...extent.current, ...next };
    setAtEnd(reachedEnd(extent.current));
    onExtent?.(extent.current);
  };
  const onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) =>
    update({ offset: nativeEvent.contentOffset.y });
  return (
    <html.div
      style={styles.frame}
      onPointerDown={onUserScroll}
      onWheel={onUserScroll}
      onKeyDown={onUserScroll}
    >
      <ScrollView
        ref={scrollRef}
        indicatorStyle={indicatorStyle}
        scrollEventThrottle={SCROLL_REPORT_INTERVAL_MS}
        contentContainerStyle={
          inset && {
            paddingTop: inset.top,
            paddingRight: inset.right,
            paddingBottom: inset.bottom,
            paddingLeft: inset.left,
          }
        }
        onScroll={onScroll}
        onScrollBeginDrag={onUserScroll}
        onLayout={({ nativeEvent }) => update({ viewport: nativeEvent.layout.height })}
        onContentSizeChange={(_, height) => update({ content: height })}
      >
        {children}
      </ScrollView>
      <html.div
        aria-hidden
        data-testid="scroll-cue"
        style={[
          styles.cue,
          styles.fade(fadeOver(surface), cueHeight),
          (atEnd || seeThrough) && styles.retired,
        ]}
      />
    </html.div>
  );
}
