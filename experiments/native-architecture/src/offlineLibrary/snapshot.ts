import type { ArtworkMap } from './artworkContext';
import type { LibraryFaultCode } from './contract';
import type { OfflineBookId, Pack } from './manifest';

export type LibrarySnapshot = Readonly<{
  status: 'loading' | 'ready' | 'downloading' | 'waiting' | 'failed' | 'removing';
  installed: readonly Pack[];
  // Whether an inventory of the installed books has ever completed. Neither a failed inventory
  // nor Retry's 'ready' before its new inventory runs counts, so `installed` is only known when
  // this is true.
  inventoried: boolean;
  artwork: ArtworkMap;
  enabled: boolean;
  allowMetered: boolean;
  activeBook: OfflineBookId | null;
  completedBytes: number;
  totalBytes: number;
  retainedBytes: number;
  fault: LibraryFaultCode | null;
  message: string;
}>;

export const initialLibrarySnapshot: LibrarySnapshot = {
  status: 'loading',
  installed: [],
  inventoried: false,
  artwork: {},
  enabled: true,
  allowMetered: false,
  activeBook: null,
  completedBytes: 0,
  totalBytes: 0,
  retainedBytes: 0,
  fault: null,
  message: '',
};

export const LIBRARY_UNAVAILABLE_MESSAGE =
  'The coloring download did not finish. Your installed books are safe.';
