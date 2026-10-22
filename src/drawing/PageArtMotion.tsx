import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Animated, Easing } from '../platform/animated';
import { Svg } from '../platform/svg';
import { keyframeTimeline, keyframeValue } from '../rsdDrawing/keyframeMotion';
import { PageOutline, pageHasOutline, usePageOutlineReady } from './PageOutline';
import { InkAppearanceScope, useInkAppearance, type InkAppearance } from './InkAppearance';
import { useReduceMotion } from './useReduceMotion';
import { artOrientation, type PaperSize } from './paperSpace';
import type { PageId } from './pages';
import {
  PAGE_ART_ENTER_MS,
  PAGE_ART_CALM_MS,
  PAGE_ART_CALM_EASE,
  PAGE_ART_FADE_KEYFRAMES,
  PAGE_ART_SCALE_KEYFRAMES,
} from './pageArtKeyframes';

type Art = InkAppearance & { size: PaperSize; composition: string };

export const PageArtMotion = memo(
  function PageArtMotion({ pageId, size }: { pageId: PageId; size: PaperSize }) {
    const ready = usePageOutlineReady(pageId);
    const hasArt = pageHasOutline(pageId);
    const { theme } = useInkAppearance();
    const { width, height } = size;
    const art = useMemo<Art | null>(() => {
      if (!hasArt || !ready) return null;
      const paper = { width, height };
      return { pageId, theme, size: paper, composition: `${pageId}:${artOrientation(paper)}` };
    }, [hasArt, ready, pageId, theme, width, height]);
    // Android rasterizes a full-paper SVG even when its page has no outline.
    return art ? <PageArtFrame key={art.composition} art={art} /> : null;
  },
  (previous, next) =>
    previous.pageId === next.pageId &&
    previous.size.width === next.size.width &&
    previous.size.height === next.size.height
);

const PageArtFrame = memo(function PageArtFrame({ art }: { art: Art }) {
  const reduced = useReduceMotion();
  const preference = useRef(reduced);
  const fade = useRef(new Animated.Value(0)).current;
  const pose = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const calm = preference.current;
    fade.setValue(calm ? 1 : 0);
    pose.setValue(calm ? 1 : 0);
    opacity.setValue(calm ? 0 : 1);
    const enter = calm
      ? Animated.timing(opacity, {
          toValue: 1,
          duration: PAGE_ART_CALM_MS,
          easing: Easing.bezier(...PAGE_ART_CALM_EASE),
          useNativeDriver: true,
        })
      : Animated.parallel([
          keyframeTimeline(fade, PAGE_ART_FADE_KEYFRAMES, PAGE_ART_ENTER_MS),
          keyframeTimeline(pose, PAGE_ART_SCALE_KEYFRAMES, PAGE_ART_ENTER_MS),
        ]);
    enter.start();
    return () => enter.stop();
  }, [fade, pose, opacity]);
  return (
    <Animated.View
      testID="page-art-motion"
      pointerEvents="none"
      accessibilityElementsHidden
      style={[
        StyleSheet.absoluteFill,
        {
          opacity: Animated.multiply(
            keyframeValue(fade, PAGE_ART_FADE_KEYFRAMES, (frame) => frame.opacity),
            opacity
          ),
          transform: [
            {
              scale: keyframeValue(pose, PAGE_ART_SCALE_KEYFRAMES, (frame) => frame.scale),
            },
          ],
        },
      ]}
    >
      <InkAppearanceScope.Provider value={art}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${art.size.width} ${art.size.height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <PageOutline pageId={art.pageId} size={art.size} />
        </Svg>
      </InkAppearanceScope.Provider>
    </Animated.View>
  );
});
