import { createContext, useContext } from 'react';
import { LEGACY_PAPER, type PaperReference } from './paperSpace';

// Artwork previews without a drawing retain the canonical legacy coordinate space.
export const InkPaperScope = createContext<PaperReference>(LEGACY_PAPER);
export function useInkPaper(): PaperReference {
  return useContext(InkPaperScope);
}
