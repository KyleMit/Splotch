import { createContext, useContext } from 'react';
import { DEFAULT_TOOLBAR_STYLE, type ToolbarStyle } from '../settings/toolbarStyle';

// The Button style the drawing chrome wears, as shipping stamps html[data-toolbar] for its CSS:
// raised tiles on their own surfaces, or flat ink printed on the paper.
export const ToolbarSkin = createContext<ToolbarStyle>(DEFAULT_TOOLBAR_STYLE);

export function useBareToolbar() {
  return useContext(ToolbarSkin) === 'bare';
}
