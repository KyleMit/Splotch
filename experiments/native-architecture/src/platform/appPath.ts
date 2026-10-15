import { createAppPages } from '../information/appPages';
const pages = createAppPages();
export const currentAppPage = pages.current;
export const subscribeAppPage = pages.subscribe;
export const openAppPage = pages.open;
export function isDrawingPath() {
  return currentAppPage() === 'drawing';
}
export function setDocumentTitle(_title: string) {}

export function documentTitle() {
  return '';
}
