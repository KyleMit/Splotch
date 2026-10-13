import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Svg, { Image as SvgImage } from 'react-native-svg';
import { CRAYON_TILE_PX } from './crayon';
import { PNG_TIMEOUT_MS } from './svgCapture';
import { createCrayonTileResources, type CrayonTileResources } from './crayonTiles';
import type { Stroke } from './model';
import type { PaintColor } from './palette';

export const CrayonTileResourceScope = createContext<CrayonTileResources | null>(null);

export function useCrayonTileResources(
  strokes: readonly Stroke[],
  theme: 'light' | 'dark',
  selected?: PaintColor
) {
  const inherited = useContext(CrayonTileResourceScope);
  const [resources] = useState(() => createCrayonTileResources());
  return resources(strokes, theme, selected, inherited);
}

export function useCrayonTileReadiness(uris: readonly string[], onError: (error: unknown) => void) {
  const uniqueUris = [...new Set(uris)];
  const previous = useRef<readonly string[]>([]);
  if (
    previous.current.length !== uniqueUris.length ||
    uniqueUris.some((uri, index) => previous.current[index] !== uri)
  )
    previous.current = uniqueUris;
  const tiles = previous.current;
  const [native, setNative] = useState<ReadonlySet<string>>(new Set());
  const [svg, setSvg] = useState<ReadonlySet<string>>(new Set());
  const current = useRef({ tiles, onError, active: true });
  current.current.tiles = tiles;
  current.current.onError = onError;
  const ready = tiles.every(
    (uri) => native.has(uri) && (Platform.OS === 'android' || svg.has(uri))
  );
  useEffect(() => {
    current.current.active = true;
    return () => {
      current.current.active = false;
    };
  }, []);
  useEffect(() => {
    setNative((loaded) => new Set(tiles.filter((uri) => loaded.has(uri))));
    setSvg((loaded) => new Set(tiles.filter((uri) => loaded.has(uri))));
  }, [tiles]);
  useEffect(() => {
    if (ready) return;
    const timeout = setTimeout(() => {
      if (current.current.active && current.current.tiles === tiles)
        current.current.onError(
          new Error('The Crayon texture did not load. Your saved drawing is unchanged.')
        );
    }, PNG_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [tiles, ready]);
  const valid = () => current.current.active && current.current.tiles === tiles;
  return {
    ready,
    decode: (
      <View style={styles.decode} pointerEvents="none" accessible={false}>
        {tiles.map((uri) => (
          <Image
            key={uri}
            source={{ uri }}
            style={styles.native}
            onLoad={() => {
              if (valid())
                setNative((loaded) => (loaded.has(uri) ? loaded : new Set([...loaded, uri])));
            }}
            onError={() => {
              if (valid())
                current.current.onError(new Error('The Crayon texture could not be decoded.'));
            }}
          />
        ))}
        <Svg width={CRAYON_TILE_PX} height={CRAYON_TILE_PX}>
          {tiles.map((uri) => (
            <SvgImage
              key={uri}
              href={uri}
              width={CRAYON_TILE_PX}
              height={CRAYON_TILE_PX}
              onLoad={() => {
                if (valid())
                  setSvg((loaded) => (loaded.has(uri) ? loaded : new Set([...loaded, uri])));
              }}
            />
          ))}
        </Svg>
      </View>
    ),
  };
}
const styles = StyleSheet.create({
  decode: {
    position: 'absolute',
    left: -CRAYON_TILE_PX * 2,
    width: CRAYON_TILE_PX,
    height: CRAYON_TILE_PX,
    opacity: 0,
  },
  native: { position: 'absolute', width: CRAYON_TILE_PX, height: CRAYON_TILE_PX },
});
