// React Strict DOM's native refs carry no DOM focus(), and a screen reader's focus on Android and
// iOS belongs to the platform's accessibility service, so a page change moves nothing here.
export function landFocus(_element: HTMLElement | null) {}
