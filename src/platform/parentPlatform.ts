import type { ParentPlatform } from '../parentCenter/parentPolicy';

// The platform whose store rules bound the Parent Center policies. Metro takes
// parentPlatform.android.ts and parentPlatform.web.ts on those platforms, so this file is the iOS
// build's; type checking and Node tests read it too, where the strictest store rules stand in.
export const PARENT_PLATFORM: ParentPlatform = 'ios';
