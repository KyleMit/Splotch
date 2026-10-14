import { Platform, StyleSheet, requireNativeComponent, type ViewProps } from 'react-native';
import type { PaperTheme } from '../drawing/theme';
import type { Bezier } from '../rsdDrawing/modalGeometry';

// Blur to `radius`, a CSS blur() length, over `durationMs` on the CSS cubic-bezier `easing`, in the
// tint that suits the paper `theme`.
export type BackdropBlurTransition = Readonly<{
  radius: number;
  durationMs: number;
  easing: Bezier;
  theme: PaperTheme;
}>;

// SplotchBackdropBlur (ios/HelloWorld/SplotchBackdropBlur.swift).
const NativeBackdropBlur = requireNativeComponent<ViewProps & { blur: BackdropBlurTransition }>(
  'SplotchBackdropBlur'
);

// Where shipping's dialog backdrop blurs. Its iOS WebView draws the backdrop-filter; its Android
// WebView draws only the dim, which device captures of shipping show leaving the screen behind
// sharp.
export function backdropBlurs() {
  return Platform.OS === 'ios';
}

// Blurs whatever lies behind the modal it is mounted in, for as long as that modal is open.
export function BackdropBlur({ blur }: { blur: BackdropBlurTransition }) {
  return (
    <NativeBackdropBlur
      testID="modal-backdrop-blur"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      blur={blur}
    />
  );
}
