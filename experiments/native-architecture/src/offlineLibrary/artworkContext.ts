import { createContext } from 'react';
import type { OfflinePageId } from './identity';
import type { PaperTheme } from '../drawing/theme';
type OfflinePageArtwork = Readonly<{ outline: string; fill: string; selector: string }>;
type OfflineArtwork = Readonly<Record<PaperTheme, OfflinePageArtwork>>;
export type ArtworkMap = Readonly<Partial<Record<OfflinePageId, OfflineArtwork>>>;
export const OfflineArtworkScope = createContext<ArtworkMap>({});
