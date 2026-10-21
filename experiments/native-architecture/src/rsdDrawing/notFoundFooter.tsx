import type { OpenAppPage } from './pageDocumentState';

// Native navigation never reaches a not-found page, so it has no owner for external links.
export function RsdNotFoundFooter(_props: { openAppPage: OpenAppPage }) {
  return null;
}
