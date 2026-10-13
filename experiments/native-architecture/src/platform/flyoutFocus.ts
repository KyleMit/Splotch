// Android and iOS have no Escape key to close a flyout and no keyboard focus to hand back; the web
// build does both (flyoutFocus.web.ts).
export function useFlyoutEscape(_active: boolean, _onEscape: () => void) {}

export function refocusFlyoutTrigger(_menu: unknown, _trigger: unknown) {}
