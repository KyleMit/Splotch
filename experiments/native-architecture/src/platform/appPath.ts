import { createAppPages, type AppLocation } from '../information/appPages';
const pages = createAppPages();
export const currentAppPage: () => AppLocation = pages.current;
// Only the web export prerenders; the native renderer never reads a server snapshot.
export const prerenderedAppPage = (): AppLocation => pages.current();
export const currentAppFragment = pages.fragment;
export const subscribeAppPage = pages.subscribe;
export const openAppPage = pages.open;
export const visitAppFragment = (fragment: string) => pages.open(pages.current(), fragment);
export function setDocumentTitle(_title: string) {
  return '';
}
