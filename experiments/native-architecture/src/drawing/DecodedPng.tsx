import { useEffect, useMemo, useRef } from 'react';
import { Image, Platform, StyleSheet } from 'react-native';
import type { PaperSize } from './paperSpace';

export function DecodedPng({
  base64,
  size,
  onLoad,
  onError,
}: {
  base64: string;
  size: PaperSize;
  onLoad: () => void;
  onError: (error: Error) => void;
}) {
  const source = useMemo(() => ({ uri: `data:image/png;base64,${base64}` }), [base64]);
  const current = useRef(source);
  current.current = source;
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  if (Platform.OS !== 'android') return null;
  return (
    <Image
      source={source}
      style={styles.decoded}
      resizeMethod="none"
      accessible={false}
      onLoad={({ nativeEvent }) => {
        if (!active.current || current.current !== source) return;
        const image = nativeEvent.source;
        if (
          image?.uri !== source.uri ||
          image.width !== size.width ||
          image.height !== size.height
        ) {
          onError(new Error('The prepared picture has an unexpected image or sampling grid.'));
          return;
        }
        onLoad();
      }}
      onError={() => {
        if (active.current && current.current === source)
          onError(new Error('The prepared picture could not be decoded.'));
      }}
    />
  );
}

const styles = StyleSheet.create({
  decoded: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
