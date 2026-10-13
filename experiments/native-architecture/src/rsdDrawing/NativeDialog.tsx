import { DrawingModal as Modal } from '../platform/DrawingModal';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { darkTheme } from './tokens.css';
import { fontTheme } from './fontTheme';
import { createDrawingStyles, useDrawingStyles } from '../drawing/DrawingAppearance';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { DRAWING_SCALE } from '../drawing/theme';
import { NativeFrame } from './NativeFrame';
import { html } from 'react-strict-dom';
import { styles as controlStyles } from './controls';

export function NativeDialog({
  visible,
  label,
  onClose,
  onDismiss,
  footer,
  children,
}: {
  visible: boolean;
  label: string;
  onClose: () => void;
  onDismiss?: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const styles = useDrawingStyles(themedStyles);
  const theme = useDrawingAppearance();
  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      visible={visible}
      animationType="none"
      accessibilityLabel={label}
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <NativeFrame>
        <html.div style={[controlStyles.themeRoot, fontTheme, theme === 'dark' && darkTheme]}>
          <ScrollView
            testID="rsd-dialog-viewport"
            accessibilityLabel={`${label} options`}
            accessible={false}
            style={styles.viewport}
            contentContainerStyle={styles.content}
            removeClippedSubviews={false}
          >
            {children}
          </ScrollView>
          <View testID="rsd-dialog-footer" accessible={false} style={styles.footer}>
            {footer}
          </View>
        </html.div>
      </NativeFrame>
    </Modal>
  );
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    viewport: { flex: 1, minHeight: 0 },
    content: { flexGrow: 1 },
    footer: {
      flexShrink: 0,
      padding: DRAWING_SCALE.space4,
      backgroundColor: palette.surface,
    },
  })
);
