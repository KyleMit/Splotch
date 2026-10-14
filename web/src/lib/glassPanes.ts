import {
  ACTION_BUTTON_GAP,
  DRAWER_TOGGLE_SIZE,
  PHONE_TOOLBAR_GAP_PX,
  PANEL_INSET,
  shownActionButtonCount,
  renderedActionButtonSize,
  renderedFlyoutOptionSize,
} from './actionButtonLayout';
import { layoutState } from './state/layout.svelte';
import { actionControlShown, enabledOptionalBrushes } from './state/settings.svelte';
import { STROKE_SIZES } from './state/strokeWidth.svelte';
import { fullscreenState } from './state/fullscreen.svelte';
import { BARE_RAIL_WIDTH_PX, BARE_RAIL_HEIGHT_PX } from './bareToolbar';
import { COLOR_MENU_GEOMETRY } from './design/trimGeometry';
import { LANDSCAPE_COLORS } from './landscapeToolbar';
import { glassPanes, type OpenFlyout, type Pane } from './glassPaneGeometry';

export type { OpenFlyout } from './glassPaneGeometry';

export function toolbarGlassPanes(open: OpenFlyout, expanded: boolean): Pane[] {
  return glassPanes(
    {
      width: layoutState.viewportWidth,
      height: layoutState.viewportHeight,
      safe: layoutState.safeArea,
      orientation: layoutState.orientation,
      compact: layoutState.phoneLandscape,
      railWidth: BARE_RAIL_WIDTH_PX,
      railHeight: BARE_RAIL_HEIGHT_PX,
      panelInset: PANEL_INSET,
      buttonGap: ACTION_BUTTON_GAP,
      compactGap: PHONE_TOOLBAR_GAP_PX,
      toggleSize: DRAWER_TOGGLE_SIZE,
      count: shownActionButtonCount(),
      size: renderedActionButtonSize(),
      optionSize: renderedFlyoutOptionSize(),
      brushOptions: enabledOptionalBrushes().length + 1,
      strokeOptions: STROKE_SIZES.length,
      stroke: actionControlShown('strokeWidthControlEnabled'),
      fullscreen: fullscreenState.supported,
      colorMenu: { ...COLOR_MENU_GEOMETRY, slots: LANDSCAPE_COLORS.length + 1 },
    },
    open,
    expanded
  );
}
