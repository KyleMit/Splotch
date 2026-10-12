import { html } from 'react-strict-dom';
import { RsdAction } from './controls';
import type { AiState, NativeAiOwner } from '../ai/generation';
import type { AiResult } from '../ai/journal';
import { AiPictureViewport } from '../ai/AiPictureViewport';
import { useAiPictureShare } from '../ai/useAiPictureShare';

export function RsdAiPictureView({
  owner,
  state,
  picture,
}: {
  owner: NativeAiOwner;
  state: AiState;
  picture: AiResult;
}) {
  const share = useAiPictureShare(state, picture);
  return (
    <>
      <html.span aria-live="polite">{state.message}</html.span>
      {owner.hasHeldResult() ? (
        <RsdAction
          label="Retry saving AI picture"
          disabled={state.busy}
          onClick={() => {
            void owner.retryRetention();
          }}
        />
      ) : null}
      <RsdAction
        label={share.label}
        disabled={state.busy || share.busy}
        onClick={() => {
          void share.share();
        }}
      />
      <html.span aria-live="polite">{share.message}</html.span>
      <AiPictureViewport key={picture.uri} picture={picture} />
    </>
  );
}
