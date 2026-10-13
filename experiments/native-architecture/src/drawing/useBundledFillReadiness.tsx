import { isOfflinePageId } from '../offlineLibrary/identity';
import { OfflineArtworkScope } from '../offlineLibrary/artworkContext';
import { useContext, useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet } from 'react-native';
import { BUNDLED_BOOK_ART } from './bundledBookAssets';
import { isFarmPageId } from './bundledBooks';
import { useInkAppearance } from './InkAppearance';
import type { InkPlan } from './checkpoints';

export function useBundledFillReadiness(
  plan: Pick<InkPlan, 'strokes'>,
  onError: (error: unknown) => void
) {
  const { pageId, theme } = useInkAppearance();
  const offlineArtwork = useContext(OfflineArtworkScope);
  const fill = isOfflinePageId(pageId)
    ? offlineArtwork[pageId]?.[theme].fill
    : isFarmPageId(pageId)
      ? BUNDLED_BOOK_ART[pageId][theme].fill
      : null;
  const uri = plan.strokes.some((stroke) => stroke.brush === 'magic') ? (fill ?? null) : null;
  const [svgLoaded, setSvgLoaded] = useState<string | null>(null);
  const [nativeLoaded, setNativeLoaded] = useState<string | null>(null);
  const current = useRef({ plan, uri, onError });
  current.current = { plan, uri, onError };
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const isCurrent = () =>
    active.current && current.current.plan === plan && current.current.uri === uri;
  return {
    uri,
    ready: !uri || (nativeLoaded === uri && (Platform.OS === 'android' || svgLoaded === uri)),
    loaded() {
      if (isCurrent()) setSvgLoaded(uri);
    },
    decode: uri ? (
      <Image
        key={`${pageId}:${theme}`}
        source={{ uri }}
        style={styles.decode}
        accessible={false}
        onLoad={() => {
          if (isCurrent()) setNativeLoaded(uri);
        }}
        onError={() => {
          if (isCurrent())
            current.current.onError(
              new Error('The coloring fill did not load. Your saved drawing is unchanged.')
            );
        }}
      />
    ) : null,
  };
}

const styles = StyleSheet.create({
  decode: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
