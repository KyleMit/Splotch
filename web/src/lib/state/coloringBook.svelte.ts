// The catalog lives in a rune-free TypeScript module so build scripts can read it too.
import { pageFillImage, pageOverlayImage, type BookOrientation, type ColoringPage } from './books';
import type { ResolvedTheme } from '../theme';
import { readonlyValue, type DeepReadonly } from './readonlyView';

export interface ColoringBookState {
  readonly overlayPage: DeepReadonly<ColoringPage> | null;
  readonly orientation: BookOrientation;
  setOverlayPage(page: ColoringPage, orientation: BookOrientation): void;
  setOverlayOrientation(orientation: BookOrientation): void;
  clearOverlay(): void;
  hasOverlayPage(): boolean;
  themedOverlayUrl(theme: ResolvedTheme, orientation?: BookOrientation): string | null;
  fillSheetUrl(theme: ResolvedTheme): string | null;
}

export function createColoringBook(): ColoringBookState {
  const s = $state<{ overlayPage: ColoringPage | null; orientation: BookOrientation }>({
    overlayPage: null,
    orientation: 'portrait',
  });

  return {
    get overlayPage() {
      return readonlyValue(s.overlayPage);
    },
    get orientation() {
      return s.orientation;
    },
    setOverlayPage(page, orientation) {
      s.overlayPage = page;
      s.orientation = orientation;
    },
    setOverlayOrientation(orientation) {
      s.orientation = orientation;
    },
    clearOverlay() {
      s.overlayPage = null;
    },
    hasOverlayPage() {
      return s.overlayPage !== null;
    },
    themedOverlayUrl(theme, orientation = s.orientation) {
      return s.overlayPage ? pageOverlayImage(s.overlayPage, orientation, theme) : null;
    },
    fillSheetUrl(theme) {
      return s.overlayPage ? pageFillImage(s.overlayPage, s.orientation, theme) : null;
    },
  };
}

export const coloringBookState = createColoringBook();

export const {
  setOverlayPage,
  setOverlayOrientation,
  clearOverlay,
  hasOverlayPage,
  themedOverlayUrl,
  fillSheetUrl,
} = coloringBookState;
