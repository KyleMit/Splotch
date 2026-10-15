import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { installAppSurface } from './appSurface';

const styles = StyleSheet.create({ root: { flex: 1 } });

export function AppSurfaceRoot({ active, children }: { active: boolean; children: ReactNode }) {
  const release = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      release.current?.();
      release.current = null;
    },
    [active]
  );
  return (
    <View
      style={styles.root}
      onTouchEndCapture={() => {
        if (active && release.current === null) release.current = installAppSurface();
      }}
    >
      {children}
    </View>
  );
}
