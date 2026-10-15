import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { PaintColor } from './palette';

export type PaintSelectionTarget = { focus: (isCurrent: () => boolean) => void };

export function usePaintSelectionFocus({
  color,
  disabled,
  blocked,
}: {
  color: PaintColor;
  disabled: boolean;
  blocked: boolean;
}) {
  const request = useRef<{
    color: PaintColor;
    target: PaintSelectionTarget;
    completed: boolean;
  } | null>(null);
  const interaction = useRef(0);
  const foreground = useRef(AppState.currentState === 'active');
  const [completion, setCompletion] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      foreground.current = state === 'active';
      if (!foreground.current) {
        interaction.current++;
        request.current = null;
      }
    });
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a counter, not a rendered node: cleanup bumps its live value to void pending focus returns
      interaction.current++;
      request.current = null;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (blocked) {
      interaction.current++;
      request.current = null;
    }
    const pending = request.current;
    if (disabled || !pending?.completed) return;
    request.current = null;
    if (foreground.current && pending.color === color) {
      let returnedInteraction: number | null = null;
      pending.target.focus(
        () =>
          foreground.current &&
          (returnedInteraction === null || interaction.current === returnedInteraction)
      );
      // Root focus cancellation can run inside target.focus; capture the token afterward.
      returnedInteraction = interaction.current;
    }
  }, [color, disabled, blocked, completion]);
  return {
    cancel() {
      interaction.current++;
      request.current = null;
    },
    choose(
      next: PaintColor,
      target: PaintSelectionTarget | null,
      action: () => Promise<void> | void
    ) {
      if (disabled || blocked || !foreground.current) return;
      interaction.current++;
      const pending = target ? { color: next, target, completed: false } : null;
      request.current = pending;
      return Promise.resolve(action()).then(() => {
        if (pending && request.current === pending) {
          pending.completed = true;
          setCompletion((previous) => previous + 1);
        }
      });
    },
  };
}
