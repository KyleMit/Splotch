import { createContext } from 'react';
import type { OfflinePageId } from './identity';
import type { PaperTheme } from '../drawing/theme';
import type { ArtOrientation } from '../drawing/paperSpace';
type OfflinePageArtwork = Readonly<{ outline: string; fill: string }>;
type OfflineArtwork = Readonly<
  Record<ArtOrientation, Readonly<Record<PaperTheme, OfflinePageArtwork>>>
>;
export type ArtworkMap = Readonly<Partial<Record<OfflinePageId, OfflineArtwork>>>;
export const OfflineArtworkScope = createContext<ArtworkMap>({});
