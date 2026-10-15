import { createLazyExport } from '../lazyExport';

export const browserFolderSave = createLazyExport(() => import('./folderSave.web'));
