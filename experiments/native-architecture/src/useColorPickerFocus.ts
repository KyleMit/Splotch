import { useEffect, useRef } from 'react';
import { AppState, type View } from 'react-native';

export function useColorPickerFocus({
  pickerOpen,
  closePicker,
  disabled,
  blocked,
}: {
  pickerOpen: boolean;
  closePicker: () => void;
  disabled: boolean;
  blocked: boolean;
}) {
  const request = useRef<'closing' | 'waiting' | null>(null);
  const opener = useRef<View>(null);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') request.current = null;
    });
    return () => {
      request.current = null;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (pickerOpen || blocked) {
      request.current = null;
      return;
    }
    if (request.current === 'closing') request.current = 'waiting';
    if (!disabled && request.current === 'waiting') {
      request.current = null;
      opener.current?.focus();
    }
  }, [pickerOpen, disabled, blocked]);
  return {
    opener,
    close() {
      if (pickerOpen) request.current = 'closing';
      closePicker();
    },
    cancel() {
      // Modal cleanup restores focus before the pending return's passive effect.
      if (request.current === 'waiting') request.current = null;
    },
  };
}
