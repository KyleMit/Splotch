import {
  CUSTOM_SWATCH,
  isCustomColor,
  isPaintColor,
  rememberColor,
  type PaintColor,
} from '../drawing/palette';
import type { PreferenceActionContext } from './soundSettings';

// Paint changes stay in the session, so a selection lands even during a settings write.
export function createPaintActions({
  getState,
  isDisposed,
  publish,
}: Pick<PreferenceActionContext, 'getState' | 'isDisposed' | 'publish'>) {
  return {
    setColor(selectedColor: PaintColor) {
      const state = getState();
      if (isDisposed() || state.status === 'loading') return;
      if (!isPaintColor(selectedColor)) throw new Error('Paint color is invalid.');
      publish({
        ...state,
        selectedColor,
        activeSwatch: isCustomColor(selectedColor) ? CUSTOM_SWATCH : selectedColor,
        customColors: isCustomColor(selectedColor)
          ? rememberColor(state.customColors, selectedColor)
          : state.customColors,
      });
    },
    selectCustomPaint() {
      const state = getState();
      if (isDisposed() || state.status === 'loading') return;
      publish({
        ...state,
        activeSwatch: CUSTOM_SWATCH,
        selectedColor: state.customColors[0] ?? state.selectedColor,
      });
    },
  };
}
