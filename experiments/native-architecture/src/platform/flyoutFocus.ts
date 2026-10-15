import { useKeyboardCommand } from './KeyboardScope';

export function useFlyoutEscape(active: boolean, onEscape: () => void) {
  useKeyboardCommand('escape', active, onEscape);
}

export function refocusFlyoutTrigger(_menu: unknown, _trigger: unknown) {}
