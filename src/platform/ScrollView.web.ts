import type { ComponentPropsWithRef } from 'react';
import type { ScrollView as NativeScrollView } from 'react-native';
import { lazySurface } from '../rsdDrawing/lazySurface';

export type ScrollView = NativeScrollView;

// Metro resolves .ts before .tsx, so both facades use .ts for this web boundary to win.
// One async entry keeps optional bodies' unchanged RN Web scroller out of startup
// (check-native-web-startup.mjs).
export const ScrollView = lazySurface<ComponentPropsWithRef<typeof NativeScrollView>>(() =>
  import('./ScrollViewContent.web').then((module) => module.ScrollView)
);
