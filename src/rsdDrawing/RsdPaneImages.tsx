import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

type ImageBox = Pick<ViewStyle, 'left' | 'top' | 'width' | 'height'>;
type PaneSource = { uri: string; image: ImageBox };
type PaneImage = PaneSource & { box: ImageBox; fallback: PaneSource };
type PaneBatch = { key: number; panes: readonly PaneImage[] };

const styles = StyleSheet.create({
  clip: { position: 'absolute', overflow: 'hidden' },
  image: { position: 'absolute' },
});

function PaneImageHost({
  pane,
  visible,
  onSettled,
}: {
  pane: PaneImage;
  visible: boolean;
  onSettled: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const { uri, image } = failed ? pane.fallback : pane;
  const settleSource = (error: boolean) => {
    if (error && uri !== pane.fallback.uri) {
      setFailed(true);
    } else onSettled();
  };
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.clip, pane.box]}
    >
      <Image
        key={failed ? 'fallback' : 'primary'}
        testID={visible ? 'rsd-glass-pane' : 'rsd-glass-pane-pending'}
        source={{ uri }}
        resizeMode="stretch"
        fadeDuration={0}
        onLoad={() => settleSource(false)}
        onError={() => settleSource(true)}
        style={[styles.image, image, { opacity: visible ? 1 : 0 }]}
      />
    </View>
  );
}

function PaneImages({
  batch,
  visible,
  onSettled,
}: {
  batch: PaneBatch;
  visible: boolean;
  onSettled: (batch: PaneBatch) => void;
}) {
  const settled = useRef(new Set<number>());
  const settle = (index: number) => {
    settled.current.add(index);
    if (settled.current.size === batch.panes.length) onSettled(batch);
  };
  return batch.panes.map((pane, index) => (
    <PaneImageHost key={index} pane={pane} visible={visible} onSettled={() => settle(index)} />
  ));
}

// Encoded PNG readiness precedes native Image readiness. Retain the whole displayed set, including
// its geometry, until replacement hosts load or fail; promotion preserves those same hosts.
export function RsdPaneImages({ panes }: { panes: readonly PaneImage[] }) {
  const serial = useRef(0);
  const candidate = useMemo(() => ({ key: serial.current++, panes }), [panes]);
  const [displayed, setDisplayed] = useState(candidate);
  const current = useRef<PaneBatch | undefined>(candidate);
  useLayoutEffect(() => {
    current.current = candidate;
    if (!candidate.panes.length || !displayed.panes.length) setDisplayed(candidate);
    return () => {
      current.current = undefined;
    };
  }, [candidate, displayed.panes.length]);
  const batches = displayed === candidate ? [displayed] : [displayed, candidate];
  return batches.map((batch) => (
    <PaneImages
      key={batch.key}
      batch={batch}
      visible={batch === displayed}
      onSettled={(settled) => {
        if (settled === current.current) setDisplayed(settled);
      }}
    />
  ));
}
