import type { AppPage } from '../information/appPages';
import { RsdButton } from './RsdButton';

export type NotFoundLinkProps = {
  page: Extract<AppPage, 'drawing' | 'changelog' | 'privacy'>;
  variant: 'brand' | 'wash';
  // The page's own navigation (usePageNavigation): over the paper, or another document.
  onOpen: (page: AppPage) => void;
  children: string;
};

export function RsdNotFoundLink({ page, variant, onOpen, children }: NotFoundLinkProps) {
  return (
    <RsdButton variant={variant} size="lg" onPress={() => onOpen(page)}>
      {children}
    </RsdButton>
  );
}
