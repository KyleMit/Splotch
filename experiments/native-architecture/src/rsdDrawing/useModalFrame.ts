import type { ComponentProps } from 'react';
import { type Modal } from 'react-native';
import { useWindowDimensions } from '../platform/windowDimensions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MODAL_GUTTER_MIN_PX, modalFrame, type ModalFrame, type ModalSize } from './modalGeometry';

// UIKit's default portrait-only modal cannot share the app's landscape rotation lock.
export const FOLLOW_APP_ORIENTATION: ComponentProps<typeof Modal>['supportedOrientations'] = [
  'portrait',
  'portrait-upside-down',
  'landscape',
];

export function useModalFrame(size: ModalSize): ModalFrame {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gutter = Math.max(MODAL_GUTTER_MIN_PX, insets.left, insets.right);
  const frame = modalFrame(size, window, gutter);
  return {
    ...frame,
    maxHeight: Math.min(frame.maxHeight, window.height - insets.top - insets.bottom),
  };
}
