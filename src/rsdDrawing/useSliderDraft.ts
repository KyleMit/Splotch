import { useEffect, useRef, useState } from 'react';

export type SliderDraft = {
  value: number;
  active: boolean;
  onInput: (value: number) => void;
  onActiveChange: (active: boolean) => void;
};

// What a slider plays while it is held, as shipping's Volume loops the pencil at the level being
// set: begun when a drag or key press starts, updated with each value, ended when it lets go.
export type SliderPreview = {
  begin: (value: number) => void;
  update: (value: number) => void;
  end: () => void;
};

// A drag passes through many values, and the settings owner writes each choice and drops any made
// while a Parent Center save holds the record. So the drag moves a draft that previews live, and
// the value the hand settles on is held until the owner is ready to write it, then written once.
// A nudge made meanwhile is therefore kept rather than dropped, and the slider never locks.
export function useSliderDraft({
  saved,
  ready,
  save,
  preview,
}: {
  saved: number;
  ready: boolean;
  save: (value: number) => void;
  preview?: SliderPreview;
}): SliderDraft {
  const [draft, setDraft] = useState<number | null>(null);
  const [settled, setSettled] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const latest = useRef<number | null>(null);
  const saveLatest = useRef(save);
  useEffect(() => {
    saveLatest.current = save;
  }, [save]);
  useEffect(() => {
    if (settled === null) return;
    if (settled === saved) setSettled(null);
    else if (ready) saveLatest.current(settled);
  }, [settled, saved, ready]);
  const value = draft ?? settled ?? saved;
  return {
    value,
    active,
    onInput: (next) => {
      latest.current = next;
      setDraft(next);
      preview?.update(next);
    },
    onActiveChange: (next) => {
      setActive(next);
      if (next) {
        preview?.begin(value);
        return;
      }
      preview?.end();
      const chosen = latest.current;
      latest.current = null;
      setDraft(null);
      if (chosen !== null) setSettled(chosen);
    },
  };
}
