import type { Platform } from '$lib/platform';
import type { UnsavedStatus } from '$lib/saveNaming';

export interface SaveFailureCopy {
  heading: string;
  detail: string;
}

const PERMISSION_DETAIL: Record<Exclude<Platform, 'web'>, string> = {
  ios: 'Splotch needs permission to add pictures to Photos. Turn it on in Settings, then try again.',
  android:
    'Splotch needs storage permission to save to your gallery. Turn it on in Settings, then try again.',
};

// Parent-directed and plain (design skill voice rules): what happened, why when it is known, and
// the next step. A picture the banner is not holding cannot be retried, so its copy offers none.
export function saveFailureCopy(
  outcome: UnsavedStatus,
  pictureCount: number,
  platform: Platform
): SaveFailureCopy {
  const heading =
    pictureCount > 1 ? `${pictureCount} pictures weren't saved` : "Your picture wasn't saved";
  if (outcome === 'denied' && platform !== 'web') {
    return { heading, detail: PERMISSION_DETAIL[platform] };
  }
  return {
    heading,
    detail:
      pictureCount > 0
        ? 'Something went wrong while saving. Try again in a moment.'
        : 'Something went wrong while saving it.',
  };
}
