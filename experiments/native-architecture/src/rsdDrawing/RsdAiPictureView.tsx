import { html } from 'react-strict-dom';
import { RsdAction } from './controls';
import type { AiState, NativeAiOwner } from '../ai/generation';
import type { AiResult } from '../ai/journal';
import { AiPictureViewport } from '../ai/AiPictureViewport';

export function RsdAiPictureView({
  owner,
  state,
  picture,
}: {
  owner: NativeAiOwner;
  state: AiState;
  picture: AiResult;
}) {
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
      <AiPictureViewport key={picture.uri} picture={picture} />
    </>
  );
}
