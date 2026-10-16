import { createContext, useContext, useMemo } from 'react';
import {
  LEGACY_PAPER,
  paperBounds,
  paperProjection,
  type PaperProjection,
  type PaperReference,
} from './paperSpace';

// Artwork previews without a drawing retain the canonical legacy coordinate space.
export const InkPaperScope = createContext<PaperReference | PaperProjection>(LEGACY_PAPER);
export function useInkProjection(): PaperProjection {
  const value = useContext(InkPaperScope);
  return useMemo(() => ('paper' in value ? value : paperProjection(value)), [value]);
}
export function useInkPaper(): PaperReference {
  return useInkProjection().paper;
}
export function useInkBounds() {
  return paperBounds(useInkProjection());
}
