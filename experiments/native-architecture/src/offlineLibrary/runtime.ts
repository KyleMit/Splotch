import { createFullLibrary } from './fullLibrary';

// The native apps carry the controller in their one bundle; runtime.web.ts defers it.
export const offlineLibrary = createFullLibrary();
