import { createContext, useContext, type ReactNode } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { resolveAppearance, type AppearancePreference } from '../settings/appearance';
import { DRAWING_THEMES, type DrawingTheme, type PaperTheme } from './theme';

const DrawingAppearance = createContext<PaperTheme>('light');

export function DrawingAppearanceProvider({
  preference,
  children,
}: {
  preference: AppearancePreference;
  children: ReactNode;
}) {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <DrawingAppearance.Provider value={resolveAppearance(preference, system)}>
      {children}
    </DrawingAppearance.Provider>
  );
}

export function useDrawingAppearance(): PaperTheme {
  return useContext(DrawingAppearance);
}

export function DrawingStatusBar() {
  const theme = useDrawingAppearance();
  return <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />;
}

// iOS inks a scroll indicator by the system appearance, so a dark paper under a light system drew
// a dark indicator on its dark surface. A WebView's indicator follows the page's own scheme.
export function useScrollIndicatorStyle() {
  return useDrawingAppearance() === 'dark' ? 'white' : 'black';
}

export function useDrawingTheme(): DrawingTheme {
  return DRAWING_THEMES[useDrawingAppearance()];
}

export function createDrawingStyles<Styles>(
  create: (theme: DrawingTheme) => Styles
): Record<PaperTheme, Styles> {
  return { light: create(DRAWING_THEMES.light), dark: create(DRAWING_THEMES.dark) };
}

export function useDrawingStyles<Styles>(styles: Record<PaperTheme, Styles>): Styles {
  return styles[useDrawingAppearance()];
}
