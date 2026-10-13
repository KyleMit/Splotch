import type { ArtworkMap } from './artworkContext';
import type { LibraryFaultCode } from './contract';
import type { OfflineBookId, Pack } from './manifest';

export type LibrarySnapshot = Readonly<{
  status: 'loading' | 'ready' | 'downloading' | 'waiting' | 'failed' | 'removing';
  installed: readonly Pack[];
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
