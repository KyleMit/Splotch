import { css, html } from 'react-strict-dom';
import { RsdAction } from './controls';
import type { AiState, NativeAiOwner } from '../ai/generation';
import type { AiResult } from '../ai/journal';

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
      <html.img alt="Opened AI picture" src={picture.uri} style={styles.image} />
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
    </>
  );
}

const styles = css.create({ image: { width: '100%', aspectRatio: '1 / 1', objectFit: 'contain' } });
