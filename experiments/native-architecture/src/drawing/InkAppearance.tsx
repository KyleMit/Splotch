import { createContext, useContext } from 'react';
import type { PageId } from './pages';
import type { PaperTheme } from './theme';

export type InkAppearance = Readonly<{ pageId: PageId; theme: PaperTheme }>;
export const InkAppearanceScope = createContext<InkAppearance | null>(null);

export function useInkAppearance(): InkAppearance {
  const appearance = useContext(InkAppearanceScope);
  if (!appearance) throw new Error('Ink requires the current paper appearance.');
  return appearance;
}
