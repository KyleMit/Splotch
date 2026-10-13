import { useEffect, useRef, useState } from 'react';
import {
  createBrushPreferences,
  DEFAULT_BRUSH_AVAILABILITY,
  type BrushPreferencesState,
} from './settings/brushPreferences';
import { brushPreferencesStorage } from './platform/brushPreferences';

export function useBrushPreferences() {
  const [state, setState] = useState<BrushPreferencesState>({
    status: 'loading',
    brush: 'pen',
    availability: DEFAULT_BRUSH_AVAILABILITY,
    saved: true,
    message: '',
  });
  const owner = useRef<ReturnType<typeof createBrushPreferences> | null>(null);
  useEffect(() => {
    const current = createBrushPreferences(brushPreferencesStorage, setState);
    owner.current = current;
    void current.load();
    return () => {
      current.dispose();
      if (owner.current === current) owner.current = null;
    };
  }, []);
  return { state, owner };
}
