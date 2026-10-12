import type { AiResult } from '../ai/journal';

export async function shareAiPicture(_picture: AiResult, _isCurrent: () => boolean): Promise<void> {
  throw new Error(
    'AI picture sharing requires native secure storage and is unavailable on the web.'
  );
}
