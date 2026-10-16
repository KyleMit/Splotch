import type { AppPage } from '../information/appPages';
import { openAppPage } from '../platform/appPath';
import { RsdButton } from './RsdButton';

export type NotFoundLinkProps = {
  page: Extract<AppPage, 'drawing' | 'changelog' | 'privacy'>;
  variant: 'brand' | 'wash';
  children: string;
};

export function RsdNotFoundLink({ page, variant, children }: NotFoundLinkProps) {
  return (
    <RsdButton variant={variant} size="lg" onPress={() => openAppPage(page)}>
      {children}
    </RsdButton>
  );
}
