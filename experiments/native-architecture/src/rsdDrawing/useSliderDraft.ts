import { useRef, useState } from 'react';

export type SliderDraft = {
  value: number;
  active: boolean;
  onInput: (value: number) => void;
  onActiveChange: (active: boolean) => void;
};

// A drag passes through many values, and the settings owner writes each choice and drops any made
// while a write is pending. So the drag moves a draft that previews live, and the value the hand
// settles on is written once, when the drag or key press ends.
export function useSliderDraft(saved: number, save: (value: number) => void): SliderDraft {
  const [draft, setDraft] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const latest = useRef<number | null>(null);
  return {
    value: draft ?? saved,
    active,
    onInput: (value) => {
      latest.current = value;
      setDraft(value);
    },
    onActiveChange: (next) => {
      setActive(next);
      if (next) return;
      const settled = latest.current;
      latest.current = null;
      setDraft(null);
      if (settled !== null && settled !== saved) save(settled);
    },
  };
}
