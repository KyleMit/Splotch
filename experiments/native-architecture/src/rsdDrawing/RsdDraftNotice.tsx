import { html } from 'react-strict-dom';
import type { useDrawingScreen } from '../useDrawingScreen';
import { useDraftNotice } from '../product/useDraftNotice';
import { RsdAction } from './controls';

export function RsdDraftNotice({
  screen,
  blocked,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  blocked: boolean;
}) {
  const draft = useDraftNotice(screen, blocked);
  return (
    <>
      {draft.state.message ? <html.span aria-live="polite">{draft.state.message}</html.span> : null}
      {draft.state.status === 'failed' ? (
        <RsdAction label="Retry draft recovery" disabled={draft.disabled} onClick={draft.retry} />
      ) : null}
    </>
  );
}
