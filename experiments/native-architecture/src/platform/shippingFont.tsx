import { useEffect, type ReactNode } from 'react';
import { useFonts } from 'expo-font';
import { Quicksand_400Regular } from '@expo-google-fonts/quicksand/400Regular';
import { Quicksand_600SemiBold } from '@expo-google-fonts/quicksand/600SemiBold';
import { Quicksand_700Bold } from '@expo-google-fonts/quicksand/700Bold';
import type { NativeFontFamily } from './nativeFontFamilies';

const NATIVE_FONT_FILES = {
  Quicksand_400Regular,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} satisfies Record<NativeFontFamily, number>;

// Text laid out before its face registers measures in the system font, so the app waits
// for the bundled faces; a failed load still renders, in the system font.
export function ShippingFontGate({ children }: { children: ReactNode }) {
  const [loaded, error] = useFonts(NATIVE_FONT_FILES);
  useEffect(() => {
    if (error) console.warn('The app font could not be loaded.', error);
  }, [error]);
  return loaded || error ? children : null;
}
