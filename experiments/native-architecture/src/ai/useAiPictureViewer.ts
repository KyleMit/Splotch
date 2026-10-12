import { useEffect, useState } from 'react';
import type { AiState } from './generation';

export function useAiPictureViewer(state: AiState, visible: boolean) {
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const active = visible && state.open && state.authorized && !state.gate.open;
  const pictures = [state.heldResult, state.journal?.result, ...state.pictures];
  const picture = active ? (pictures.find((next) => next?.uri === selectedUri) ?? null) : null;
  useEffect(() => {
    if (!active || (selectedUri !== null && !picture)) setSelectedUri(null);
  }, [active, selectedUri, picture]);
  return {
    picture,
    open(uri: string) {
      if (active && pictures.some((next) => next?.uri === uri)) setSelectedUri(uri);
    },
    back: () => setSelectedUri(null),
  };
}
