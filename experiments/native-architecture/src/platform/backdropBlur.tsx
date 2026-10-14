import { Platform, StyleSheet, requireNativeComponent, type ViewProps } from 'react-native';
import type { PaperTheme } from '../drawing/theme';
import type { Bezier } from '../rsdDrawing/modalGeometry';

// RenderEffect, which the Android view blurs with, arrived in Android 12.
const ANDROID_RENDER_EFFECT_API = 31;

// Blur to `radius`, a CSS blur() length, over `durationMs` on the CSS cubic-bezier `easing`. iOS
// tints its blur, and picks the tint that suits the paper `theme`.
export type BackdropBlurTransition = Readonly<{
  radius: number;
  durationMs: number;
  easing: Bezier;
  theme: PaperTheme;
}>;

// SplotchBackdropBlur (ios/HelloWorld/SplotchBackdropBlur.swift, android .../SplotchBackdropBlur.kt).
const NativeBackdropBlur = requireNativeComponent<ViewProps & { blur: BackdropBlurTransition }>(
  'SplotchBackdropBlur'
);

export function backdropBlurAvailable() {
  return (
    Platform.OS === 'ios' ||
    (Platform.OS === 'android' && Number(Platform.Version) >= ANDROID_RENDER_EFFECT_API)
  );
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
