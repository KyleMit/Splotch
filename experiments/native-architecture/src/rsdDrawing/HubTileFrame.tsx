import type { ReactNode } from 'react';

export type HubTileFrameProps = { onWidth: (width: number) => void; children: ReactNode };

// The web keeps whole hub titles with CSS alone, so the tile needs no measured frame there;
// HubTileFrame.native.tsx reports the native tile's width to the title.
export function HubTileFrame({ children }: HubTileFrameProps) {
  return children;
}
