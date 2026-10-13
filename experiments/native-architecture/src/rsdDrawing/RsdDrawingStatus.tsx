import { useDraftNotice } from '../product/useDraftNotice';
import type { useDrawingScreen } from '../useDrawingScreen';
import { RsdFailureBanner } from './drawingSheets';
import type { FailureBannerModel } from './RsdFailureBanner';
import { RsdSurfaceBoundary } from './RsdSurfaceBoundary';
import { RsdVisuallyHidden } from './RsdVisuallyHidden';

type Screen = ReturnType<typeof useDrawingScreen>;

// Shipping's generic failure heading; a refused save brings its own.
export const FAILURE_HEADING = 'Something went wrong';
// Words for a renderer fault whose error has already given way to a later notice.
const RENDERER_FAILURE_DETAIL = 'Your picture is still here. Try again to show it.';

// Failures, by type, in the order the banner stacks them. A renderer fault's error is the one
// `screen.failure` holds, so it shows once, with the Retry that clears it.
function failureBanners(
  screen: Screen,
  draft: ReturnType<typeof useDraftNotice>
): FailureBannerModel[] {
  const banners: FailureBannerModel[] = [];
  const { failure, recovery } = screen;
  if (recovery.failed)
    banners.push({
      key: 'renderer',
      heading: FAILURE_HEADING,
      detail: failure?.kind === 'error' ? failure.detail : RENDERER_FAILURE_DETAIL,
      action: { label: 'Retry drawing', disabled: recovery.retryDisabled, onPress: recovery.retry },
    });
  if (draft.state.status === 'failed')
    banners.push({
      key: 'draft',
      heading: FAILURE_HEADING,
      detail: draft.state.message,
      action: { label: 'Retry draft recovery', disabled: draft.disabled, onPress: draft.retry },
    });
  if (failure && !(failure.kind === 'error' && recovery.failed))
    banners.push({
      key: failure.kind,
      heading: failure.kind === 'save' ? failure.heading : FAILURE_HEADING,
      detail: failure.detail,
      onDismiss: screen.dismissFailure,
    });
  return banners;
}

// Shipping shows no status text on the paper. Routine notices are spoken from a visually hidden
// polite region; failures show in the Save Failure Banner, whose words a second region, mounted
// before any failure, speaks. A notice that is an error's own words is the banner's to speak.
export function RsdDrawingStatus({
  screen,
  notice,
  soundNotice,
  blocked,
}: {
  screen: Screen;
  notice: string;
  soundNotice: string;
  blocked: boolean;
}) {
  const draft = useDraftNotice(screen, blocked);
  const banners = failureBanners(screen, draft);
  const routine = [
    screen.failure?.kind === 'error' ? '' : notice,
    soundNotice,
    draft.state.status === 'failed' ? '' : draft.state.message,
  ];
  return (
    <>
      <RsdVisuallyHidden live>{routine.filter(Boolean).join(' ')}</RsdVisuallyHidden>
      <RsdVisuallyHidden live>
        {banners.map(({ heading, detail }) => `${heading}. ${detail}`).join(' ')}
      </RsdVisuallyHidden>
      {banners.length ? (
        <RsdSurfaceBoundary>
          <RsdFailureBanner failures={banners} />
        </RsdSurfaceBoundary>
      ) : null}
    </>
  );
}
