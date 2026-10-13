import { useEffect, useRef, useState } from 'react';
import { aiPictureSharePresentation, shareAiPicture } from '../platform/aiShare';
import type { AiState } from './generation';
import type { AiResult } from './journal';

function currentSelection(state: AiState, picture: AiResult) {
  return (
    state.open &&
    state.authorized &&
    !state.gate.open &&
    [state.heldResult, state.journal?.result, ...state.pictures].some(
      (value) => value?.uri === picture.uri && value.mime === picture.mime
    )
  );
}

export function useAiPictureShare(state: AiState, picture: AiResult) {
  const mounted = useRef(false);
  const lease = useRef<object | null>(null);
  const current = useRef({ state, picture, epoch: {} });
  const active = currentSelection(state, picture);
  const samePicture =
    current.current.picture.uri === picture.uri && current.current.picture.mime === picture.mime;
  current.current = { state, picture, epoch: active && samePicture ? current.current.epoch : {} };
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ epoch: object; text: string } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current = { ...current.current, epoch: {} };
    };
  }, []);
  return {
    label: aiPictureSharePresentation.label,
    busy,
    message: active && notice?.epoch === current.current.epoch ? notice.text : '',
    async share() {
      if (
        !mounted.current ||
        lease.current ||
        !active ||
        current.current.picture.uri !== picture.uri ||
        current.current.picture.mime !== picture.mime
      )
        return;
      const epoch = current.current.epoch;
      if (
        !state.pictures.some((value) => value.uri === picture.uri && value.mime === picture.mime)
      ) {
        setNotice({ epoch, text: 'Save this AI picture before sharing it.' });
        return;
      }
      const token = {};
      lease.current = token;
      setBusy(true);
      setNotice(null);
      const isCurrent = () => {
        const latest = current.current;
        return (
          mounted.current &&
          lease.current === token &&
          latest.epoch === epoch &&
          latest.picture.uri === picture.uri &&
          latest.picture.mime === picture.mime &&
          currentSelection(latest.state, picture)
        );
      };
      try {
        await shareAiPicture(picture, isCurrent);
        if (isCurrent()) setNotice({ epoch, text: aiPictureSharePresentation.complete });
      } catch (error) {
        if (isCurrent())
          setNotice({
            epoch,
            text: error instanceof Error ? error.message : 'AI picture sharing did not finish.',
          });
      } finally {
        if (lease.current === token) {
          lease.current = null;
          if (mounted.current) setBusy(false);
        }
      }
    },
  };
}
