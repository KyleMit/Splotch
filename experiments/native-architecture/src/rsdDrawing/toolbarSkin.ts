import { createContext, useContext } from 'react';
import { DEFAULT_TOOLBAR_STYLE, type ToolbarStyle } from '../settings/toolbarStyle';

// The Button style the drawing chrome wears, as shipping stamps html[data-toolbar] for its CSS:
// raised tiles on their own surfaces, or flat ink printed on the paper.
export const ToolbarSkin = createContext<ToolbarStyle>(DEFAULT_TOOLBAR_STYLE);

export function useBareToolbar() {
  return useContext(ToolbarSkin) === 'bare';
}

// Shipping's modal dialog leaves the page behind it inert without greying it: no touch, key or
// assistive press reaches a control there. RsdPressable drops every press inside a region that
// holds this true, so the drawing chrome stays at full strength under a dialog's scrim and still
// refuses to open a menu or run a command.
export const InertRegion = createContext(false);
